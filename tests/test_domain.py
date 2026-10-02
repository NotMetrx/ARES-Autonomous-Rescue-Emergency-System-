import pytest

async def get_auth_headers(client):
    res = await client.post("/api/v1/auth/login", json={
        "username": "operador_tactico",
        "password": "PasswordSeguro2026!"
    })
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_dom_001_create_mission_cargo_weight(async_client):
    """TEST-DOM-001: Registro y cálculo de peso de insumos médicos (350*2 + 250*1 = 950g)."""
    headers = await get_auth_headers(async_client)
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [
            {"supply_id": 1, "quantity": 2}, # 350g * 2 = 700g
            {"supply_id": 3, "quantity": 1}  # 250g * 1 = 250g
        ]
    }
    response = await async_client.post("/api/v1/missions", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "DRAFT"
    assert data["total_cargo_weight_grams"] == 950

@pytest.mark.asyncio
async def test_dom_002_payload_overload_protection(async_client, test_db_path):
    """TEST-DOM-002: Bloqueo por sobrecarga de carga útil (>90% de max_payload)."""
    headers = await get_auth_headers(async_client)
    # Temporarily set all drones max_payload_grams = 1000 in DB (effective limit 900g)
    import sqlite3
    with sqlite3.connect(test_db_path) as conn:
        conn.execute("UPDATE drone_models SET max_payload_grams = 1000")
        conn.commit()

    # Create mission with 950g
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [
            {"supply_id": 1, "quantity": 2}, # 700g
            {"supply_id": 3, "quantity": 1}  # 250g -> total 950g
        ]
    }
    create_res = await async_client.post("/api/v1/missions", json=payload, headers=headers)
    mission_id = create_res.json()["mission_id"]

    # Calculate route -> should reject because 950g > 900g
    calc_res = await async_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 1, "dynamic_obstacle_simulation": False},
        headers=headers
    )
    assert calc_res.status_code == 409
    assert calc_res.json()["error"]["code"] == "INSUFFICIENT_FLEET"

    # Restore drone model 1 to 2000g
    with sqlite3.connect(test_db_path) as conn:
        conn.execute("UPDATE drone_models SET max_payload_grams = 2000 WHERE model_id = 1")
        conn.commit()

@pytest.mark.asyncio
async def test_dom_003_golden_hour_sla_enforcement(async_client):
    """TEST-DOM-003: Cumplimiento del SLA de la Hora Dorada (>60 min -> 422)."""
    headers = await get_auth_headers(async_client)
    # Origin and destination far apart (approx 80km, flight time > 1 hour)
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.900000, "longitude": -77.042793, "altitude_meters": 120.0}, # ~95 km away
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 3, "quantity": 1}]
    }
    create_res = await async_client.post("/api/v1/missions", json=payload, headers=headers)
    mission_id = create_res.json()["mission_id"]

    calc_res = await async_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 1, "dynamic_obstacle_simulation": False},
        headers=headers
    )
    assert calc_res.status_code == 422
    assert calc_res.json()["error"]["code"] == "GOLDEN_HOUR_EXCEEDED"

@pytest.mark.asyncio
async def test_dom_004_thermosensitive_decay(async_client):
    """TEST-DOM-004: Invariante de insumo termosensible."""
    headers = await get_auth_headers(async_client)
    # Supply 5 has max_transit_minutes = 20. Place destination ~25km away (>20 min at 18m/s)
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.280000, "longitude": -77.042793, "altitude_meters": 120.0}, # ~26 km -> ~1440 s = 24 min
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 5, "quantity": 1}]
    }
    create_res = await async_client.post("/api/v1/missions", json=payload, headers=headers)
    mission_id = create_res.json()["mission_id"]

    calc_res = await async_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 1, "dynamic_obstacle_simulation": False},
        headers=headers
    )
    assert calc_res.status_code == 422
    assert calc_res.json()["error"]["code"] == "THERMAL_DECAY_EXCEEDED"

@pytest.mark.asyncio
async def test_dom_005_fsm_invalid_transition(async_client):
    """TEST-DOM-005: Transición de estados en FSM."""
    headers = await get_auth_headers(async_client)
    # Create normal mission
    payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.050000, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 3, "quantity": 1}]
    }
    create_res = await async_client.post("/api/v1/missions", json=payload, headers=headers)
    mission_id = create_res.json()["mission_id"]

    # Calculate route -> transitions to OPTIMIZING
    await async_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={"required_swarm_size": 1, "dynamic_obstacle_simulation": False},
        headers=headers
    )

    # First dispatch -> transitions to ACTIVE (200 OK)
    disp1 = await async_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=headers)
    assert disp1.status_code == 200
    assert disp1.json()["status"] == "ACTIVE"

    # Second dispatch -> invalid transition from ACTIVE -> should return 409
    disp2 = await async_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=headers)
    assert disp2.status_code == 409
    assert disp2.json()["error"]["code"] == "INVALID_STATE"
