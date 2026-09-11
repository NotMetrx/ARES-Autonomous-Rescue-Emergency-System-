import time
import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
import aiosqlite

from src.database.db import get_db
from src.core.models import (
    LoginRequest, LoginResponse, OperatorInfo,
    CreateMissionRequest, CreateMissionResponse,
    RouteCalculateRequest, RouteCalculateResponse, RouteSegment,
    DispatchResponse,
    TelemetryIngestRequest, TelemetryIngestResponse,
    BenchmarkRequest, BenchmarkResponse
)
from src.api.auth import verify_password, create_access_token, get_current_operator
from src.core.fsm import MissionStatus, DroneStatus, SwarmRole, validate_mission_transition
from src.core.rules import (
    validate_golden_hour, validate_payload_capacity,
    validate_thermal_sensitivity, validate_battery_reserve,
    DomainValidationError
)
from src.ai.trajectory import generate_waypoints, haversine_distance
from src.ai.benchmark import run_simulation_benchmark

router = APIRouter(prefix="/api/v1")

@router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("""
        SELECT o.operator_id, o.username, o.password_hash, o.full_name, o.is_active, r.code AS role
        FROM operators o
        JOIN roles r ON o.role_id = r.role_id
        WHERE o.username = ?
    """, (req.username,))
    row = await cursor.fetchone()

    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Credenciales inválidas"}}
        )

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "USER_DISABLED", "message": "El operador se encuentra inactivo"}}
        )

    token = create_access_token(data={"sub": str(row["operator_id"]), "username": row["username"], "role": row["role"]})
    return LoginResponse(
        token=token,
        token_type="Bearer",
        expires_in_seconds=28800,
        operator=OperatorInfo(
            operator_id=row["operator_id"],
            username=row["username"],
            full_name=row["full_name"],
            role=row["role"]
        )
    )

@router.post("/missions", response_model=CreateMissionResponse, status_code=status.HTTP_201_CREATED)
async def create_mission(
    req: CreateMissionRequest,
    current_op: Dict[str, Any] = Depends(get_current_operator),
    db: aiosqlite.Connection = Depends(get_db)
):
    # Validate priority code
    cursor = await db.execute("SELECT priority_id, max_sla_minutes FROM mission_priority_levels WHERE code = ?", (req.priority_code,))
    priority_row = await cursor.fetchone()
    if not priority_row:
        priority_id = 1
        max_sla = 60
    else:
        priority_id = priority_row["priority_id"]
        max_sla = priority_row["max_sla_minutes"]

    # Validate supplies exist and compute total cargo weight
    total_cargo_weight = 0
    supplies_data = []
    for item in req.supplies:
        cur_sup = await db.execute("SELECT supply_id, unit_weight_grams, name FROM medical_supplies WHERE supply_id = ?", (item.supply_id,))
        sup_row = await cur_sup.fetchone()
        if not sup_row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "INVALID_SUPPLY", "message": "Uno o más IDs de insumos no existen"}}
            )
        weight = sup_row["unit_weight_grams"] * item.quantity
        total_cargo_weight += weight
        supplies_data.append((item.supply_id, item.quantity))

    # Draft status
    cur_status = await db.execute("SELECT status_id FROM mission_statuses WHERE code = 'DRAFT'")
    draft_row = await cur_status.fetchone()
    status_id = draft_row["status_id"] if draft_row else 1

    # Mission code format: MSN-YYYYMMDD-XXXX
    date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    count_cur = await db.execute("SELECT COUNT(*) AS c FROM missions")
    count_row = await count_cur.fetchone()
    seq_num = (count_row["c"] if count_row else 0) + 101
    mission_code = f"MSN-{date_str}-{seq_num:04d}"
    created_at_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Insert mission
    ins_cur = await db.execute("""
        INSERT INTO missions (
            mission_code, priority_id, status_id, created_by_operator_id,
            origin_latitude, origin_longitude, origin_altitude_meters,
            dest_latitude, dest_longitude, dest_altitude_meters,
            scheduled_departure_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        mission_code, priority_id, status_id, current_op["operator_id"],
        req.origin.latitude, req.origin.longitude, req.origin.altitude_meters,
        req.destination.latitude, req.destination.longitude, req.destination.altitude_meters,
        req.scheduled_departure_time, created_at_str
    ))
    mission_id = ins_cur.lastrowid

    # Insert mission supplies
    for sup_id, qty in supplies_data:
        await db.execute("""
            INSERT INTO mission_supplies (mission_id, supply_id, quantity)
            VALUES (?, ?, ?)
        """, (mission_id, sup_id, qty))

    await db.commit()

    return CreateMissionResponse(
        mission_id=mission_id,
        mission_code=mission_code,
        status="DRAFT",
        priority_code=req.priority_code,
        max_sla_minutes=max_sla,
        total_cargo_weight_grams=total_cargo_weight,
        created_at=created_at_str
    )

@router.get("/missions/{mission_id}")
async def get_mission(
    mission_id: int,
    current_op: Dict[str, Any] = Depends(get_current_operator),
    db: aiosqlite.Connection = Depends(get_db)
):
    cur = await db.execute("""
        SELECT m.*, s.code AS status_code, p.code AS priority_code
        FROM missions m
        JOIN mission_statuses s ON m.status_id = s.status_id
        JOIN mission_priority_levels p ON m.priority_id = p.priority_id
        WHERE m.mission_id = ?
    """, (mission_id,))
    mission = await cur.fetchone()

    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "MISSION_NOT_FOUND", "message": "Misión solicitada no existe"}}
        )

    # Cargo
    cargo_cur = await db.execute("""
        SELECT ms.quantity, s.name, s.unit_weight_grams
        FROM mission_supplies ms
        JOIN medical_supplies s ON ms.supply_id = s.supply_id
        WHERE ms.mission_id = ?
    """, (mission_id,))
    cargo_rows = await cargo_cur.fetchall()
    cargo = [dict(r) for r in cargo_rows]

    # Assignments
    asg_cur = await db.execute("""
        SELECT ma.drone_id, d.serial_number, sr.code AS swarm_role
        FROM mission_assignments ma
        JOIN drones d ON ma.drone_id = d.drone_id
        JOIN swarm_roles sr ON ma.swarm_role_id = sr.swarm_role_id
        WHERE ma.mission_id = ?
    """, (mission_id,))
    asg_rows = await asg_cur.fetchall()
    assignments = [dict(r) for r in asg_rows]

    return {
        "mission_id": mission["mission_id"],
        "mission_code": mission["mission_code"],
        "status": mission["status_code"],
        "priority": mission["priority_code"],
        "origin": {
            "latitude": mission["origin_latitude"],
            "longitude": mission["origin_longitude"],
            "altitude_meters": mission["origin_altitude_meters"]
        },
        "destination": {
            "latitude": mission["dest_latitude"],
            "longitude": mission["dest_longitude"],
            "altitude_meters": mission["dest_altitude_meters"]
        },
        "cargo": cargo,
        "assignments": assignments
    }

@router.post("/missions/{mission_id}/route/calculate", response_model=RouteCalculateResponse)
async def calculate_route(
    mission_id: int,
    req: RouteCalculateRequest,
    current_op: Dict[str, Any] = Depends(get_current_operator),
    db: aiosqlite.Connection = Depends(get_db)
):
    start_calc = time.perf_counter()

    cur = await db.execute("""
        SELECT m.*, s.code AS status_code, p.code AS priority_code, p.max_sla_minutes
        FROM missions m
        JOIN mission_statuses s ON m.status_id = s.status_id
        JOIN mission_priority_levels p ON m.priority_id = p.priority_id
        WHERE m.mission_id = ?
    """, (mission_id,))
    mission = await cur.fetchone()
    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "MISSION_NOT_FOUND", "message": "Misión solicitada no existe"}}
        )

    # Get cargo items
    cargo_cur = await db.execute("""
        SELECT ms.quantity, s.name, s.unit_weight_grams, s.max_transit_minutes, sc.is_thermosensitive
        FROM mission_supplies ms
        JOIN medical_supplies s ON ms.supply_id = s.supply_id
        JOIN supply_categories sc ON s.category_id = sc.category_id
        WHERE ms.mission_id = ?
    """, (mission_id,))
    cargo_items = await cargo_cur.fetchall()
    total_cargo_weight = sum(item["quantity"] * item["unit_weight_grams"] for item in cargo_items)

    origin = (mission["origin_latitude"], mission["origin_longitude"], mission["origin_altitude_meters"])
    destination = (mission["dest_latitude"], mission["dest_longitude"], mission["dest_altitude_meters"])

    wind_vector = req.environmental_factors.wind_vector_mps if req.environmental_factors else [0.0, 0.0, 0.0]
    waypoints, total_dist, flight_time_s = generate_waypoints(origin, destination, cruise_speed_mps=18.0, wind_vector=wind_vector)

    # Invariant 1: Golden Hour SLA
    try:
        validate_golden_hour(flight_time_s)
    except DomainValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": {"code": e.code, "message": e.message, "details": e.details}}
        )

    # Invariant 4: Thermal stability
    for item in cargo_items:
        if item["is_thermosensitive"]:
            try:
                validate_thermal_sensitivity(flight_time_s, item["max_transit_minutes"], item["name"])
            except DomainValidationError as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"error": {"code": e.code, "message": e.message, "details": e.details}}
                )

    # Query available IDLE drones
    idle_drones_cur = await db.execute("""
        SELECT d.drone_id, dm.max_payload_grams, dm.cruise_speed_mps, dm.max_flight_time_seconds
        FROM drones d
        JOIN drone_models dm ON d.model_id = dm.model_id
        JOIN drone_statuses ds ON d.status_id = ds.status_id
        WHERE ds.code = 'IDLE'
        ORDER BY dm.max_payload_grams DESC
    """)
    idle_drones = await idle_drones_cur.fetchall()

    if len(idle_drones) < req.required_swarm_size:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": {"code": "INSUFFICIENT_FLEET", "message": "No hay drones IDLE con payload suficiente"}}
        )

    # Invariant 2: Payload limit for carrier drone
    carrier_drone = idle_drones[0]
    try:
        validate_payload_capacity(total_cargo_weight, carrier_drone["max_payload_grams"])
    except DomainValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": {"code": e.code, "message": e.message, "details": e.details}}
        )

    # Invariant 3: Battery reserve (RTH margin >= 30%, consumption <= 70%)
    carrier_max_flight_time = carrier_drone["max_flight_time_seconds"] or 3600
    estimated_battery_pct = (flight_time_s / carrier_max_flight_time) * 100.0
    try:
        validate_battery_reserve(estimated_battery_pct)
    except DomainValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": {"code": e.code, "message": e.message, "details": e.details}}
        )

    # Swarm roles
    sr_cur = await db.execute("SELECT swarm_role_id, code FROM swarm_roles")
    sr_rows = await sr_cur.fetchall()
    role_map = {r["code"]: r["swarm_role_id"] for r in sr_rows}

    # Assign drones & insert trajectories
    routes = []
    await db.execute("DELETE FROM mission_assignments WHERE mission_id = ?", (mission_id,))
    await db.execute("DELETE FROM trajectories WHERE mission_id = ?", (mission_id,))

    assigned_roles = ["PAYLOAD_CARRIER", "COMM_RELAY", "SCOUT", "LEADER"]
    for idx in range(req.required_swarm_size):
        drone = idle_drones[idx]
        role_code = assigned_roles[idx % len(assigned_roles)]
        role_id = role_map.get(role_code, 1)

        await db.execute("""
            INSERT INTO mission_assignments (mission_id, drone_id, swarm_role_id)
            VALUES (?, ?, ?)
        """, (mission_id, drone["drone_id"], role_id))

        traj_cur = await db.execute("""
            INSERT INTO trajectories (mission_id, drone_id, rl_model_version, total_distance_meters, estimated_duration_seconds)
            VALUES (?, ?, ?, ?, ?)
        """, (mission_id, drone["drone_id"], "ares-rl-ppo-v1.4", total_dist, flight_time_s))
        trajectory_id = traj_cur.lastrowid

        # Insert waypoints
        for wp in waypoints:
            await db.execute("""
                INSERT INTO waypoints (trajectory_id, sequence_order, latitude, longitude, altitude_meters, target_speed_mps, expected_timestamp_offset_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (trajectory_id, wp["sequence_order"], wp["latitude"], wp["longitude"], wp["altitude_meters"], wp["target_speed_mps"], wp["expected_timestamp_offset_ms"]))

        routes.append(RouteSegment(
            drone_id=drone["drone_id"],
            swarm_role=role_code,
            trajectory_id=trajectory_id,
            total_distance_meters=total_dist,
            estimated_flight_seconds=flight_time_s,
            waypoints_generated=len(waypoints)
        ))

    # Update mission status to OPTIMIZING
    opt_status_cur = await db.execute("SELECT status_id FROM mission_statuses WHERE code = 'OPTIMIZING'")
    opt_row = await opt_status_cur.fetchone()
    if opt_row:
        await db.execute("UPDATE missions SET status_id = ? WHERE mission_id = ?", (opt_row["status_id"], mission_id))

    await db.commit()

    latency_ms = (time.perf_counter() - start_calc) * 1000.0

    return RouteCalculateResponse(
        mission_id=mission_id,
        rl_model_version="ares-rl-ppo-v1.4",
        computation_latency_ms=round(latency_ms, 2),
        routes=routes
    )

@router.post("/missions/{mission_id}/dispatch", response_model=DispatchResponse)
async def dispatch_mission(
    mission_id: int,
    current_op: Dict[str, Any] = Depends(get_current_operator),
    db: aiosqlite.Connection = Depends(get_db)
):
    cur = await db.execute("""
        SELECT m.*, s.code AS status_code
        FROM missions m
        JOIN mission_statuses s ON m.status_id = s.status_id
        WHERE m.mission_id = ?
    """, (mission_id,))
    mission = await cur.fetchone()

    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "MISSION_NOT_FOUND", "message": "Misión solicitada no existe"}}
        )

    # Valid state transition: only OPTIMIZING -> ACTIVE is allowed for dispatch
    if mission["status_code"] != "OPTIMIZING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": {"code": "INVALID_STATE", "message": "La misión requiere cálculo previo de ruta"}}
        )

    # Get assigned drones
    asg_cur = await db.execute("SELECT drone_id FROM mission_assignments WHERE mission_id = ?", (mission_id,))
    asg_rows = await asg_cur.fetchall()
    drone_ids = [r["drone_id"] for r in asg_rows]

    # Update mission status to ACTIVE
    act_status_cur = await db.execute("SELECT status_id FROM mission_statuses WHERE code = 'ACTIVE'")
    act_row = await act_status_cur.fetchone()
    now_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    await db.execute("UPDATE missions SET status_id = ?, actual_start_time = ? WHERE mission_id = ?", (act_row["status_id"], now_utc, mission_id))

    # Update drones to IN_FLIGHT
    inflight_status_cur = await db.execute("SELECT status_id FROM drone_statuses WHERE code = 'IN_FLIGHT'")
    inflight_row = await inflight_status_cur.fetchone()
    if inflight_row:
        for d_id in drone_ids:
            await db.execute("UPDATE drones SET status_id = ? WHERE drone_id = ?", (inflight_row["status_id"], d_id))

    await db.commit()

    return DispatchResponse(
        mission_id=mission_id,
        status="ACTIVE",
        dispatched_at=now_utc,
        drones_dispatched=drone_ids
    )

@router.post("/telemetry/ingest", response_model=TelemetryIngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_telemetry(
    req: TelemetryIngestRequest,
    current_op: Dict[str, Any] = Depends(get_current_operator),
    db: aiosqlite.Connection = Depends(get_db)
):
    timestamp = req.timestamp_utc or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    await db.execute("""
        INSERT INTO telemetry_logs (
            drone_id, mission_id, current_latitude, current_longitude,
            current_altitude_meters, current_speed_mps, battery_percentage,
            signal_snr_db, timestamp_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.drone_id, req.mission_id, req.current_latitude, req.current_longitude,
        req.current_altitude_meters, req.current_speed_mps, req.battery_percentage,
        req.signal_snr_db, timestamp
    ))
    await db.commit()

    # If battery critical or proximity alert, collision_alert can be flagged
    collision_alert = req.battery_percentage < 10.0 or req.signal_snr_db < 10.0

    return TelemetryIngestResponse(
        status="RECORDED",
        collision_alert=collision_alert
    )

@router.post("/simulations/benchmark", response_model=BenchmarkResponse)
async def simulate_benchmark(
    req: BenchmarkRequest,
    current_op: Dict[str, Any] = Depends(get_current_operator),
    db: aiosqlite.Connection = Depends(get_db)
):
    results = run_simulation_benchmark(
        total_obstacles=req.total_obstacles_injected,
        speed_range=req.obstacle_speed_range_mps,
        obstacle_radius=req.obstacle_radius_meters
    )

    ins_cur = await db.execute("""
        INSERT INTO simulation_runs (
            mission_id, rl_model_checkpoint, total_obstacles_injected,
            evaded_obstacles_count, collisions_count, success_rate_percentage,
            execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        req.mission_id, results["rl_model_checkpoint"], results["total_obstacles_injected"],
        results["evaded_obstacles_count"], results["collisions_count"], results["success_rate_percentage"],
        int(results["avg_recalculation_latency_ms"])
    ))
    sim_run_id = ins_cur.lastrowid
    await db.commit()

    return BenchmarkResponse(
        simulation_run_id=sim_run_id,
        mission_id=req.mission_id,
        rl_model_checkpoint=results["rl_model_checkpoint"],
        total_obstacles_injected=results["total_obstacles_injected"],
        evaded_obstacles_count=results["evaded_obstacles_count"],
        collisions_count=results["collisions_count"],
        success_rate_percentage=results["success_rate_percentage"],
        charter_threshold_percentage=results["charter_threshold_percentage"],
        charter_criterion_met=results["charter_criterion_met"],
        avg_recalculation_latency_ms=results["avg_recalculation_latency_ms"]
    )
