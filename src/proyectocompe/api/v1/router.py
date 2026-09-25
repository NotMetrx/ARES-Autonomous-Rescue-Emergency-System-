from fastapi import APIRouter
from proyectocompe.api.v1.endpoints.drones import router as drones_router
from proyectocompe.api.v1.endpoints.missions import router as missions_router
from proyectocompe.api.v1.endpoints.tiles import router as tiles_router
from proyectocompe.api.v1.endpoints.detections import router as detections_router
from proyectocompe.api.v1.endpoints.geofences import router as geofences_router
from proyectocompe.api.v1.endpoints.recorder import router as recorder_router
from proyectocompe.api.v1.endpoints.telemetry import router as telemetry_router
from proyectocompe.api.v1.endpoints.ai_engine import router as ai_engine_router
from proyectocompe.api.v1.endpoints.chaos import router as chaos_router
from proyectocompe.api.v1.endpoints.defense import router as defense_router
from proyectocompe.api.v1.endpoints.camera import router as camera_router

api_v1_router = APIRouter()

api_v1_router.include_router(drones_router, prefix="/drones", tags=["Tactical Fleet & Drones"])
api_v1_router.include_router(missions_router, prefix="/missions", tags=["Missions & Waypoints"])
api_v1_router.include_router(tiles_router, prefix="/tiles", tags=["Offline Geo MBTiles"])
api_v1_router.include_router(detections_router, prefix="/detections", tags=["AI Target Ingestion & Dispatch"])
api_v1_router.include_router(geofences_router, prefix="/geofences", tags=["Tactical Geofencing & NFZ"])
api_v1_router.include_router(recorder_router, prefix="/recorder", tags=["Black Box & Telemetry Replay"])
api_v1_router.include_router(telemetry_router, prefix="/telemetry", tags=["External Drone Ingestion"])
api_v1_router.include_router(ai_engine_router, prefix="/ai-engine", tags=["AI Engine Diagnostics & Watchdog"])
api_v1_router.include_router(chaos_router, prefix="/chaos", tags=["Chaos Engineering & Self-Healing"])
api_v1_router.include_router(defense_router, prefix="/defense", tags=["Electronic Warfare, PNR, ATAK CoT & RF Link"])
api_v1_router.include_router(camera_router, prefix="/camera", tags=["Onboard FPV Camera & Gimbal Stream"])
