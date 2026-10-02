"""
ARES Onboard FPV Camera Video Streaming & Snapshot API Endpoints.
Supports MJPEG live multipart video, D-FINE object overlays, and dual RGB / FLIR mode.
"""
import asyncio
from fastapi import APIRouter, Response, Request, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from proyectocompe.services.camera_service import camera_service

router = APIRouter()

class CameraModeRequest(BaseModel):
    mode: str = "RGB" # "RGB" or "THERMAL_FLIR"

class GimbalControlRequest(BaseModel):
    pitch_deg: float = -45.0  # -90 (Nadir) to +15 (Horizon)
    yaw_deg: float = 0.0     # -180 to +180
    zoom: float = 1.0        # 1.0 to 4.0

# -------------------------------------------------------------
# Snapshots & Evidence Archive Endpoints (Declared first)
# -------------------------------------------------------------
@router.get("/snapshots")
async def list_camera_snapshots():
    """Returns catalog of all archived forensic FPV snapshots."""
    return camera_service.list_snapshots()

@router.get("/snapshots/{filename}")
async def get_camera_snapshot_file(filename: str):
    """Retrieves an archived forensic snapshot image file."""
    data = camera_service.get_snapshot_bytes(filename)
    if not data:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    media_type = "image/png" if filename.lower().endswith(".png") or data.startswith(b"\x89PNG") else "image/jpeg"
    return Response(content=data, media_type=media_type)

# -------------------------------------------------------------
# Live Streaming & Drone Camera Operations
# -------------------------------------------------------------
async def mjpeg_frame_generator(drone_id: str):
    """Asynchronous generator that streams JPEG frames at ~15-20 FPS."""
    while True:
        frame_bytes = camera_service.render_tactical_frame(drone_id)
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )
        await asyncio.sleep(0.065) # ~15 FPS smooth video

@router.get("/{drone_id}/stream")
async def get_drone_camera_stream(drone_id: str):
    """
    Live Onboard FPV Camera Stream (MJPEG).
    Compatible natively with any standard <img> HTML tag without external players.
    Renders D-FINE detection boxes, OSD artificial horizon, and RGB / Thermal FLIR view.
    """
    return StreamingResponse(
        mjpeg_frame_generator(drone_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/{drone_id}/frame")
async def get_drone_single_frame(drone_id: str):
    """Retrieves single high-res camera frame with D-FINE overlays."""
    frame_bytes = camera_service.render_tactical_frame(drone_id)
    return Response(content=frame_bytes, media_type="image/jpeg")

@router.get("/{drone_id}/status")
async def get_drone_camera_status(drone_id: str):
    """Returns camera diagnostic status, gimbal position, and AI companion feed status."""
    return camera_service.get_camera_status(drone_id)

from typing import Optional

@router.post("/{drone_id}/mode")
async def set_drone_camera_mode(
    drone_id: str,
    mode: Optional[str] = None,
    req: Optional[CameraModeRequest] = None
):
    """Switches drone camera sensor mode between RGB and THERMAL_FLIR."""
    selected_mode = mode or (req.mode if req else "RGB")
    return camera_service.set_camera_mode(drone_id, selected_mode)

@router.get("/{drone_id}/gimbal")
async def get_drone_gimbal(drone_id: str):
    """Gets current PTZ gimbal angles and zoom level."""
    return camera_service.get_gimbal(drone_id)

@router.post("/{drone_id}/gimbal")
async def set_drone_gimbal(drone_id: str, req: GimbalControlRequest):
    """Controls PTZ gimbal angles (pitch, yaw) and digital zoom."""
    return camera_service.set_gimbal(drone_id, req.pitch_deg, req.yaw_deg, req.zoom)

@router.post("/{drone_id}/preset/{preset_name}")
async def apply_drone_gimbal_preset(drone_id: str, preset_name: str):
    """Applies a tactical gimbal preset: nadir, patrol, horizon, zoom2x, zoom4x, center."""
    return camera_service.apply_preset(drone_id, preset_name)

@router.post("/{drone_id}/snapshot")
async def capture_drone_snapshot(drone_id: str):
    """Captures and stores an official evidence snapshot from the drone's FPV gimbal."""
    filepath, frame_bytes = camera_service.capture_snapshot(drone_id)
    return {
        "status": "SNAPSHOT_CAPTURED",
        "drone_id": drone_id,
        "filepath": filepath,
        "bytes_size": len(frame_bytes)
    }

@router.post("/{drone_id}/feed")
async def ingest_drone_camera_feed(drone_id: str, request: Request, source: str = "SMARTPHONE_CAM"):
    """Allows external Edge AI Jetson/RPi companion or mobile phone to push live camera frames."""
    raw_bytes = await request.body()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty frame body")
    res = camera_service.ingest_external_frame(drone_id, raw_bytes, source=source)
    return res

@router.get("/{drone_id}/analytics")
async def get_drone_camera_analytics(drone_id: str):
    """Returns real-time neural inference analytics, FPS, FDR uncertainty, and target telemetry."""
    return camera_service.get_camera_analytics(drone_id)

@router.post("/{drone_id}/connect-stream")
async def connect_external_ip_camera(drone_id: str, url: str):
    """Connects to a remote mobile phone IP Camera stream (DroidCam / IP Webcam)."""
    return camera_service.connect_ip_stream(drone_id, url)

@router.post("/{drone_id}/disconnect-stream")
async def disconnect_external_ip_camera(drone_id: str):
    """Disconnects remote IP Camera stream."""
    return camera_service.disconnect_ip_stream(drone_id)

@router.get("/{drone_id}/tracking-history")
async def get_drone_tracking_history(drone_id: str):
    """Returns persistent object tracking gallery of detected persons with photo crops."""
    import time
    cam = camera_service.get_or_create_camera(drone_id)
    now = time.time()
    return {
        "drone_id": drone_id,
        "tracked_persons": cam.tracked_gallery,
        "total_tracked": len(cam.tracked_gallery),
        "active_tracks_count": len([t for t in cam.active_tracks.values() if (now - t.last_seen < 3.0)])
    }

