import os
import math
import random
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from proyectocompe.schemas.detection import (
    TargetDetectionCreate,
    TargetDetection,
    TargetClass,
)
from proyectocompe.schemas.geofence import GeofenceCreate, GeofenceType, GeofenceCoordinate
from proyectocompe.services.detection_db import detection_db
from proyectocompe.services.geo_projection import geo_projection_service
from proyectocompe.services.detection_clustering import clustering_service
from proyectocompe.services.task_dispatcher import task_dispatcher
from proyectocompe.services.swarm_simulator import swarm_simulator
from proyectocompe.services.geofence_service import geofence_service
from proyectocompe.services.ai_monitor_service import ai_monitor
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG
from proyectocompe.websockets.connection_mgr import ws_manager

router = APIRouter()

@router.post("", response_model=TargetDetection)
async def ingest_ai_detection(payload: TargetDetectionCreate):
    """
    Primary Ingestion Endpoint for Edge AI / D-FINE (RT-DETR) Detection Engine.
    1. Computes ground WGS84 coordinates via ray casting and gimbal angles.
    2. Clusters and deduplicates with existing nearby targets (prevents alert flooding).
    3. Persists target and stores image snapshot on disk.
    4. Broadcasts priority TARGET_ACQUIRED / TARGET_UPDATED alert via WebSocket.
    5. Evaluates autonomous task allocation to dispatch nearest drone for new targets.
    6. Automatically creates dynamic No-Fly Zone (NFZ) if target is a FIRE_HAZARD.
    """
    ai_monitor.increment_detections()

    # Retrieve current drone kinematics from simulator or registry
    drone_data = swarm_simulator.agents.get(payload.drone_id, {
        "lat": -12.0463,
        "lon": -77.0428,
        "alt": 30.0,
        "heading": 0.0,
    })

    # Process geo projection
    candidate = geo_projection_service.process_detection(payload, drone_data)

    # Ingest and cluster spatially (<8m radius) and temporally
    target, is_new = await clustering_service.ingest_and_cluster(candidate)

    if is_new:
        # Check for dynamic hazard geofencing (e.g. Fire hazard requires automated keep-out NFZ)
        if target.target_class == TargetClass.FIRE_HAZARD:
            circle_pts = []
            r_m = 28.0
            for i in range(12):
                ang = (2 * math.pi * i) / 12
                dx = r_m * math.cos(ang)
                dy = r_m * math.sin(ang)
                p_lat = target.estimated_lat + (dy / METERS_PER_LAT_DEG)
                p_lon = target.estimated_lon + (dx / (METERS_PER_LAT_DEG * math.cos(math.radians(target.estimated_lat))))
                circle_pts.append(GeofenceCoordinate(lat=round(p_lat, 7), lon=round(p_lon, 7)))

            new_nfz = geofence_service.create_geofence(GeofenceCreate(
                name=f"FUEGO ACTIVO (DYN-{target.detection_id})",
                fence_type=GeofenceType.KEEP_OUT,
                polygon=circle_pts,
                min_alt_m=0.0,
                max_alt_m=100.0
            ))
            await ws_manager.broadcast_frame({
                "event_type": "DYNAMIC_NFZ_CREATED",
                "fence_id": new_nfz.fence_id,
                "name": new_nfz.name,
                "center": {"lat": target.estimated_lat, "lon": target.estimated_lon},
                "radius_m": r_m
            })

        # Broadcast real-time TARGET_ACQUIRED alert to HUD / 3D dashboard
        alert_event = {
            "event_type": "TARGET_ACQUIRED",
            "detection_id": target.detection_id,
            "target_class": target.target_class.value,
            "priority": target.priority.value,
            "confidence": target.confidence,
            "observation_count": target.observation_count,
            "reported_by": target.drone_id,
            "coordinates": {
                "lat": target.estimated_lat,
                "lon": target.estimated_lon,
                "alt": target.estimated_alt
            },
            "snapshot_url": target.snapshot_url,
            "reported_at": target.reported_at
        }
        await ws_manager.broadcast_frame(alert_event)

        # Trigger autonomous task dispatcher for high-priority targets
        await task_dispatcher.auto_dispatch_target(target, swarm_simulator.agents)
    else:
        # Broadcast TARGET_UPDATED event without flooding new drone dispatches
        update_event = {
            "event_type": "TARGET_UPDATED",
            "detection_id": target.detection_id,
            "target_class": target.target_class.value,
            "confidence": target.confidence,
            "observation_count": target.observation_count,
            "coordinates": {
                "lat": target.estimated_lat,
                "lon": target.estimated_lon
            },
            "snapshot_url": target.snapshot_url,
            "last_seen_at": target.last_seen_at
        }
        await ws_manager.broadcast_frame(update_event)

    return target

@router.get("/{detection_id}/snapshot")
async def get_detection_snapshot(detection_id: str):
    """Serves the JPEG image snapshot of the detected target."""
    target = await detection_db.get_detection(detection_id)
    if not target or not target.snapshot_path or not os.path.exists(target.snapshot_path):
        raise HTTPException(status_code=404, detail="Snapshot not found for this detection")
    return FileResponse(target.snapshot_path, media_type="image/jpeg")

@router.get("", response_model=List[TargetDetection])
async def list_detections(
    target_class: Optional[TargetClass] = None,
    min_confidence: float = Query(default=0.0, ge=0.0, le=1.0),
    status: Optional[str] = None
):
    """Retrieve history of all detected targets with optional filters."""
    class_str = target_class.value if target_class else None
    return await detection_db.get_all_detections(
        target_class=class_str,
        min_confidence=min_confidence,
        status=status
    )

@router.get("/export/geojson")
async def export_targets_geojson():
    """
    Exports all target detections as a standard GeoJSON FeatureCollection.
    Ready for direct import into MapLibre GL JS, QGIS, or Leaflet.
    """
    geojson_data = await detection_db.export_geojson()
    return JSONResponse(content=geojson_data)

@router.post("/{detection_id}/assign")
async def manual_assign_drone(detection_id: str, drone_id: str):
    """Manually assign a fleet drone to investigate a detected target."""
    if drone_id not in swarm_simulator.agents:
        raise HTTPException(status_code=404, detail=f"Drone {drone_id} not found in fleet")
    
    await detection_db.update_status(detection_id, "INVESTIGATING", drone_id)
    return {"status": "SUCCESS", "detection_id": detection_id, "assigned_drone": drone_id}

@router.post("/simulate-test", response_model=TargetDetection)
async def simulate_detection_test(target_class: Optional[TargetClass] = None):
    """
    Simulation & Demo Helper: Injects a high-confidence target detection.
    Useful for live competition presentations and frontend testing.
    """
    reporting_drone = random.choice(list(swarm_simulator.agents.keys()))
    if target_class:
        chosen_class = target_class
    else:
        test_classes = [TargetClass.SURVIVOR, TargetClass.FIRE_HAZARD, TargetClass.VEHICLE]
        chosen_class = random.choice(test_classes)

    payload = TargetDetectionCreate(
        drone_id=reporting_drone,
        target_class=chosen_class,
        confidence=round(random.uniform(0.88, 0.98), 2),
        camera_pitch_deg=-45.0,
        camera_yaw_deg=0.0,
    )
    return await ingest_ai_detection(payload)
