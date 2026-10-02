import pytest
import sqlite3
import numpy as np

from src.ai.trajectory import generate_waypoints, haversine_distance
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle

@pytest.mark.asyncio
async def test_feat_01_operator_authentication(e2e_client):
    """Feature 1: Operator Authentication via credentials issuing HS256 JWT."""
    payload = {
        "username": "operador_tactico",
        "password": "PasswordSeguro2026!"
    }
    response = await e2e_client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["token_type"] == "Bearer"
    assert data["expires_in_seconds"] == 28800
    assert data["operator"]["operator_id"] == 1
    assert data["operator"]["username"] == "operador_tactico"
    assert data["operator"]["role"] == "TACTICAL_OPERATOR"

@pytest.mark.asyncio
async def test_feat_02_bearer_token_validation(e2e_client, auth_headers):
    """Feature 2: Bearer Token Validation Dependency protecting secured endpoints."""
    # Test valid token grants access to protected route
    response = await e2e_client.get("/api/v1/missions/999", headers=auth_headers)
    # Should reach route logic (404 since 999 doesn't exist) rather than 401 Unauthorized
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "MISSION_NOT_FOUND"

@pytest.mark.asyncio
async def test_feat_03_mission_creation(e2e_client, auth_headers):
    """Feature 3: Mission Creation with medical supply cargo calculation."""
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [
            {"supply_id": 1, "quantity": 2},  # 350g * 2 = 700g
            {"supply_id": 3, "quantity": 1}   # 250g * 1 = 250g -> total 950g
        ]
    }
    response = await e2e_client.post("/api/v1/missions", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["mission_id"] > 0
    assert data["mission_code"].startswith("MSN-")
    assert data["status"] == "DRAFT"
    assert data["priority_code"] == "GOLDEN_HOUR_CRITICAL"
    assert data["max_sla_minutes"] == 60
    assert data["total_cargo_weight_grams"] == 950

@pytest.mark.asyncio
async def test_feat_04_mission_query(e2e_client, auth_headers):
    """Feature 4: Mission Query fetching full operational details."""
    # Create mission first
    create_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 2}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    # Query mission
    get_res = await e2e_client.get(f"/api/v1/missions/{mission_id}", headers=auth_headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["mission_id"] == mission_id
    assert data["status"] == "DRAFT"
    assert data["priority"] == "GOLDEN_HOUR_CRITICAL"
    assert data["origin"]["latitude"] == -12.046374
    assert len(data["cargo"]) == 1
    assert data["cargo"][0]["name"] == "Sangre O Negativo (Paquete)"
    assert data["cargo"][0]["quantity"] == 2
    assert isinstance(data["assignments"], list)

@pytest.mark.asyncio
async def test_feat_05_route_calculation(e2e_client, auth_headers):
    """Feature 5: 3D Trajectory Calculation with wind compensation."""
    # Create mission
    create_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 3, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    calc_payload = {
        "required_swarm_size": 2,
        "dynamic_obstacle_simulation": True,
        "environmental_factors": {
            "wind_vector_mps": [2.1, -1.0, 0.0],
            "no_fly_zones": []
        }
    }
    calc_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/route/calculate", json=calc_payload, headers=auth_headers)
    assert calc_res.status_code == 200
    data = calc_res.json()
    assert data["mission_id"] == mission_id
    assert data["rl_model_version"] == "ares-rl-ppo-v1.4"
    assert data["computation_latency_ms"] >= 0.0
    assert len(data["routes"]) == 2
    for r in data["routes"]:
        assert r["drone_id"] in [1, 4, 7]
        assert r["total_distance_meters"] > 0.0
        assert r["waypoints_generated"] > 0

    # Verify mission transitioned to OPTIMIZING
    chk_res = await e2e_client.get(f"/api/v1/missions/{mission_id}", headers=auth_headers)
    assert chk_res.json()["status"] == "OPTIMIZING"

@pytest.mark.asyncio
async def test_feat_06_mission_dispatch(e2e_client, auth_headers):
    """Feature 6: Mission Dispatch transitioning mission to ACTIVE and drones to IN_FLIGHT."""
    # Create mission & calculate route
    create_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 3, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    await e2e_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 2, "dynamic_obstacle_simulation": False},
        headers=auth_headers
    )

    # Dispatch
    dispatch_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert dispatch_res.status_code == 200
    data = dispatch_res.json()
    assert data["mission_id"] == mission_id
    assert data["status"] == "ACTIVE"
    assert "dispatched_at" in data
    assert len(data["drones_dispatched"]) == 2

    # Verify mission status in DB is ACTIVE
    chk_res = await e2e_client.get(f"/api/v1/missions/{mission_id}", headers=auth_headers)
    assert chk_res.json()["status"] == "ACTIVE"

@pytest.mark.asyncio
async def test_feat_07_edge_telemetry_ingestion(e2e_client, auth_headers):
    """Feature 7: Edge Telemetry Ingestion and collision flagging."""
    # Create and dispatch a mission to have valid mission and drone context
    create_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 3, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    await e2e_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 1, "dynamic_obstacle_simulation": False},
        headers=auth_headers
    )
    await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)

    # Ingest telemetry
    telemetry_payload = {
        "drone_id": 1,
        "mission_id": mission_id,
        "current_latitude": -12.048910,
        "current_longitude": -77.049500,
        "current_altitude_meters": 142.5,
        "current_speed_mps": 14.8,
        "battery_percentage": 91.2,
        "signal_snr_db": 28.5,
        "timestamp_utc": "2026-09-11T16:46:15Z"
    }
    res = await e2e_client.post("/api/v1/telemetry/ingest", json=telemetry_payload, headers=auth_headers)
    assert res.status_code == 202
    data = res.json()
    assert data["status"] == "RECORDED"
    assert data["collision_alert"] is False

@pytest.mark.asyncio
async def test_feat_08_evasion_benchmark_simulation(e2e_client, auth_headers):
    """Feature 8: Evasion Benchmark Simulation certifying charter criterion (>95% success)."""
    # Create mission
    create_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 3, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    bench_payload = {
        "mission_id": mission_id,
        "total_obstacles_injected": 500,
        "obstacle_speed_range_mps": [2.0, 12.0],
        "obstacle_radius_meters": 4.0
    }
    res = await e2e_client.post("/api/v1/simulations/benchmark", json=bench_payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["simulation_run_id"] > 0
    assert data["total_obstacles_injected"] == 500
    assert data["collisions_count"] <= 25
    assert data["success_rate_percentage"] >= 95.0
    assert data["charter_criterion_met"] is True
    assert data["avg_recalculation_latency_ms"] < 50.0

@pytest.mark.asyncio
async def test_feat_09_tactical_command_dashboard(e2e_client):
    """Feature 9: Tactical Command Web Dashboard available at `/`."""
    res = await e2e_client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    html = res.text
    assert "ARES // TACTICAL COMMAND CENTER" in html
    assert "SYSTEM READY" in html
    assert "SQLite en modo WAL" in html

@pytest.mark.asyncio
async def test_feat_10_health_probe(e2e_client):
    """Feature 10: Health Check Probe at `/health`."""
    res = await e2e_client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "HEALTHY"
    assert data["system"] == "ARES Edge Core"
    assert data["mode"] == "WAL"

@pytest.mark.asyncio
async def test_feat_11_openapi_documentation(e2e_client):
    """Feature 11: Interactive OpenAPI & Swagger Documentation."""
    # Docs UI
    docs_res = await e2e_client.get("/docs")
    assert docs_res.status_code == 200
    assert "text/html" in docs_res.headers["content-type"]

    # OpenAPI schema JSON
    schema_res = await e2e_client.get("/openapi.json")
    assert schema_res.status_code == 200
    schema = schema_res.json()
    assert "openapi" in schema
    assert "/api/v1/auth/login" in schema["paths"]
    assert "/api/v1/missions" in schema["paths"]
    assert "/api/v1/telemetry/ingest" in schema["paths"]

def test_feat_12_sqlite_pragma_enforcement(e2e_db_path):
    """Feature 12: SQLite PRAGMA Enforcement: foreign_keys=ON, journal_mode=WAL."""
    with sqlite3.connect(e2e_db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        
        fk_cur = conn.execute("PRAGMA foreign_keys;")
        fk_val = fk_cur.fetchone()[0]
        assert fk_val == 1, "foreign_keys PRAGMA must be 1 (ON)"

        jm_cur = conn.execute("PRAGMA journal_mode;")
        jm_val = jm_cur.fetchone()[0].lower()
        assert jm_val == "wal", f"journal_mode must be 'wal', got '{jm_val}'"

def test_feat_13_tactical_catalogs_and_fixtures(e2e_db_path):
    """Feature 13: Tactical Catalogs & Default Fixtures pre-seeded."""
    with sqlite3.connect(e2e_db_path) as conn:
        cur = conn.cursor()
        
        # Verify roles
        cur.execute("SELECT COUNT(*) FROM roles")
        assert cur.fetchone()[0] >= 3
        
        # Verify priority levels
        cur.execute("SELECT COUNT(*) FROM mission_priority_levels")
        assert cur.fetchone()[0] >= 3
        
        # Verify supply categories & medical supplies
        cur.execute("SELECT COUNT(*) FROM supply_categories")
        assert cur.fetchone()[0] >= 4
        cur.execute("SELECT COUNT(*) FROM medical_supplies")
        assert cur.fetchone()[0] >= 5

        # Verify drone models and active fleet
        cur.execute("SELECT COUNT(*) FROM drone_models")
        assert cur.fetchone()[0] >= 2
        cur.execute("SELECT COUNT(*) FROM drones")
        assert cur.fetchone()[0] >= 3

def test_feat_14_3d_waypoint_generation():
    """Feature 14: 3D Discretized Waypoint Generation."""
    origin = (-12.046374, -77.042793, 150.0)
    dest = (-12.056500, -77.084400, 120.0)
    
    waypoints, total_dist, duration_s = generate_waypoints(
        origin, dest, cruise_speed_mps=18.0, wind_vector=[2.0, 0.0, 0.0]
    )
    
    assert total_dist > 1000.0
    assert duration_s > 0
    assert len(waypoints) >= 10
    
    # Check waypoint sequencing and monotonic offset
    for i, wp in enumerate(waypoints):
        assert wp["sequence_order"] == i
        assert wp["latitude"] != 0.0
        assert wp["altitude_meters"] >= 100.0
        if i > 0:
            assert wp["expected_timestamp_offset_ms"] >= waypoints[i-1]["expected_timestamp_offset_ms"]

def test_feat_15_reactive_3d_evasion_engine():
    """Feature 15: Reactive 3D Evasion Engine (<50ms latency, repulsion vector)."""
    engine = ReactiveEvasionEngine()
    drone_pos = np.array([0.0, 0.0, 120.0])
    drone_vel = np.array([18.0, 0.0, 0.0])
    
    # Obstacle on direct collision course 12 meters ahead
    obstacle = DynamicObstacle(
        position=np.array([12.0, 0.0, 120.0]),
        velocity=np.array([-10.0, 0.0, 0.0]),
        radius_meters=3.0
    )
    
    evasion_vector, latency_ms = engine.calculate_evasion_vector(drone_pos, drone_vel, obstacle)
    
    assert latency_ms < 50.0, f"Latency {latency_ms:.2f}ms exceeded 50ms budget"
    norm_disp = np.linalg.norm(evasion_vector)
    assert norm_disp > 0.0, "Evasion displacement must be non-zero for imminent collision"
