import random
import time
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from proyectocompe.schemas.detection import TargetDetectionCreate, TargetClass
from proyectocompe.services.swarm_simulator import swarm_simulator
from proyectocompe.services.swarm_resilience_service import swarm_resilience
from proyectocompe.api.v1.endpoints.detections import ingest_ai_detection

router = APIRouter()

@router.post("/inject-drone-failure")
async def inject_drone_failure(drone_id: str = Query(default="ARES-02")):
    """
    Chaos Engineering: Injects a mid-air catastrophic failure or link loss on a drone.
    Demonstrates autonomic Self-Healing Swarm Re-partitioning in real time.
    """
    if drone_id not in swarm_simulator.agents:
        raise HTTPException(status_code=404, detail=f"Drone {drone_id} not found")

    result = await swarm_resilience.handle_drone_failure(drone_id)
    return result

@router.post("/inject-battery-drain")
async def inject_battery_drain(
    drone_id: str = Query(default="ARES-01"),
    target_battery: float = Query(default=18.0, ge=1.0, le=30.0)
):
    """
    Chaos Engineering: Drains a drone's battery to a critical level (<22%).
    Triggers autonomous tactical battery handover and relief dispatch.
    """
    if drone_id not in swarm_simulator.agents:
        raise HTTPException(status_code=404, detail=f"Drone {drone_id} not found")

    swarm_simulator.agents[drone_id]["battery"] = target_battery
    handover_res = await swarm_resilience.evaluate_battery_handovers()

    return {
        "status": "BATTERY_DRAINED",
        "drone_id": drone_id,
        "new_battery_pct": target_battery,
        "handover_triggered": handover_res is not None,
        "handover_event": handover_res
    }

@router.post("/inject-detection-burst")
async def inject_detection_burst(count: int = Query(default=8, ge=2, le=25)):
    """
    Chaos Engineering: Fires a burst of N concurrent AI detections.
    Validates that the spatio-temporal clustering and C2 telemetry remain smooth without frame drops.
    """
    classes = [TargetClass.SURVIVOR, TargetClass.VEHICLE, TargetClass.FIRE_HAZARD, TargetClass.INTRUDER]
    results = []

    for i in range(count):
        chosen_drone = random.choice(list(swarm_simulator.agents.keys()))
        chosen_class = random.choice(classes)
        payload = TargetDetectionCreate(
            drone_id=chosen_drone,
            target_class=chosen_class,
            confidence=round(random.uniform(0.88, 0.99), 2),
            camera_pitch_deg=-45.0,
            camera_yaw_deg=round(random.uniform(-30.0, 30.0), 1)
        )
        target = await ingest_ai_detection(payload)
        results.append({
            "detection_id": target.detection_id,
            "class": target.target_class.value,
            "observation_count": target.observation_count
        })

    return {
        "status": "BURST_COMPLETED",
        "burst_count": count,
        "detections": results
    }

@router.post("/restore-fleet")
async def restore_fleet():
    """Restores all fleet drones to healthy state, 100% battery, and IN_FLIGHT status."""
    return swarm_resilience.restore_fleet()
