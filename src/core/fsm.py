from enum import Enum
from typing import Set

class MissionStatus(str, Enum):
    DRAFT = "DRAFT"
    OPTIMIZING = "OPTIMIZING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"
    FAILED = "FAILED"

class DroneStatus(str, Enum):
    IDLE = "IDLE"
    ROUTING = "ROUTING"
    IN_FLIGHT = "IN_FLIGHT"
    RETURNING = "RETURNING"
    MAINTENANCE = "MAINTENANCE"
    EMERGENCY = "EMERGENCY"

class SwarmRole(str, Enum):
    LEADER = "LEADER"
    PAYLOAD_CARRIER = "PAYLOAD_CARRIER"
    COMM_RELAY = "COMM_RELAY"
    SCOUT = "SCOUT"

# Valid Mission State Transitions
MISSION_TRANSITIONS: dict[MissionStatus, Set[MissionStatus]] = {
    MissionStatus.DRAFT: {MissionStatus.OPTIMIZING, MissionStatus.FAILED},
    MissionStatus.OPTIMIZING: {MissionStatus.ACTIVE, MissionStatus.FAILED},
    MissionStatus.ACTIVE: {MissionStatus.COMPLETED, MissionStatus.ABORTED},
    MissionStatus.COMPLETED: set(),
    MissionStatus.ABORTED: set(),
    MissionStatus.FAILED: set(),
}

# Valid Drone State Transitions
DRONE_TRANSITIONS: dict[DroneStatus, Set[DroneStatus]] = {
    DroneStatus.IDLE: {DroneStatus.ROUTING},
    DroneStatus.ROUTING: {DroneStatus.IN_FLIGHT, DroneStatus.IDLE},
    DroneStatus.IN_FLIGHT: {DroneStatus.RETURNING, DroneStatus.EMERGENCY},
    DroneStatus.RETURNING: {DroneStatus.MAINTENANCE, DroneStatus.EMERGENCY},
    DroneStatus.MAINTENANCE: {DroneStatus.IDLE},
    DroneStatus.EMERGENCY: {DroneStatus.MAINTENANCE},
}

def validate_mission_transition(current: str, target: str) -> bool:
    try:
        cur_status = MissionStatus(current)
        tgt_status = MissionStatus(target)
        return tgt_status in MISSION_TRANSITIONS.get(cur_status, set())
    except ValueError:
        return False

def validate_drone_transition(current: str, target: str) -> bool:
    try:
        cur_status = DroneStatus(current)
        tgt_status = DroneStatus(target)
        return tgt_status in DRONE_TRANSITIONS.get(cur_status, set())
    except ValueError:
        return False
