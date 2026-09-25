from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

class DroneFSMState(str, Enum):
    IDLE = "IDLE"
    TAKEOFF = "TAKEOFF"
    ROUTING = "ROUTING"
    IN_FLIGHT = "IN_FLIGHT"
    AVOIDING = "AVOIDING"
    RTH = "RTH"              # Return To Home
    LANDED = "LANDED"
    GPS_DENIED = "GPS_DENIED"
    EMERGENCY = "EMERGENCY"

class DroneCommandType(str, Enum):
    TAKEOFF = "TAKEOFF"
    LAND = "LAND"
    RTH = "RTH"
    HOLD = "HOLD"
    GOTO = "GOTO"
    EMERGENCY_STOP = "EMERGENCY_STOP"

class DroneCommandRequest(BaseModel):
    command: DroneCommandType
    target_lat: Optional[float] = None
    target_lon: Optional[float] = None
    target_alt: Optional[float] = None
    speed_ms: Optional[float] = Field(default=5.0, description="Target speed in m/s")

class DroneStatus(BaseModel):
    drone_id: str
    name: str
    fsm_state: DroneFSMState
    battery_percentage: float = Field(ge=0.0, le=100.0)
    is_armed: bool
    firmware_version: str = "ARES-PX4-v1.4"
    last_update_ts: float
