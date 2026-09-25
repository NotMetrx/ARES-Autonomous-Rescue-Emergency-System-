import asyncio
from proyectocompe.schemas.ai_engine import AIHeartbeatPayload
from proyectocompe.services.ai_monitor_service import ai_monitor
from proyectocompe.services.coverage_service import coverage_service
from proyectocompe.services.aar_report_service import aar_service
from proyectocompe.schemas.detection import TargetDetectionCreate, TargetClass
from proyectocompe.api.v1.endpoints.detections import ingest_ai_detection
from proyectocompe.services.geofence_service import geofence_service

async def run_extension_tests():
    print("=" * 60)
    print("[TEST 1] Testing Edge AI Engine Heartbeat & Watchdog...")
    print("=" * 60)
    hb_payload = AIHeartbeatPayload(
        node_id="JETSON-ORIN-01",
        model_name="D-FINE-L (RT-DETR)",
        status="ONLINE",
        fps=29.2,
        gpu_temp_c=47.1,
        vram_usage_mb=2150.0,
        last_inference_latency_ms=13.5
    )
    status = ai_monitor.record_heartbeat(hb_payload)
    assert status.is_online is True
    assert status.fps == 29.2
    assert status.node_id == "JETSON-ORIN-01"
    print(f" -> AI Node Status: {status.status}, FPS: {status.fps}, GPU: {status.gpu_temp_c}°C, Online: {status.is_online}")

    print("\n" + "=" * 60)
    print("[TEST 2] Testing Ground Coverage Grid Tracking...")
    print("=" * 60)
    # Simulate drone sweeping over base
    coverage_service.reset()
    base_lat = -12.046374
    base_lon = -77.042793
    coverage_service.update_drone_coverage(base_lat, base_lon, 30.0)
    coverage_service.update_drone_coverage(base_lat + 0.0002, base_lon + 0.0002, 30.0)
    cov_stats = coverage_service.get_stats()
    assert cov_stats["visited_cells_count"] > 0
    assert cov_stats["coverage_pct"] > 0.0
    print(f" -> Coverage: {cov_stats['coverage_pct']}% ({cov_stats['covered_area_m2']} m² of {cov_stats['total_area_m2']} m²)")

    print("\n" + "=" * 60)
    print("[TEST 3] Testing Dynamic Hazard Geofence Auto-Generation (FIRE_HAZARD)...")
    print("=" * 60)
    initial_fences = len(geofence_service.get_all_geofences())
    fire_payload = TargetDetectionCreate(
        drone_id="ARES-01",
        target_class=TargetClass.FIRE_HAZARD,
        confidence=0.94,
        camera_pitch_deg=-45.0,
        camera_yaw_deg=10.0
    )
    target = await ingest_ai_detection(fire_payload)
    all_fences = geofence_service.get_all_geofences()
    assert len(all_fences) > initial_fences, "Dynamic NFZ should be registered automatically"
    dyn_fence = next((f for f in all_fences if "FUEGO" in f.name), None)
    assert dyn_fence is not None
    assert dyn_fence.fence_type.value == "KEEP_OUT"
    print(f" -> Dynamic NFZ created: '{dyn_fence.name}' with {len(dyn_fence.polygon)} vertices around fire target {target.detection_id}")

    print("\n" + "=" * 60)
    print("[TEST 4] Testing After-Action Review (AAR) Scorecard & Report Engine...")
    print("=" * 60)
    report = await aar_service.generate_aar_report("SAR-COMPETITION-FINAL")
    assert report["overall_score"] > 0
    assert "score_breakdown" in report
    assert "kpis" in report
    print(f" -> AAR Performance Score: {report['overall_score']}/100 ({report['performance_grade']})")
    print(f"    - Survivors Located: {report['kpis']['survivors_located']}")
    print(f"    - Hazards Identified: {report['kpis']['hazards_identified']}")
    print(f"    - Area Coverage: {report['kpis']['area_coverage_pct']}%")

    html_rep = await aar_service.render_html_report("SAR-COMPETITION-FINAL")
    assert "<!DOCTYPE html>" in html_rep
    assert "ARES Tactical C2 - Reporte After-Action Review" in html_rep
    print(f" -> Generated printable HTML AAR Report ({len(html_rep)} bytes) successfully.")

    print("\n" + "=" * 60)
    print("[TEST 5] Testing Self-Healing Swarm Dynamic Re-partitioning...")
    print("=" * 60)
    from proyectocompe.services.swarm_resilience_service import swarm_resilience
    from proyectocompe.schemas.drone import DroneFSMState
    from proyectocompe.services.swarm_simulator import swarm_simulator

    heal_res = await swarm_resilience.handle_drone_failure("ARES-02")
    assert heal_res["status"] == "SELF_HEALED"
    assert heal_res["failed_drone"] == "ARES-02"
    assert "ARES-02" not in heal_res["surviving_drones"]
    print(f" -> Swarm Self-Healed: Drone ARES-02 failure handled. Reallocated waypoints to {heal_res['surviving_drones']}.")

    print("\n" + "=" * 60)
    print("[TEST 6] Testing Tactical Battery Handover Loop...")
    print("=" * 60)
    # Force low battery on ARES-01, good battery on ARES-03
    swarm_simulator.agents["ARES-01"]["battery"] = 15.0
    swarm_simulator.agents["ARES-01"]["fsm"] = DroneFSMState.ROUTING
    swarm_simulator.agents["ARES-03"]["battery"] = 92.0
    swarm_simulator.agents["ARES-03"]["fsm"] = DroneFSMState.IN_FLIGHT
    swarm_resilience.last_handover_time = 0.0

    handover = await swarm_resilience.evaluate_battery_handovers()
    assert handover is not None
    assert handover["low_battery_drone"] == "ARES-01"
    assert handover["relief_drone"] == "ARES-03"
    print(f" -> Autonomous Handover: {handover['message']}")

    # Restore fleet
    swarm_resilience.restore_fleet()
    assert swarm_simulator.agents["ARES-01"]["battery"] > 90.0
    print(" -> Fleet successfully restored to healthy state.")

    print("\n" + "=" * 60)
    print("ALL NEW C2 BACKEND EXTENSION TESTS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_extension_tests())
