import asyncio
import os
from proyectocompe.schemas.detection import TargetDetectionCreate, TargetClass
from proyectocompe.services.geo_projection import geo_projection_service
from proyectocompe.services.detection_db import detection_db
from proyectocompe.services.task_dispatcher import task_dispatcher
from proyectocompe.services.swarm_simulator import swarm_simulator

async def run_detection_pipeline_tests():
    print("[TEST 1] Testing Geo-Projection Raycasting...")
    # Drone at alt=40m, looking down at -45 deg pitch, yaw=0 (North)
    drone_mock = {"lat": -12.0463, "lon": -77.0428, "alt": 40.0, "yaw": 0.0}
    payload = TargetDetectionCreate(
        drone_id="ARES-01",
        target_class=TargetClass.SURVIVOR,
        confidence=0.95,
        camera_pitch_deg=-45.0,
        camera_yaw_deg=0.0
    )
    target = geo_projection_service.process_detection(payload, drone_mock)
    assert target.target_class == TargetClass.SURVIVOR
    assert target.priority.value == "CRITICAL"
    print(f" -> Projected Target: Lat={target.estimated_lat}, Lon={target.estimated_lon}, Priority={target.priority.value}")

    print("\n[TEST 2] Testing SQLite Detection Persistence & GeoJSON Export...")
    saved = await detection_db.save_detection(target)
    assert saved.detection_id == target.detection_id

    records = await detection_db.get_all_detections()
    assert len(records) > 0
    print(f" -> Persisted {len(records)} targets in SQLite database.")

    geojson = await detection_db.export_geojson()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0
    print(f" -> Exported GeoJSON with {len(geojson['features'])} feature(s) successfully.")

    print("\n[TEST 3] Testing Autonomous Swarm Task Dispatcher...")
    success, assigned_id, msg = await task_dispatcher.auto_dispatch_target(target, swarm_simulator.agents)
    assert success is True
    assert assigned_id in swarm_simulator.agents
    print(f" -> Autonomous Dispatch Success: {msg}")

    print("\nALL AI INGESTION & DISPATCH TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_detection_pipeline_tests())
