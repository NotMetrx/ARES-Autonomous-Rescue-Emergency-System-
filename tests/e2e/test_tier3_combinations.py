import asyncio
import sqlite3
import pytest

from src.ai.trajectory import haversine_distance, generate_waypoints

@pytest.mark.asyncio
async def test_comb_01_full_rescue_mission_lifecycle(e2e_client, auth_headers, e2e_db_path):
    """Tier 3 Comb 1: Complete end-to-end lifecycle: Auth -> Create -> Query -> Route -> Dispatch -> Telemetry."""
    # 1. Create Mission
    mission_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [
            {"supply_id": 1, "quantity": 1},  # 350g
            {"supply_id": 3, "quantity": 2}   # 250g * 2 = 500g -> total 850g
        ]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=mission_payload, headers=auth_headers)
    assert create_res.status_code == 201
    mission_data = create_res.json()
    mission_id = mission_data["mission_id"]
    assert mission_data["status"] == "DRAFT"
    assert mission_data["total_cargo_weight_grams"] == 850

    # 2. Query Mission Details
    get_res = await e2e_client.get(f"/api/v1/missions/{mission_id}", headers=auth_headers)
    assert get_res.status_code == 200
    details = get_res.json()
    assert len(details["cargo"]) == 2

    # 3. Calculate 3D Route with 2 Drones & Wind compensation
    route_payload = {
        "required_swarm_size": 2,
        "dynamic_obstacle_simulation": True,
        "environmental_factors": {
            "wind_vector_mps": [3.0, -1.0, 0.0],
            "no_fly_zones": []
        }
    }
    calc_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/route/calculate", json=route_payload, headers=auth_headers)
    assert calc_res.status_code == 200
    calc_data = calc_res.json()
    assert len(calc_data["routes"]) == 2
    dispatched_drone_ids = [r["drone_id"] for r in calc_data["routes"]]

    # 4. Dispatch Mission
    disp_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert disp_res.status_code == 200
    disp_data = disp_res.json()
    assert disp_data["status"] == "ACTIVE"
    assert set(disp_data["drones_dispatched"]) == set(dispatched_drone_ids)

    # Verify Drones transitioned to IN_FLIGHT in database
    with sqlite3.connect(e2e_db_path) as conn:
        for d_id in dispatched_drone_ids:
            cur = conn.execute("""
                SELECT ds.code FROM drones d
                JOIN drone_statuses ds ON d.status_id = ds.status_id
                WHERE d.drone_id = ?
            """, (d_id,))
            status_code = cur.fetchone()[0]
            assert status_code == "IN_FLIGHT"

    # 5. Ingest Sequential Telemetry Packets
    for step in range(3):
        telemetry = {
            "drone_id": dispatched_drone_ids[0],
            "mission_id": mission_id,
            "current_latitude": -12.046374 - step * 0.003,
            "current_longitude": -77.042793 - step * 0.01,
            "current_altitude_meters": 150.0 - step * 10.0,
            "current_speed_mps": 18.0,
            "battery_percentage": 95.0 - step * 2.0,
            "signal_snr_db": 32.0 - step * 1.0,
            "timestamp_utc": f"2026-09-11T16:4{step}:00Z"
        }
        tel_res = await e2e_client.post("/api/v1/telemetry/ingest", json=telemetry, headers=auth_headers)
        assert tel_res.status_code == 202
        assert tel_res.json()["collision_alert"] is False

    # Verify Telemetry stored in DB
    with sqlite3.connect(e2e_db_path) as conn:
        cur = conn.execute("SELECT COUNT(*) FROM telemetry_logs WHERE mission_id = ?", (mission_id,))
        count = cur.fetchone()[0]
        assert count == 3

@pytest.mark.asyncio
async def test_comb_02_fleet_contention_and_resource_exhaustion(e2e_client, auth_headers):
    """Tier 3 Comb 2: Multi-mission fleet contention and clean capacity exhaustion."""
    # Base mission setup
    m1_payload = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }
    # Mission 1
    m1_res = await e2e_client.post("/api/v1/missions", json=m1_payload, headers=auth_headers)
    m1_id = m1_res.json()["mission_id"]

    # Calculate route allocating 2 drones for Mission 1
    calc1 = await e2e_client.post(f"/api/v1/missions/{m1_id}/route/calculate", json={"required_swarm_size": 2}, headers=auth_headers)
    assert calc1.status_code == 200

    # Dispatch Mission 1 -> 2 drones transition from IDLE to IN_FLIGHT
    disp1 = await e2e_client.post(f"/api/v1/missions/{m1_id}/dispatch", headers=auth_headers)
    assert disp1.status_code == 200

    # Mission 2
    m2_res = await e2e_client.post("/api/v1/missions", json=m1_payload, headers=auth_headers)
    m2_id = m2_res.json()["mission_id"]

    # Only 1 IDLE drone remains (fleet total is 3). Requesting 2 must fail!
    calc2_fail = await e2e_client.post(f"/api/v1/missions/{m2_id}/route/calculate", json={"required_swarm_size": 2}, headers=auth_headers)
    assert calc2_fail.status_code == 409
    assert calc2_fail.json()["error"]["code"] == "INSUFFICIENT_FLEET"

    # Requesting 1 IDLE drone should succeed
    calc2_ok = await e2e_client.post(f"/api/v1/missions/{m2_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    assert calc2_ok.status_code == 200

    # Dispatch Mission 2 -> 3rd drone transitions to IN_FLIGHT
    disp2 = await e2e_client.post(f"/api/v1/missions/{m2_id}/dispatch", headers=auth_headers)
    assert disp2.status_code == 200

    # Mission 3
    m3_res = await e2e_client.post("/api/v1/missions", json=m1_payload, headers=auth_headers)
    m3_id = m3_res.json()["mission_id"]

    # Now 0 IDLE drones remain -> Requesting even 1 drone fails
    calc3_fail = await e2e_client.post(f"/api/v1/missions/{m3_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    assert calc3_fail.status_code == 409
    assert calc3_fail.json()["error"]["code"] == "INSUFFICIENT_FLEET"

@pytest.mark.asyncio
async def test_comb_03_3nf_cascade_integrity_with_active_routes_and_telemetry(e2e_client, auth_headers, e2e_db_path):
    """Tier 3 Comb 3: Foreign key cascading delete cleans up child tables without orphaned records."""
    # 1. Create, route, dispatch, and add telemetry
    payload = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }
    m_res = await e2e_client.post("/api/v1/missions", json=payload, headers=auth_headers)
    m_id = m_res.json()["mission_id"]

    await e2e_client.post(f"/api/v1/missions/{m_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    await e2e_client.post(f"/api/v1/missions/{m_id}/dispatch", headers=auth_headers)
    await e2e_client.post("/api/v1/telemetry/ingest", json={
        "drone_id": 1, "mission_id": m_id,
        "current_latitude": -12.0, "current_longitude": -77.0, "current_altitude_meters": 100.0,
        "current_speed_mps": 15.0, "battery_percentage": 90.0, "signal_snr_db": 30.0
    }, headers=auth_headers)

    # 2. Verify existence of records across all child tables
    with sqlite3.connect(e2e_db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        
        c_supplies = conn.execute("SELECT COUNT(*) FROM mission_supplies WHERE mission_id = ?", (m_id,)).fetchone()[0]
        c_asg = conn.execute("SELECT COUNT(*) FROM mission_assignments WHERE mission_id = ?", (m_id,)).fetchone()[0]
        c_traj = conn.execute("SELECT COUNT(*) FROM trajectories WHERE mission_id = ?", (m_id,)).fetchone()[0]
        c_tel = conn.execute("SELECT COUNT(*) FROM telemetry_logs WHERE mission_id = ?", (m_id,)).fetchone()[0]

        assert c_supplies > 0
        assert c_asg > 0
        assert c_traj > 0
        assert c_tel > 0

        # Get trajectory ID to check waypoints
        traj_id = conn.execute("SELECT trajectory_id FROM trajectories WHERE mission_id = ?", (m_id,)).fetchone()[0]
        c_wp = conn.execute("SELECT COUNT(*) FROM waypoints WHERE trajectory_id = ?", (traj_id,)).fetchone()[0]
        assert c_wp > 0

        # 3. Perform cascade deletion of parent mission
        conn.execute("DELETE FROM missions WHERE mission_id = ?", (m_id,))
        conn.commit()

        # 4. Verify 100% cascade purge across all dependent tables
        assert conn.execute("SELECT COUNT(*) FROM mission_supplies WHERE mission_id = ?", (m_id,)).fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM mission_assignments WHERE mission_id = ?", (m_id,)).fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM trajectories WHERE mission_id = ?", (m_id,)).fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM waypoints WHERE trajectory_id = ?", (traj_id,)).fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM telemetry_logs WHERE mission_id = ?", (m_id,)).fetchone()[0] == 0

def test_comb_04_environmental_wind_vector_physics():
    """Tier 3 Comb 4: Wind vectors modifying ground speed, flight duration, and SLA calculation."""
    origin = (-12.0, -77.0, 100.0)
    dest = (-12.0, -77.1, 100.0)  # Flight eastward or westward

    # Tailwind: wind_vector[0] = -10 m/s (effective speed = 18 - (-10)*0.2 = 20 m/s)
    _, dist_tail, dur_tail = generate_waypoints(origin, dest, cruise_speed_mps=18.0, wind_vector=[-10.0, 0.0, 0.0])
    # Headwind: wind_vector[0] = +10 m/s (effective speed = 18 - (10)*0.2 = 16 m/s)
    _, dist_head, dur_head = generate_waypoints(origin, dest, cruise_speed_mps=18.0, wind_vector=[10.0, 0.0, 0.0])

    assert dist_tail == pytest.approx(dist_head, rel=1e-3)
    # Headwind flight duration must be longer than tailwind
    assert dur_head > dur_tail, f"Headwind duration ({dur_head}s) should exceed tailwind duration ({dur_tail}s)"

@pytest.mark.asyncio
async def test_comb_05_multi_category_mixed_cargo_and_thermal_invariants(e2e_client, auth_headers):
    """Tier 3 Comb 5: Mixed cargo (thermosensitive antidote + surgical kit) respects combined weight and thermal deadline."""
    # Supply 3: Antídoto Polivalente (250g, max 30 min, thermosensitive)
    # Supply 4: Kit Quirúrgico (600g, max 120 min, NOT thermosensitive) -> Total: 850g <= 900g limit
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [
            {"supply_id": 3, "quantity": 1},  # 250g
            {"supply_id": 4, "quantity": 1}   # 600g -> total 850g
        ]
    }
    res = await e2e_client.post("/api/v1/missions", json=payload, headers=auth_headers)
    assert res.status_code == 201
    assert res.json()["total_cargo_weight_grams"] == 850

    # Drone 1 has max payload 1000g (effective limit 900g >= 850g), distance is ~4.8km (<5 min flight).
    # Thermal check for supply 3 (30 min) easily passes.
    calc_res = await e2e_client.post(
        f"/api/v1/missions/{res.json()['mission_id']}/route/calculate",
        json={"required_swarm_size": 1},
        headers=auth_headers
    )
    assert calc_res.status_code == 200

@pytest.mark.asyncio
async def test_comb_06_concurrent_operations_wal_mode(e2e_client, auth_headers):
    """Tier 3 Comb 6: Concurrent asynchronous telemetry ingestion and queries under SQLite WAL."""
    # Create base mission
    m_res = await e2e_client.post("/api/v1/missions", json={
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }, headers=auth_headers)
    m_id = m_res.json()["mission_id"]

    async def ingest_task(i):
        return await e2e_client.post("/api/v1/telemetry/ingest", json={
            "drone_id": 1,
            "mission_id": m_id,
            "current_latitude": -12.0 + i*0.001,
            "current_longitude": -77.0 + i*0.001,
            "current_altitude_meters": 100.0,
            "current_speed_mps": 15.0,
            "battery_percentage": 90.0,
            "signal_snr_db": 30.0
        }, headers=auth_headers)

    async def query_task():
        return await e2e_client.get(f"/api/v1/missions/{m_id}", headers=auth_headers)

    # Launch 10 concurrent ingestions and 5 concurrent queries simultaneously
    tasks = [ingest_task(i) for i in range(10)] + [query_task() for _ in range(5)]
    responses = await asyncio.gather(*tasks)

    for r in responses[:10]:
        assert r.status_code == 202
    for r in responses[10:]:
        assert r.status_code == 200
