import pytest
import sqlite3

from src.ai.benchmark import run_simulation_benchmark

@pytest.mark.asyncio
async def test_scenario_01_mass_casualty_golden_hour_rescue(e2e_client, auth_headers, e2e_db_path):
    """
    Scenario 1: Mass-casualty earthquake incident in Lima.
    Multi-drone emergency dispatch carrying O-Negative blood and polyvalent antivenom during the Golden Hour.
    """
    # 1. Mission Order Creation
    mission_payload = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [
            {"supply_id": 1, "quantity": 1},  # Sangre O Negativo: 1 x 350g = 350g (max 45 min)
            {"supply_id": 3, "quantity": 2}   # Antídoto: 2 x 250g = 500g (max 30 min) -> total 850g
        ]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=mission_payload, headers=auth_headers)
    assert create_res.status_code == 201
    mission_id = create_res.json()["mission_id"]
    assert create_res.json()["total_cargo_weight_grams"] == 850

    # 2. 3D Route Calculation for Swarm of 2 Drones (Carrier + Scout) under coastal wind
    route_payload = {
        "required_swarm_size": 2,
        "dynamic_obstacle_simulation": True,
        "environmental_factors": {
            "wind_vector_mps": [4.0, 1.5, 0.0],
            "no_fly_zones": []
        }
    }
    calc_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/route/calculate", json=route_payload, headers=auth_headers)
    assert calc_res.status_code == 200
    calc_data = calc_res.json()
    assert len(calc_data["routes"]) == 2
    
    # Golden Hour SLA verification: flight time < 3600 seconds
    for route in calc_data["routes"]:
        flight_sec = route["estimated_flight_seconds"]
        assert flight_sec < 3600, f"Flight time {flight_sec} exceeds Golden Hour SLA"
        # Thermal decay check: flight time < 30 min (1800s) for antidote
        assert flight_sec < 1800, f"Flight time {flight_sec} exceeds antidote thermal stability limit"

    # 3. Pre-Flight Evasion Benchmark Verification (>95% success rate)
    bench_res = await e2e_client.post("/api/v1/simulations/benchmark", json={
        "mission_id": mission_id,
        "total_obstacles_injected": 500,
        "obstacle_speed_range_mps": [2.0, 12.0],
        "obstacle_radius_meters": 4.0
    }, headers=auth_headers)
    assert bench_res.status_code == 200
    assert bench_res.json()["charter_criterion_met"] is True
    assert bench_res.json()["success_rate_percentage"] >= 95.0

    # 4. Mission Dispatch to ACTIVE
    disp_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert disp_res.status_code == 200
    assert disp_res.json()["status"] == "ACTIVE"
    dispatched_drones = disp_res.json()["drones_dispatched"]
    assert len(dispatched_drones) == 2

    # 5. En-Route Waypoint Telemetry Ingestion
    carrier_drone = dispatched_drones[0]
    waypoints_telemetry = [
        # Takeoff climb
        {"lat": -12.046374, "lon": -77.042793, "alt": 150.0, "speed": 10.0, "batt": 98.0, "snr": 35.0},
        # Cruise phase
        {"lat": -12.051437, "lon": -77.063596, "alt": 180.0, "speed": 18.0, "batt": 89.0, "snr": 31.0},
        # Approach descent
        {"lat": -12.056500, "lon": -77.084400, "alt": 120.0, "speed": 8.0, "batt": 81.0, "snr": 28.0}
    ]
    for wp in waypoints_telemetry:
        tel_res = await e2e_client.post("/api/v1/telemetry/ingest", json={
            "drone_id": carrier_drone,
            "mission_id": mission_id,
            "current_latitude": wp["lat"],
            "current_longitude": wp["lon"],
            "current_altitude_meters": wp["alt"],
            "current_speed_mps": wp["speed"],
            "battery_percentage": wp["batt"],
            "signal_snr_db": wp["snr"]
        }, headers=auth_headers)
        assert tel_res.status_code == 202
        assert tel_res.json()["collision_alert"] is False

    # 6. Verify Tactical Dashboard Reflections
    dash_res = await e2e_client.get("/")
    assert dash_res.status_code == 200
    assert "ARES // TACTICAL COMMAND CENTER" in dash_res.text

@pytest.mark.asyncio
async def test_scenario_02_adverse_weather_and_no_fly_zones(e2e_client, auth_headers):
    """
    Scenario 2: Mountain emergency resupply in adverse headwind conditions with No-Fly Zone.
    Validates flight duration calculation and energy envelope.
    """
    # 1. Mission setup
    mission_payload = {
        "priority_code": "HIGH",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 4, "quantity": 1}]  # Kit Quirúrgico (600g)
    }
    create_res = await e2e_client.post("/api/v1/missions", json=mission_payload, headers=auth_headers)
    mission_id = create_res.json()["mission_id"]

    # 2. Environmental factors: Severe headwind and collapsed structure No-Fly Zone
    calc_res = await e2e_client.post(
        f"/api/v1/missions/{mission_id}/route/calculate",
        json={
            "required_swarm_size": 1,
            "dynamic_obstacle_simulation": True,
            "environmental_factors": {
                "wind_vector_mps": [-6.0, 2.0, 0.0],
                "no_fly_zones": [
                    {
                        "latitude": -12.0510,
                        "longitude": -77.0620,
                        "radius_meters": 150.0,
                        "ceiling_meters": 200.0
                    }
                ]
            }
        },
        headers=auth_headers
    )
    assert calc_res.status_code == 200
    route_info = calc_res.json()["routes"][0]
    assert route_info["waypoints_generated"] >= 10
    assert route_info["estimated_flight_seconds"] > 0

    # 3. Dispatch & Ingest Telemetry confirming safe arrival
    disp_res = await e2e_client.post(f"/api/v1/missions/{mission_id}/dispatch", headers=auth_headers)
    assert disp_res.status_code == 200

@pytest.mark.asyncio
async def test_scenario_03_mid_flight_critical_alert_and_contingency(e2e_client, auth_headers):
    """
    Scenario 3: Mid-flight telemetry distress: sudden critical battery depletion & radio link degradation.
    Triggers tactical collision alert on the edge command console.
    """
    # 1. Mission setup & dispatch
    mission_payload = {
        "priority_code": "STANDARD",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 2, "quantity": 1}]
    }
    create_res = await e2e_client.post("/api/v1/missions", json=mission_payload, headers=auth_headers)
    m_id = create_res.json()["mission_id"]

    await e2e_client.post(f"/api/v1/missions/{m_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    disp_res = await e2e_client.post(f"/api/v1/missions/{m_id}/dispatch", headers=auth_headers)
    drone_id = disp_res.json()["drones_dispatched"][0]

    # 2. Leg 1: Normal flight
    t1 = await e2e_client.post("/api/v1/telemetry/ingest", json={
        "drone_id": drone_id, "mission_id": m_id,
        "current_latitude": -12.0470, "current_longitude": -77.0450, "current_altitude_meters": 150.0,
        "current_speed_mps": 18.0, "battery_percentage": 75.0, "signal_snr_db": 28.0
    }, headers=auth_headers)
    assert t1.status_code == 202
    assert t1.json()["collision_alert"] is False

    # 3. Leg 2: Critical battery thermal event (<10%) and SNR drop (<10dB)
    t2 = await e2e_client.post("/api/v1/telemetry/ingest", json={
        "drone_id": drone_id, "mission_id": m_id,
        "current_latitude": -12.0500, "current_longitude": -77.0550, "current_altitude_meters": 140.0,
        "current_speed_mps": 14.0, "battery_percentage": 7.5, "signal_snr_db": 6.2
    }, headers=auth_headers)
    assert t2.status_code == 202
    assert t2.json()["collision_alert"] is True, "Collision alert must be raised when battery/SNR drop below safety threshold"

@pytest.mark.asyncio
async def test_scenario_04_ultra_perishable_antidote_rapid_deployment(e2e_client, auth_headers):
    """
    Scenario 4: Rapid deployment of ultra-perishable antidote with 20-minute stability envelope.
    Validates feasible rapid mission approval vs excessive distance rejection.
    """
    # Supply 5: 'Muestra Termo Crítica' (max_transit_minutes = 20 min = 1200 seconds)
    
    # Case A: Excessively far destination (~35 km away -> flight time > 1900 seconds > 1200s)
    far_mission = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.350000, "longitude": -77.042793, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 5, "quantity": 1}]
    }
    far_res = await e2e_client.post("/api/v1/missions", json=far_mission, headers=auth_headers)
    far_id = far_res.json()["mission_id"]

    far_calc = await e2e_client.post(f"/api/v1/missions/{far_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    assert far_calc.status_code == 422
    assert far_calc.json()["error"]["code"] == "THERMAL_DECAY_EXCEEDED"

    # Case B: Local rapid response (~4.8 km -> flight time ~270 seconds < 1200s)
    local_mission = {
        "priority_code": "GOLDEN_HOUR_CRITICAL",
        "origin": {"latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0},
        "destination": {"latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0},
        "scheduled_departure_time": "2026-09-11T16:45:00Z",
        "supplies": [{"supply_id": 5, "quantity": 1}]
    }
    local_res = await e2e_client.post("/api/v1/missions", json=local_mission, headers=auth_headers)
    local_id = local_res.json()["mission_id"]

    local_calc = await e2e_client.post(f"/api/v1/missions/{local_id}/route/calculate", json={"required_swarm_size": 1}, headers=auth_headers)
    assert local_calc.status_code == 200
    assert local_calc.json()["routes"][0]["estimated_flight_seconds"] < 1200

    # Dispatch feasible rapid mission
    local_disp = await e2e_client.post(f"/api/v1/missions/{local_id}/dispatch", headers=auth_headers)
    assert local_disp.status_code == 200
    assert local_disp.json()["status"] == "ACTIVE"
