from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class GeofenceType(str, Enum):
    KEEP_IN = "KEEP_IN"      # Allowed boundary; drone must stay INSIDE
    KEEP_OUT = "KEEP_OUT"    # No-Fly Zone (NFZ); drone must NEVER enter

class GeofenceCoordinate(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)

class GeofenceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    fence_type: GeofenceType = GeofenceType.KEEP_OUT
    polygon: List[GeofenceCoordinate] = Field(..., min_length=3, description="List of at least 3 vertices defining the boundary")
    min_alt_m: float = Field(default=0.0, ge=0.0)
    max_alt_m: float = Field(default=150.0, le=1000.0)

class Geofence(BaseModel):
    fence_id: str
    name: str
    fence_type: GeofenceType
    polygon: List[GeofenceCoordinate]
    min_alt_m: float = 0.0
    max_alt_m: float = 150.0
    is_active: bool = True
    created_at: float

class GeofenceBreachAlert(BaseModel):
    alert_id: str
    timestamp: float
    drone_id: str
    fence_id: str
    fence_name: str
    breach_type: str  # INTRUSION, PERIMETER_EXIT, PROXIMITY_WARNING
    distance_to_boundary_m: float
    message: str
