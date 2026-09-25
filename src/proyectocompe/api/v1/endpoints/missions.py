import uuid
import time
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse, PlainTextResponse
from proyectocompe.schemas.mission import (
    MissionCreate,
    MissionStatus,
    SearchGridRequest,
    Waypoint,
)
from proyectocompe.services.mission_service import mission_service
from proyectocompe.services.swarm_simulator import swarm_simulator
from proyectocompe.services.coverage_service import coverage_service
from proyectocompe.services.aar_report_service import aar_service

router = APIRouter()

@router.get("", response_model=List[MissionStatus])
async def get_missions():
    """Returns all scheduled and active swarm missions from SQLite database."""
    return await mission_service.get_all_missions()

@router.post("", response_model=MissionStatus)
async def create_mission(mission_in: MissionCreate):
    """Deploy a new multi-drone mission plan with 3D waypoints."""
    new_mission = MissionStatus(
        mission_id=f"MSN-{str(uuid.uuid4())[:6].upper()}",
        mission_name=mission_in.mission_name,
        status="ACTIVE",
        assigned_drones=mission_in.target_drone_ids,
        current_waypoint_index=0,
        total_waypoints=len(mission_in.waypoints),
        created_at=time.time(),
        drone_waypoints={d_id: mission_in.waypoints for d_id in mission_in.target_drone_ids}
    )
    return await mission_service.save_mission(new_mission)

@router.post("/generate-search-grid", response_model=MissionStatus)
async def generate_search_grid(req: SearchGridRequest):
    """
    Generates an automated, partitioned Boustrophedon (lawnmower) search grid for N drones.
    Splits the search area into non-overlapping sweep sectors and persists in SQLite.
    """
    base_lat = swarm_simulator.base_lat
    base_lon = swarm_simulator.base_lon
    mission = mission_service.generate_search_grid(req, base_lat, base_lon)
    return await mission_service.save_mission(mission)

@router.get("/coverage")
async def get_search_coverage():
    """Returns real-time ground coverage statistics and scanned cells."""
    return coverage_service.get_stats()

@router.post("/coverage/reset")
async def reset_search_coverage():
    """Resets the accumulated ground coverage grid."""
    coverage_service.reset()
    return {"status": "SUCCESS", "message": "Coverage grid reset to 0%"}

@router.get("/{mission_id}/aar-report")
async def get_mission_aar_report(mission_id: str):
    """Generates an After-Action Review (AAR) evaluation report in JSON format."""
    return await aar_service.generate_aar_report(mission_id)

@router.get("/{mission_id}/aar-report/html", response_class=HTMLResponse)
async def get_mission_aar_html(mission_id: str):
    """Generates a printable, polished After-Action Review (AAR) report in HTML for judges."""
    return await aar_service.render_html_report(mission_id)

@router.get("/{mission_id}/export/qgc", response_class=PlainTextResponse)
async def export_mission_qgc(mission_id: str, drone_id: Optional[str] = None):
    """
    Exports mission waypoints to standard QGroundControl WPL 110 format (.waypoints).
    Compatible with PX4, ArduPilot, QGroundControl and Mission Planner.
    """
    missions = await mission_service.get_all_missions()
    target_m = next((m for m in missions if m.mission_id == mission_id), None)
    if not target_m:
        if missions:
            target_m = missions[0]
        else:
            raise HTTPException(status_code=404, detail="No mission found to export")

    # Select waypoints for specified drone or first drone
    chosen_drone = drone_id if drone_id and drone_id in target_m.drone_waypoints else (
        list(target_m.drone_waypoints.keys())[0] if target_m.drone_waypoints else None
    )

    waypoints: List[Waypoint] = target_m.drone_waypoints.get(chosen_drone, []) if chosen_drone else []

    lines = ["QGC WPL 110"]
    home_lat = swarm_simulator.base_lat
    home_lon = swarm_simulator.base_lon

    # Line 0: Home Position
    lines.append(f"0\t1\t0\t16\t0\t0\t0\t0\t{home_lat:.7f}\t{home_lon:.7f}\t0.000000\t1")

    # Subsequent waypoints
    for i, wp in enumerate(waypoints, start=1):
        lines.append(f"{i}\t0\t3\t16\t0.000000\t2.000000\t0.000000\t0.000000\t{wp.lat:.7f}\t{wp.lon:.7f}\t{wp.alt:.6f}\t1")

    content = "\n".join(lines)
    return PlainTextResponse(
        content=content,
        headers={
            "Content-Disposition": f'attachment; filename="{target_m.mission_id}_{chosen_drone or "fleet"}.waypoints"'
        }
    )

@router.get("/{mission_id}/export/dossier")
async def export_mission_dossier(mission_id: str):
    """
    Exports a complete official evidence dossier in a ZIP file for competition judges.
    Includes: HTML AAR Report, JSON metrics, full-res photos, GeoJSON, QGC waypoints, and Black Box logs.
    """
    from proyectocompe.services.dossier_service import dossier_service
    zip_buffer = await dossier_service.generate_dossier_zip(mission_id)
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="ARES_TACTICAL_DOSSIER_{mission_id}.zip"'
        }
    )

@router.post("/{mission_id}/abort")
async def abort_mission(mission_id: str):
    """Aborts an in-flight mission."""
    missions = await mission_service.get_all_missions()
    target_m = next((m for m in missions if m.mission_id == mission_id), None)
    if not target_m:
        raise HTTPException(status_code=404, detail="Mission not found")
    target_m.status = "ABORTED"
    await mission_service.save_mission(target_m)
    return {"status": "SUCCESS", "mission_id": mission_id, "action": "ABORTED"}
