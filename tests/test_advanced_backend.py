import asyncio
import os
import time
from proyectocompe.schemas.detection import TargetDetectionCreate, TargetClass
from proyectocompe.schemas.geofence import GeofenceCreate, GeofenceType, GeofenceCoordinate
from proyectocompe.schemas.mission import SearchGridRequest
from proyectocompe.schemas.telemetry import ExternalTelemetryIngest, DroneFSMState
from proyectocompe.services.detection_clustering import clustering_service
from proyectocompe.services.detection_db import detection_db
from proyectocompe.services.geo_projection import geo_projection_service
from proyectocompe.services.geofence_service import geofence_service
from proyectocompe.services.mission_service import mission_service
from proyectocompe.services.flight_recorder import flight_recorder
from proyectocompe.services.swarm_simulator import swarm_simulator

async def run_advanced_tests():
    print("=" * 60)
    print("[TEST 1] AI Detection Clustering & Deduplication + Disk Snapshots")
    print("=" * 60)
    rand_offset = (time.time() % 1000) * 0.002
    drone_mock = {"lat": -12.0463 + rand_offset, "lon": -77.0428 + rand_offset, "alt": 30.0, "yaw": 0.0}
    dummy_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    payload1 = TargetDetectionCreate(
        drone_id="ARES-01",
        target_class=TargetClass.SURVIVOR,
        confidence=0.88,
        camera_pitch_deg=-45.0,
        camera_yaw_deg=0.0,
        snapshot_base64=dummy_b64
    )
    t1_proj = geo_projection_service.process_detection(payload1, drone_mock)
    target1, is_new1 = await clustering_service.ingest_and_cluster(t1_proj)
    assert is_new1 is True, "First detection must be registered as new"
    assert target1.observation_count == 1
    assert target1.snapshot_path is not None
    assert os.path.exists(target1.snapshot_path)
    print(f" -> Created target {target1.detection_id}, is_new={is_new1}, obs={target1.observation_count}, snap={target1.snapshot_path}")

    # Send second detection of same class at virtually same spot (<8m away)
    payload2 = TargetDetectionCreate(
        drone_id="ARES-01",
        target_class=TargetClass.SURVIVOR,
        confidence=0.96, # Higher confidence
        camera_pitch_deg=-44.9,
        camera_yaw_deg=0.1,
    )
    t2_proj = geo_projection_service.process_detection(payload2, drone_mock)
    target2, is_new2 = await clustering_service.ingest_and_cluster(t2_proj)
    assert is_new2 is False, "Second detection must be clustered with the existing target!"
    assert target2.detection_id == target1.detection_id, "Clustered target must maintain same detection_id"
    assert target2.observation_count == 2, f"Observation count should be 2, got {target2.observation_count}"
    assert target2.confidence == 0.96, f"Confidence should be updated to higher 0.96, got {target2.confidence}"
    print(f" -> Clustered successfully! Target {target2.detection_id}, obs={target2.observation_count}, conf={target2.confidence}")

    print("\n" + "=" * 60)
    print("[TEST 2] Geofencing & No-Fly Zone (NFZ) Point-in-Polygon Engine")
    print("=" * 60)
    fences = geofence_service.get_all_geofences()
    assert len(fences) >= 2, f"Should have seeded default geofences, got {len(fences)}"
    
    # Test point inside NFZ (North-East mast)
    base_lat = -12.046374
    base_lon = -77.042793
    inside_nfz_drones = [
        {"drone_id": "TEST-INTRUDER", "lat": base_lat + 0.00035, "lon": base_lon + 0.00030, "alt": 30.0}
    ]
    alerts = geofence_service.evaluate_swarm_geofences(inside_nfz_drones)
    assert len(alerts) > 0, "Drone inside NFZ must trigger a breach alert!"
    assert alerts[0].breach_type == "KEEP_OUT_INTRUSION"
    print(f" -> NFZ intrusion detected: {alerts[0].message} ({alerts[0].distance_to_boundary_m}m to boundary)")

    print("\n" + "=" * 60)
    print("[TEST 3] Boustrophedon (Lawnmower) Multi-UAV Search Grid Generator")
    print("=" * 60)
    grid_req = SearchGridRequest(
        mission_name="SAR Zone Sweep Alpha",
        assigned_drone_ids=["ARES-01", "ARES-02", "ARES-03"],
        width_meters=180.0,
        height_meters=120.0,
        swath_spacing_m=30.0,
        altitude_m=35.0,
    )
    mission = mission_service.generate_search_grid(grid_req, base_lat, base_lon)
    assert len(mission.drone_waypoints) == 3
    assert all(len(wps) > 0 for wps in mission.drone_waypoints.values())
    saved_m = await mission_service.save_mission(mission)
    assert saved_m.mission_id == mission.mission_id
    all_missions = await mission_service.get_all_missions()
    assert len(all_missions) > 0
    print(f" -> Mission {mission.mission_id} generated for 3 drones with {mission.total_waypoints} total waypoints and saved to SQLite.")

    print("\n" + "=" * 60)
    print("[TEST 4] Black Box Flight Recorder & Replay Engine")
    print("=" * 60)
    session_id = flight_recorder.start_recording("test_run")
    assert flight_recorder.is_recording is True
    # Record mock frames
    for i in range(5):
        frame = swarm_simulator.update_physics()
    res = flight_recorder.stop_recording()
    assert res["status"] == "STOPPED"
    assert res["frames_recorded"] >= 5
    records = flight_recorder.list_recordings()
    assert len(records) > 0
    print(f" -> Black box recorded {res['frames_recorded']} frames in session {session_id}.")

    print("\n" + "=" * 60)
    print("[TEST 5] External Telemetry Ingestion & Link Watchdog")
    print("=" * 60)
    ext_payload = ExternalTelemetryIngest(
        drone_id="SITL-MAV-01",
        lat=-12.0470,
        lon=-77.0435,
        alt=45.0,
        speed_ms=12.0,
        yaw=90.0,
        battery=88.0,
        fsm_state=DroneFSMState.IN_FLIGHT
    )
    ingest_res = swarm_simulator.ingest_external_telemetry(ext_payload)
    assert ingest_res["status"] == "INGESTED"
    assert "SITL-MAV-01" in swarm_simulator.agents
    agent = swarm_simulator.agents["SITL-MAV-01"]
    assert agent["is_external"] is True
    assert agent["lat"] == -12.0470
    print(f" -> Ingested real external drone SITL-MAV-01 at Lat={agent['lat']}, Lon={agent['lon']}, Battery={agent['battery']}%.")

    print("\n" + "=" * 60)
    print("ALL ADVANCED BACKEND MODULE TESTS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_advanced_tests())
