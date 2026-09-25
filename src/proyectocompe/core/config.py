import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "ARES Tactical C2 - Swarm Core"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Telemetry streaming frequency (10 to 30 Hz as specified in ARES requirements)
    TELEMETRY_HZ: int = 20  # 20 Hz = 50ms interval (<50ms reactive evasion requirement)
    
    # Tactical Safety Bubble (15 meters minimum distance between drones)
    SAFETY_BUBBLE_METERS: float = 15.0
    
    # Offline tiles configuration
    MBTILES_PATH: str = os.getenv("MBTILES_PATH", "data/offline_map.mbtiles")
    
    # Frontend build location (Vite dist)
    FRONTEND_DIST_DIR: str = os.getenv("FRONTEND_DIST_DIR", "dist")

settings = Settings()
