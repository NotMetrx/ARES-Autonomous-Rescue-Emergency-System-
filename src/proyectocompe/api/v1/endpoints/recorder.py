from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from proyectocompe.services.flight_recorder import flight_recorder
from proyectocompe.services.replay_engine import replay_engine

router = APIRouter()

class StartRecordingRequest(BaseModel):
    session_name: Optional[str] = "tactical_sweep"

@router.get("/status")
async def get_recorder_status():
    """Returns current status of black box recorder and replay engine."""
    return {
        "is_recording": flight_recorder.is_recording,
        "current_recording_session": flight_recorder.current_session_id,
        "frames_recorded": flight_recorder.frames_recorded,
        "is_replaying": replay_engine.is_replaying,
        "replay_session": replay_engine.current_session_id,
        "replay_speed": replay_engine.speed_multiplier,
        "replay_progress_pct": replay_engine.progress_pct
    }

@router.post("/start")
async def start_recording(
    session_name: Optional[str] = Query(default=None),
    req: Optional[StartRecordingRequest] = None
):
    """Starts recording swarm telemetry to a .jsonl flight record."""
    name = session_name or (req.session_name if req else "tactical_sweep")
    session_id = flight_recorder.start_recording(name)
    return {"status": "RECORDING_STARTED", "session_id": session_id}

@router.post("/stop")
async def stop_recording():
    """Stops the current recording session."""
    res = flight_recorder.stop_recording()
    return res

@router.get("/sessions")
async def list_recorded_sessions():
    """Lists all available flight records saved in the black box storage."""
    return flight_recorder.list_recordings()

@router.post("/replay/start")
async def start_replay(
    session_id: Optional[str] = Query(default=None),
    session_name: Optional[str] = Query(default=None),
    speed: Optional[float] = Query(default=None),
    speed_mult: Optional[float] = Query(default=None)
):
    """Starts replaying a recorded flight session through the live WebSocket stream."""
    sid = session_name or session_id
    if not sid:
        raise HTTPException(status_code=400, detail="session_id or session_name is required")
    s = speed_mult if speed_mult is not None else (speed if speed is not None else 1.0)
    success = await replay_engine.start_replay(sid, s)
    if not success:
        raise HTTPException(status_code=404, detail=f"Flight session {sid} not found")
    return {"status": "REPLAY_STARTED", "session_id": sid, "speed": s}

@router.post("/replay/speed")
async def set_replay_speed(
    speed_mult: Optional[float] = Query(default=None),
    speed: Optional[float] = Query(default=None)
):
    """Dynamically adjust playback speed during telemetry replay."""
    s = speed_mult if speed_mult is not None else (speed if speed is not None else 1.0)
    replay_engine.speed_multiplier = max(0.2, min(10.0, float(s)))
    return {"status": "SPEED_UPDATED", "speed": replay_engine.speed_multiplier}

@router.post("/replay/stop")
async def stop_replay():
    """Stops the active telemetry replay and returns to live telemetry."""
    await replay_engine.stop_replay()
    return {"status": "REPLAY_STOPPED"}
