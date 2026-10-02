import pytest
import sqlite3
import numpy as np

from src.core.rules import (
    validate_golden_hour, validate_payload_capacity,
    validate_thermal_sensitivity, validate_battery_reserve,
    DomainValidationError
)
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle

# --- 1. Domain Invariant Boundary Tests (Pure BVA) ---

def test_bva_01_golden_hour_exact_boundaries():
    """BVA: Golden hour invariant at exact boundary 3600.0s."""
    # Boundary: Exactly 3600.0s must pass
    validate_golden_hour(3600.0, planning_time_seconds=0.0)
    validate_golden_hour(3500.0, planning_time_seconds=100.0)

    # Boundary + epsilon: 3600.1s must raise DomainValidationError
    with pytest.raises(DomainValidationError) as exc:
        validate_golden_hour(3600.1, planning_time_seconds=0.0)
    assert exc.value.code == "GOLDEN_HOUR_EXCEEDED"

    with pytest.raises(DomainValidationError) as exc:
        validate_golden_hour(3550.0, planning_time_seconds=50.1)
    assert exc.value.code == "GOLDEN_HOUR_EXCEEDED"

def test_bva_02_payload_capacity_exact_boundaries():
    """BVA: Payload capacity at exact 90% boundary."""
    max_payload = 1000  # 90% is 900.0g
    
    # Boundary: Exactly 900g must pass
    validate_payload_capacity(900, max_payload)
    validate_payload_capacity(899, max_payload)

    # Boundary + 1g: 901g must raise INSUFFICIENT_FLEET
    with pytest.raises(DomainValidationError) as exc:
        validate_payload_capacity(901, max_payload)
    assert exc.value.code == "INSUFFICIENT_FLEET"

def test_bva_03_thermal_sensitivity_exact_boundaries():
    """BVA: Thermal sensitivity at exact max_transit_minutes * 60 boundary."""
    max_transit_minutes = 25  # 1500 seconds
    
    # Boundary: Exactly 1500s must pass
    validate_thermal_sensitivity(1500.0, max_transit_minutes, "Insulina Rápida")
    validate_thermal_sensitivity(1499.9, max_transit_minutes, "Insulina Rápida")

    # Boundary + epsilon: 1500.1s must fail
    with pytest.raises(DomainValidationError) as exc:
        validate_thermal_sensitivity(1500.1, max_transit_minutes, "Insulina Rápida")
    assert exc.value.code == "THERMAL_DECAY_EXCEEDED"

def test_bva_04_battery_reserve_exact_boundaries():
    """BVA: Battery reserve at exact 70.0% consumption boundary."""
    # Boundary: <= 70.0% consumption passes
    validate_battery_reserve(70.0)
    validate_battery_reserve(69.9)

    # Boundary + epsilon: 70.01% fails (leaving < 30% RTH reserve)
    with pytest.raises(DomainValidationError) as exc:
        validate_battery_reserve(70.01)
    assert exc.value.code == "BATTERY_RESERVE_VIOLATION"


# --- 2. REST API Boundary & Corner Cases ---

@pytest.mark.asyncio
async def test_bva_05_telemetry_threshold_alerts(e2e_client, auth_headers):
    """BVA: Telemetry alerts triggered exactly below 10% battery or 10 dB SNR."""
    # Create mission first so mission_id exists in 3NF DB
    create_res = await e2e_client.post("/api/v1/missions", json={
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    # Baseline normal telemetry -> collision_alert: False
    t_normal = {
        "drone_id": 1, "mission_id": mission_id,
        "current_latitude": -12.0, "current_longitude": -77.0, "current_altitude_meters": 100.0,
        "current_speed_mps": 15.0, "battery_percentage": 10.0, "signal_snr_db": 10.0
    }
    res_normal = await e2e_client.post("/api/v1/telemetry/ingest", json=t_normal, headers=auth_headers)
    assert res_normal.status_code == 202
    assert res_normal.json()["collision_alert"] is False

    # Low battery: 9.9% -> collision_alert: True
    t_low_batt = dict(t_normal, battery_percentage=9.9)
    res_low_batt = await e2e_client.post("/api/v1/telemetry/ingest", json=t_low_batt, headers=auth_headers)
    assert res_low_batt.status_code == 202
    assert res_low_batt.json()["collision_alert"] is True

    # Low SNR: 9.9 dB -> collision_alert: True
    t_low_snr = dict(t_normal, signal_snr_db=9.9)
    res_low_snr = await e2e_client.post("/api/v1/telemetry/ingest", json=t_low_snr, headers=auth_headers)
    assert res_low_snr.status_code == 202
    assert res_low_snr.json()["collision_alert"] is True

@pytest.mark.asyncio
async def test_bva_06_geo_coordinates_boundary_validation(e2e_client, auth_headers):
    """BVA: GeoPoint coordinate limits [-90, 90] lat and [-180, 180] lon."""
    valid_base = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -90.0, "longitude": -180.0, "altitude_meters": 0.0},
        "destination": {"latitude": 90.0, "longitude": 180.0, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }
    # Exact boundary coordinates should pass schema validation
    res = await e2e_client.post("/api/v1/missions", json=valid_base, headers=auth_headers)
    assert res.status_code == 201

    # Out of boundary: Latitude 90.1
    inv_lat = dict(valid_base)
    inv_lat["origin"] = {"latitude": 90.1, "longitude": 0.0, "altitude_meters": 10.0}
    res_inv_lat = await e2e_client.post("/api/v1/missions", json=inv_lat, headers=auth_headers)
    assert res_inv_lat.status_code == 422
    assert res_inv_lat.json()["error"]["code"] == "VALIDATION_ERROR"

    # Out of boundary: Longitude -180.1
    inv_lon = dict(valid_base)
    inv_lon["destination"] = {"latitude": 0.0, "longitude": -180.1, "altitude_meters": 10.0}
    res_inv_lon = await e2e_client.post("/api/v1/missions", json=inv_lon, headers=auth_headers)
    assert res_inv_lon.status_code == 422
    assert res_inv_lon.json()["error"]["code"] == "VALIDATION_ERROR"


# --- 3. Security & Auth Corner Cases ---

@pytest.mark.asyncio
async def test_corner_07_malformed_and_tampered_jwt(e2e_client):
    """Corner: Tampered JWT token or invalid header formats."""
    # Missing header
    res_no_hdr = await e2e_client.get("/api/v1/missions/1")
    assert res_no_hdr.status_code == 401

    # Malformed Bearer
    res_bad_fmt = await e2e_client.get("/api/v1/missions/1", headers={"Authorization": "Bearer not-a-valid-jwt"})
    assert res_bad_fmt.status_code == 401

    # Non-Bearer auth
    res_basic = await e2e_client.get("/api/v1/missions/1", headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert res_basic.status_code == 401

    # Tampered signature
    valid_prefix = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJvcCJ9."
    res_tampered = await e2e_client.get("/api/v1/missions/1", headers={"Authorization": f"Bearer {valid_prefix}invalidsig"})
    assert res_tampered.status_code == 401

@pytest.mark.asyncio
async def test_corner_08_disabled_operator_rejected(e2e_client):
    """Corner: Inactive operator login is forbidden (403 USER_DISABLED)."""
    payload = {
        "username": "operador_inactivo",
        "password": "PasswordSeguro2026!"
    }
    res = await e2e_client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "USER_DISABLED"


# --- 4. FSM and Business Invariant Corner Cases ---

@pytest.mark.asyncio
async def test_corner_09_fsm_illegal_dispatch_on_draft(e2e_client, auth_headers):
    """Corner: Attempting to dispatch a DRAFT mission without route calculation."""
    create_payload = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    # Dispatch directly from DRAFT (should fail with 409 INVALID_STATE)
    disp_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert disp_res.status_code == 409
    assert disp_res.json()["error"]["code"] == "INVALID_STATE"

@pytest.mark.asyncio
async def test_corner_10_fsm_double_dispatch_rejected(e2e_client, auth_headers):
    """Corner: Attempting to dispatch an already ACTIVE mission returns 409."""
    create_payload = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    # Calculate route -> OPTIMIZING
    await e2e_client.post(f"/api/v1/missions/{mission_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)

    # First dispatch -> ACTIVE
    disp1 = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert disp1.status_code == 200

    # Second dispatch -> 409 Conflict
    disp2 = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert disp2.status_code == 409
    assert disp2.json()["error"]["code"] == "INVALID_STATE"

@pytest.mark.asyncio
async def test_corner_11_invalid_supplies_and_quantities(e2e_client, auth_headers):
    """Corner: Unknown supply_id (400) or non-positive quantity (422)."""
    base = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 99999, "quantity": 1}]
    }
    # Unknown supply ID
    res_bad_sup = await e2e_client.post("/api/v1/missions", json=base, headers=auth_headers)
    assert res_bad_sup.status_code == 400
    assert res_bad_sup.json()["error"]["code"] == "INVALID_SUPPLY"

    # Negative/zero quantity
    base_bad_qty = dict(base, supplies=[{"supply_id": 1, "quantity": 0}])
    res_bad_qty = await e2e_client.post("/api/v1/missions", json=base_bad_qty, headers=auth_headers)
    assert res_bad_qty.status_code == 422

@pytest.mark.asyncio
async def test_corner_12_nonexistent_mission_operations(e2e_client, auth_headers):
    """Corner: Operations on non-existent mission return 404 MISSION_NOT_FOUND."""
    res_query = await e2e_client.get("/api/v1/missions/88888", headers=auth_headers)
    assert res_query.status_code == 404
    assert res_query.json()["error"]["code"] == "MISSION_NOT_FOUND"

    res_calc = await e2e_client.post("/api/v1/missions/88888/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    assert res_calc.status_code == 404
    assert res_calc.json()["error"]["code"] == "MISSION_NOT_FOUND"

    res_disp = await e2e_client.post("/api/v1/missions/88888/dispatch", headers=auth_headers)
    assert res_disp.status_code == 404
    assert res_disp.json()["error"]["code"] == "MISSION_NOT_FOUND"

@pytest.mark.asyncio
async def test_corner_13_insufficient_fleet_capacity(e2e_client, auth_headers):
    """Corner: Requesting more drones than total IDLE fleet returns 409 INSUFFICIENT_FLEET."""
    create_payload = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.0, "longitude": -77.0, "altitude_meters": 100.0},
        "destination": {"latitude": -12.01, "longitude": -77.01, "altitude_meters": 100.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 1, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=create_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    # Fleet only has 3 seeded drones, request 10
    calc_res = await e2e_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 10},
        headers=auth_headers
    )
    assert calc_res.status_code == 409
    assert calc_res.json()["error"]["code"] == "INSUFFICIENT_FLEET"

def test_corner_14_evasion_distant_and_stationary_obstacles():
    """Corner: Evasion engine behavior with distant and stationary obstacles."""
    engine = ReactiveEvasionEngine()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])

    # Case A: Obstacle 100 meters away with 50m lateral clearance (> 23m clearance required)
    distant_obs = DynamicObstacle(
        position=np.array([100.0, 50.0, 100.0]),
        velocity=np.array([15.0, 0.0, 0.0]),
        radius_meters=3.0
    )
    vec_distant, _ = engine.calculate_evasion_vector(drone_pos, drone_vel, distant_obs)
    assert np.allclose(vec_distant, 0.0), "No evasion displacement needed for non-threatening obstacle"

    # Case B: Stationary obstacle directly in the flight path at 8m
    stationary_obs = DynamicObstacle(
        position=np.array([8.0, 0.0, 100.0]),
        velocity=np.array([0.0, 0.0, 0.0]),
        radius_meters=2.0
    )
    vec_stat, lat_ms = engine.calculate_evasion_vector(drone_pos, drone_vel, stationary_obs)
    assert lat_ms < 50.0
    assert np.linalg.norm(vec_stat) > 0.0, "Stationary imminent obstacle must trigger evasion deflection"
