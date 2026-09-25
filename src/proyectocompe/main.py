import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from proyectocompe.core.config import settings
from proyectocompe.api.v1.router import api_v1_router
from proyectocompe.websockets.telemetry_ws import ws_router
from proyectocompe.services.swarm_simulator import swarm_simulator

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch Swarm Kinematics loop & MAVLink UDP Gateway (port 14550)
    sim_task = asyncio.create_task(swarm_simulator.run_loop())
    from proyectocompe.services.mavlink_gateway import mavlink_gateway
    mavlink_gateway.start()

    yield

    # Shutdown: cleanly terminate simulator loop & MAVLink Gateway
    mavlink_gateway.stop()
    swarm_simulator.stop()
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="ARES Tactical Swarm Command & Control Backend. Real-time 3D Telemetry (10-30Hz), 15m Safety Bubble Evasion, and Offline MBTiles Support.",
    lifespan=lifespan
)

# CORS configuration for local development with Vite / React / Svelte
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST and WebSocket Routers
app.include_router(api_v1_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)

# Mount static test files if present
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/hud", response_class=HTMLResponse)
async def serve_hud():
    """Serves the built-in Tactical Dark HUD for real-time WebSocket swarm telemetry preview."""
    hud_file = os.path.join(STATIC_DIR, "tactical_hud.html")
    if os.path.exists(hud_file):
        return FileResponse(hud_file)
    return HTMLResponse("<h3>HUD not found</h3>", status_code=404)

@app.get("/health")
async def healthcheck():
    return {
        "status": "OPERATIONAL",
        "system": settings.PROJECT_NAME,
        "telemetry_hz": settings.TELEMETRY_HZ,
        "safety_bubble_m": settings.SAFETY_BUBBLE_METERS,
        "active_clients": len(swarm_simulator.agents),
    }

# Check if Vite production dist/ folder exists, mount it at root
FRONTEND_DIST = settings.FRONTEND_DIST_DIR
if os.path.exists(FRONTEND_DIST) and os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend_dist")
else:
    @app.get("/")
    async def root():
        return {
            "message": "ARES Tactical C2 Backend is ONLINE",
            "tactical_hud": "/hud",
            "api_documentation": "/docs",
            "websocket_stream": "/ws/telemetry",
            "tiles_style": "/api/v1/tiles/style.json"
        }

def start():
    """Entry point when run via uv run proyectocompe."""
    import uvicorn
    uvicorn.run("proyectocompe.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    start()
