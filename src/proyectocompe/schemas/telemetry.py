from typing import List, Optional
from pydantic import BaseModel, Field
from .drone import DroneFSMState
from .geofence import GeofenceBreachAlert

class Vector3D(BaseModel):
    x: float = Field(..., description="X component (East or local coordinate) in m/s or m")
    y: float = Field(..., description="Y component (North or local coordinate) in m/s or m")
    z: float = Field(..., description="Z component (Up) in m/s or m")

class Orientation3D(BaseModel):
    roll: float = Field(..., description="Roll angle in degrees [-180, 180]")
    pitch: float = Field(..., description="Pitch angle in degrees [-90, 90]")
    yaw: float = Field(..., description="Heading / Yaw angle in degrees [0, 360]")

class DroneTelemetry(BaseModel):
    drone_id: str
    timestamp: float
    lat: float = Field(..., description="Latitude WGS84")
    lon: float = Field(..., description="Longitude WGS84")
    alt: float = Field(..., description="Altitude AGL in meters")
    velocity: Vector3D
    orientation: Orientation3D
    speed_ms: float
    battery: float = Field(ge=0.0, le=100.0, description="Battery percentage")
    fsm_state: DroneFSMState
    
    # 15m Safety Bubble & Collision Indicators
    in_safety_breach: bool = Field(default=False, description="True if distance < 15m to any other drone")
    nearest_peer_id: Optional[str] = None
    nearest_distance_m: Optional[float] = None
    evasion_vector: Optional[Vector3D] = None
    is_external: bool = False
    
    # Aerodynamics, PNR & Electronic Warfare
    pnr_margin_pct: Optional[float] = None
    pnr_status: Optional[str] = "NOMINAL"
    gps_denied: bool = False
    jamming_risk_pct: float = 0.0
    sat_count: int = 16

class EvasionAlert(BaseModel):
    alert_id: str
    timestamp: float
    drone_a_id: str
    drone_b_id: str
    distance_m: float
    response_latency_ms: float
    action_taken: str = "REACTIVE_DIVERGENT_VECTORS_CALCULATED"

class ExternalTelemetryIngest(BaseModel):
    drone_id: str
    lat: float
    lon: float
    alt: float
    vx: float = 0.0
    vy: float = 0.0
    vz: float = 0.0
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    speed_ms: float = 0.0
    battery: float = 100.0
    fsm_state: Optional[DroneFSMState] = DroneFSMState.IN_FLIGHT

class SwarmTelemetryFrame(BaseModel):
    frame_sequence: int
    timestamp: float
    frequency_hz: int
    active_drones_count: int
    drones: List[DroneTelemetry]
    active_alerts: List[EvasionAlert] = []
    geofence_alerts: List[GeofenceBreachAlert] = []
    is_replay: bool = False
    coverage_pct: float = 0.0
    covered_area_m2: float = 0.0
    wind_speed_ms: float = 0.0
    wind_dir_deg: float = 0.0
    ew_threat_level: str = "NOMINAL"
