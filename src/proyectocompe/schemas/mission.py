from typing import List, Dict, Optional
from pydantic import BaseModel, Field

class Waypoint(BaseModel):
    index: int
    lat: float
    lon: float
    alt: float = Field(default=30.0, description="Target altitude in meters")
    speed_ms: float = Field(default=8.0, description="Target transit speed")
    action: Optional[str] = "PASS"  # PASS, HOVER, SCAN, DROP

class MissionCreate(BaseModel):
    mission_name: str
    target_drone_ids: List[str]
    waypoints: List[Waypoint]
    geofence_radius_m: float = 500.0

class SearchGridRequest(BaseModel):
    """Request to generate a multi-UAV boustrophedon (lawnmower) search sweep."""
    mission_name: str = "Search & Rescue Area Sweep"
    assigned_drone_ids: List[str] = ["ARES-01", "ARES-02", "ARES-03"]
    center_lat: Optional[float] = None
    center_lon: Optional[float] = None
    width_meters: float = Field(default=150.0, ge=30.0, le=2000.0, description="East-West width in meters")
    height_meters: float = Field(default=150.0, ge=30.0, le=2000.0, description="North-South height in meters")
    swath_spacing_m: float = Field(default=25.0, ge=10.0, le=100.0, description="Parallel sweep line spacing")
    altitude_m: float = Field(default=30.0, ge=10.0, le=120.0)
    speed_ms: float = Field(default=7.0, ge=1.0, le=20.0)
    polygon_vertices: Optional[List[Dict[str, float]]] = Field(default=None, description="Optional custom clicked polygon vertices for interactive sweep generation")

class MissionStatus(BaseModel):
    mission_id: str
    mission_name: str
    status: str  # PENDING, ACTIVE, PAUSED, COMPLETED, ABORTED
    assigned_drones: List[str]
    current_waypoint_index: int = 0
    total_waypoints: int = 0
    created_at: float = 0.0
    drone_waypoints: Dict[str, List[Waypoint]] = {}
