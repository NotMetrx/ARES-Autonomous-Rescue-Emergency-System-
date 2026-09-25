import time
from typing import Dict, List, Optional, Tuple
from proyectocompe.schemas.drone import DroneFSMState, DroneStatus, DroneCommandType

VALID_TRANSITIONS = {
    DroneFSMState.IDLE: [DroneFSMState.TAKEOFF, DroneFSMState.EMERGENCY],
    DroneFSMState.TAKEOFF: [DroneFSMState.IN_FLIGHT, DroneFSMState.EMERGENCY, DroneFSMState.LANDED],
    DroneFSMState.IN_FLIGHT: [DroneFSMState.ROUTING, DroneFSMState.AVOIDING, DroneFSMState.RTH, DroneFSMState.EMERGENCY],
    DroneFSMState.ROUTING: [DroneFSMState.IN_FLIGHT, DroneFSMState.AVOIDING, DroneFSMState.RTH, DroneFSMState.EMERGENCY],
    DroneFSMState.AVOIDING: [DroneFSMState.ROUTING, DroneFSMState.IN_FLIGHT, DroneFSMState.RTH, DroneFSMState.EMERGENCY],
    DroneFSMState.RTH: [DroneFSMState.LANDED, DroneFSMState.AVOIDING, DroneFSMState.EMERGENCY],
    DroneFSMState.LANDED: [DroneFSMState.IDLE],
    DroneFSMState.EMERGENCY: [DroneFSMState.IDLE, DroneFSMState.LANDED],
}

class FleetFSMService:
    """Manages tactical state machines (FSM) for all active drones in the ARES swarm."""
    
    def __init__(self):
        self._drones: Dict[str, DroneStatus] = {}

    def register_drone(self, drone_id: str, name: str) -> DroneStatus:
        status = DroneStatus(
            drone_id=drone_id,
            name=name,
            fsm_state=DroneFSMState.IDLE,
            battery_percentage=100.0,
            is_armed=False,
            last_update_ts=time.time()
        )
        self._drones[drone_id] = status
        return status

    def get_all_drones(self) -> List[DroneStatus]:
        return list(self._drones.values())

    def get_drone(self, drone_id: str) -> Optional[DroneStatus]:
        return self._drones.get(drone_id)

    def transition_state(self, drone_id: str, new_state: DroneFSMState) -> bool:
        drone = self._drones.get(drone_id)
        if not drone:
            return False
        
        current_state = drone.fsm_state
        if new_state in VALID_TRANSITIONS.get(current_state, []):
            drone.fsm_state = new_state
            drone.last_update_ts = time.time()
            if new_state == DroneFSMState.TAKEOFF:
                drone.is_armed = True
            elif new_state == DroneFSMState.LANDED or new_state == DroneFSMState.IDLE:
                drone.is_armed = False
            return True
        return False

    def handle_command(self, drone_id: str, command: DroneCommandType) -> Tuple[bool, str]:
        drone = self._drones.get(drone_id)
        if not drone:
            return False, f"Drone {drone_id} not found"

        if command == DroneCommandType.TAKEOFF:
            success = self.transition_state(drone_id, DroneFSMState.TAKEOFF)
            return success, f"Takeoff {'initiated' if success else 'invalid state transition'}"

        elif command == DroneCommandType.LAND:
            success = self.transition_state(drone_id, DroneFSMState.LANDED)
            return success, f"Landing {'initiated' if success else 'invalid state transition'}"

        elif command == DroneCommandType.RTH:
            success = self.transition_state(drone_id, DroneFSMState.RTH)
            return success, f"Return to Home {'initiated' if success else 'invalid state transition'}"

        elif command == DroneCommandType.EMERGENCY_STOP:
            self._drones[drone_id].fsm_state = DroneFSMState.EMERGENCY
            self._drones[drone_id].is_armed = False
            return True, "Emergency stop triggered"

        return True, f"Command {command.value} queued"

Tuple_result = tuple[bool, str]
fsm_service = FleetFSMService()
