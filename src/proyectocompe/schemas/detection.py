from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field

class TargetClass(str, Enum):
    SURVIVOR = "SURVIVOR"
    VEHICLE = "VEHICLE"
    FIRE_HAZARD = "FIRE_HAZARD"
    INTRUDER = "INTRUDER"
    INFRASTRUCTURE_DAMAGE = "INFRASTRUCTURE_DAMAGE"
    UNKNOWN = "UNKNOWN"

class TargetPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class BoundingBox(BaseModel):
    x_min: float = Field(..., ge=0.0, le=1.0)
    y_min: float = Field(..., ge=0.0, le=1.0)
    x_max: float = Field(..., ge=0.0, le=1.0)
    y_max: float = Field(..., ge=0.0, le=1.0)

class TargetDetectionCreate(BaseModel):
    drone_id: str
    target_class: TargetClass
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence score (e.g. 0.94)")
    bounding_box: Optional[BoundingBox] = None
    camera_pitch_deg: float = Field(default=-45.0, description="Gimbal pitch angle in degrees (-90 nadir, 0 horizontal)")
    camera_yaw_deg: float = Field(default=0.0, description="Gimbal yaw relative to drone heading")
    custom_lat: Optional[float] = Field(default=None, description="Optional override if already geo-calculated by edge device")
    custom_lon: Optional[float] = Field(default=None, description="Optional override if already geo-calculated by edge device")
    snapshot_base64: Optional[str] = Field(default=None, description="Base64 encoded JPEG thumbnail of target")

class TargetDetection(BaseModel):
    detection_id: str
    reported_at: float
    first_seen_at: float = 0.0
    last_seen_at: float = 0.0
    observation_count: int = 1
    drone_id: str
    target_class: TargetClass
    priority: TargetPriority
    confidence: float
    estimated_lat: float
    estimated_lon: float
    estimated_alt: float = 0.0
    status: str = "CONFIRMED"  # CONFIRMED, INVESTIGATING, RESOLVED, FALSE_POSITIVE
    assigned_drone_id: Optional[str] = None
    bounding_box: Optional[BoundingBox] = None
    snapshot_base64: Optional[str] = None
    snapshot_path: Optional[str] = None
    snapshot_url: Optional[str] = None
    
    # Motion & Kinematics Tracking for Moving Targets (Vehicles, Intruders)
    is_moving: bool = False
    velocity_x: float = 0.0
    velocity_y: float = 0.0
    estimated_speed_kmh: float = 0.0

class DetectionAlertPayload(BaseModel):
    event: str = "TARGET_ACQUIRED"
    detection: TargetDetection
    action_taken: str
