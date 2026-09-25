import random
import time
from fastapi import APIRouter
from proyectocompe.schemas.ai_engine import AIHeartbeatPayload, AIStatusResponse
from proyectocompe.services.ai_monitor_service import ai_monitor
from proyectocompe.websockets.connection_mgr import ws_manager

router = APIRouter()

@router.post("/heartbeat", response_model=AIStatusResponse)
async def receive_heartbeat(payload: AIHeartbeatPayload):
    """
    Heartbeat endpoint called by the Edge AI Companion Computer (Jetson / RPi)
    every 1-3 seconds with GPU temperature, VRAM usage, and inference FPS.
    """
    status = ai_monitor.record_heartbeat(payload)
    # Broadcast to C2 UI
    await ws_manager.broadcast_frame({
        "event_type": "AI_HEARTBEAT",
        "status": status.model_dump()
    })
    return status

@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status():
    """Returns current health status and performance metrics of the AI vision node."""
    return ai_monitor.get_status()

@router.post("/simulate-heartbeat", response_model=AIStatusResponse)
async def simulate_heartbeat():
    """Helper to simulate an active Edge AI heartbeat for demos/competitions."""
    fps = round(random.uniform(26.0, 31.0), 1)
    temp = round(random.uniform(45.0, 52.0), 1)
    vram = round(random.uniform(2100.0, 2350.0), 1)
    payload = AIHeartbeatPayload(
        node_id="JETSON-ORIN-01",
        model_name="D-FINE-L (RT-DETR)",
        status="ONLINE",
        fps=fps,
        gpu_temp_c=temp,
        vram_usage_mb=vram,
        last_inference_latency_ms=round(1000.0 / fps, 1)
    )
    return await receive_heartbeat(payload)
