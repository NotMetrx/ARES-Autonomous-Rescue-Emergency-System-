import math
import logging
from typing import Optional, Tuple
from proyectocompe.schemas.detection import TargetDetection, TargetPriority
from proyectocompe.schemas.drone import DroneFSMState
from proyectocompe.services.fsm_service import fsm_service
from proyectocompe.services.collision_service import METERS_PER_LAT_DEG
from proyectocompe.services.detection_db import detection_db
from proyectocompe.websockets.connection_mgr import ws_manager

logger = logging.getLogger("ares.dispatcher")

class SwarmTaskDispatcher:
    """
    Autonomous Task Allocation Engine.
    Dispatches the optimal drone in the swarm to investigate high-priority AI detections.
    """
    @staticmethod
    def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        d_lat = (lat1 - lat2) * METERS_PER_LAT_DEG
        d_lon = (lon1 - lon2) * (METERS_PER_LAT_DEG * math.cos(math.radians(lat1)))
        return math.sqrt(d_lat * d_lat + d_lon * d_lon)

    async def auto_dispatch_target(
        self,
        target: TargetDetection,
        swarm_agents: dict
    ) -> Tuple[bool, Optional[str], str]:
        """
        Evaluates fleet readiness and automatically dispatches nearest drone.
        """
        # Only auto-dispatch for CRITICAL or HIGH priority targets (e.g. SURVIVOR, HAZARD)
        if target.priority not in (TargetPriority.CRITICAL, TargetPriority.HIGH):
            return False, None, "Priority does not mandate auto-dispatch"

        best_drone_id = None
        min_distance = float("inf")

        for drone_id, agent in swarm_agents.items():
            fsm = agent.get("fsm", DroneFSMState.IDLE)
            battery = agent.get("battery", 0.0)

            # Candidacy filters: sufficient battery, operational flight state
            if battery < 20.0:
                continue
            if fsm in (DroneFSMState.EMERGENCY, DroneFSMState.LANDED, DroneFSMState.AVOIDING):
                continue

            dist = self.calculate_distance_meters(
                agent["lat"], agent["lon"],
                target.estimated_lat, target.estimated_lon
            )

            if dist < min_distance:
                min_distance = dist
                best_drone_id = drone_id

        if not best_drone_id:
            return False, None, "No available candidate drone in fleet"

        # Assign task
        target.assigned_drone_id = best_drone_id
        target.status = "INVESTIGATING"

        # Update database
        await detection_db.update_status(target.detection_id, "INVESTIGATING", best_drone_id)

        # Transition drone state and vector in simulator
        fsm_service.transition_state(best_drone_id, DroneFSMState.ROUTING)
        if best_drone_id in swarm_agents:
            agent = swarm_agents[best_drone_id]
            agent["fsm"] = DroneFSMState.ROUTING
            # Nudge trajectory towards target
            logger.info(f"Target {target.detection_id} assigned to {best_drone_id} at distance {min_distance:.1f}m")

        # Broadcast tactical assignment notification via WebSocket
        event_payload = {
            "event_type": "TASK_ASSIGNED",
            "target_id": target.detection_id,
            "target_class": target.target_class.value,
            "priority": target.priority.value,
            "assigned_drone": best_drone_id,
            "distance_m": round(min_distance, 1),
            "target_coordinates": {
                "lat": target.estimated_lat,
                "lon": target.estimated_lon
            }
        }
        await ws_manager.broadcast_frame(event_payload)

        return True, best_drone_id, f"{best_drone_id} dispatched to target ({round(min_distance, 1)}m away)"

task_dispatcher = SwarmTaskDispatcher()
