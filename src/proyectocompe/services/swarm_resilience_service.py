import math
import time
import logging
from typing import Dict, List, Optional, Tuple
from proyectocompe.schemas.drone import DroneFSMState
from proyectocompe.schemas.mission import Waypoint, MissionStatus
from proyectocompe.services.mission_service import mission_service
from proyectocompe.services.fsm_service import fsm_service
from proyectocompe.services.swarm_simulator import swarm_simulator
from proyectocompe.websockets.connection_mgr import ws_manager

logger = logging.getLogger("ares.resilience")

class SwarmResilienceService:
    """
    Self-Healing Swarm & Autonomous Battery Handover Engine.
    Provides automated fault tolerance:
    1. Dynamic Re-partitioning: Redistributes search sectors when a drone drops offline or fails.
    2. Tactical Battery Handover: Dispatches fresh relief drones when inspecting drones hit <22% battery.
    """

    def __init__(self):
        self.last_handover_time: float = 0.0
        self.handover_cooldown_sec: float = 10.0

    async def handle_drone_failure(self, failed_drone_id: str) -> Dict[str, any]:
        """
        Triggered when a drone suffers an in-flight failure, emergency, or link loss.
        Extracts pending waypoints from the failed drone and dynamically splits them
        among surviving healthy drones in the swarm.
        """
        now = time.time()

        # 1. Update failed drone state in simulator & FSM
        if failed_drone_id in swarm_simulator.agents:
            agent = swarm_simulator.agents[failed_drone_id]
            agent["fsm"] = DroneFSMState.EMERGENCY
            fsm_service.transition_state(failed_drone_id, DroneFSMState.EMERGENCY)

        # 2. Retrieve current active mission
        missions = await mission_service.get_all_missions()
        active_mission = next((m for m in missions if m.status == "ACTIVE"), None)
        if not active_mission and missions:
            active_mission = missions[0]

        reallocated_count = 0
        surviving_drones = [
            d_id for d_id, ag in swarm_simulator.agents.items()
            if d_id != failed_drone_id and ag.get("fsm") != DroneFSMState.EMERGENCY
        ]

        reallocation_map: Dict[str, int] = {}

        if active_mission and surviving_drones and failed_drone_id in active_mission.drone_waypoints:
            failed_wps = active_mission.drone_waypoints.get(failed_drone_id, [])
            reallocated_count = len(failed_wps)

            if failed_wps:
                # Distribute waypoints evenly among surviving drones
                for idx, wp in enumerate(failed_wps):
                    target_drone = surviving_drones[idx % len(surviving_drones)]
                    if target_drone not in active_mission.drone_waypoints:
                        active_mission.drone_waypoints[target_drone] = []
                    
                    # Create copy with new index
                    new_idx = len(active_mission.drone_waypoints[target_drone]) + 1
                    reallocated_wp = Waypoint(
                        index=new_idx,
                        lat=wp.lat,
                        lon=wp.lon,
                        alt=wp.alt,
                        speed_ms=wp.speed_ms,
                        action="SCAN"
                    )
                    active_mission.drone_waypoints[target_drone].append(reallocated_wp)
                    reallocation_map[target_drone] = reallocation_map.get(target_drone, 0) + 1

                # Clear waypoints of failed drone
                active_mission.drone_waypoints[failed_drone_id] = []
                await mission_service.save_mission(active_mission)

        # 3. Broadcast real-time tactical self-healing event
        event_payload = {
            "event_type": "SWARM_SELF_HEALED",
            "failed_drone": failed_drone_id,
            "surviving_drones": surviving_drones,
            "reallocated_waypoints_count": reallocated_count,
            "reallocation_map": reallocation_map,
            "timestamp": now,
            "message": f"⚠️ FALLO EN {failed_drone_id}: Enjambre autorreparado. {reallocated_count} waypoints redistribuidos entre {surviving_drones}."
        }
        await ws_manager.broadcast_frame(event_payload)

        return {
            "status": "SELF_HEALED",
            "failed_drone": failed_drone_id,
            "surviving_drones": surviving_drones,
            "reallocated_waypoints_count": reallocated_count,
            "reallocation_map": reallocation_map,
        }

    async def evaluate_battery_handovers(self) -> Optional[Dict[str, any]]:
        """
        Autonomous battery evaluation loop.
        If an active drone drops below 22% battery, autonomously dispatches a relief drone.
        """
        now = time.time()
        if now - self.last_handover_time < self.handover_cooldown_sec:
            return None

        # Look for low-battery drone in operational flight
        low_bat_drone_id = None
        low_bat_val = 100.0
        target_lat = None
        target_lon = None

        for d_id, agent in swarm_simulator.agents.items():
            bat = agent.get("battery", 100.0)
            fsm = agent.get("fsm")
            if bat <= 22.0 and fsm in (DroneFSMState.ROUTING, DroneFSMState.IN_FLIGHT):
                low_bat_drone_id = d_id
                low_bat_val = bat
                target_lat = agent.get("lat")
                target_lon = agent.get("lon")
                break

        if not low_bat_drone_id:
            return None

        # Look for candidate relief drone with battery > 70%
        relief_drone_id = None
        highest_bat = 0.0
        for d_id, agent in swarm_simulator.agents.items():
            if d_id == low_bat_drone_id:
                continue
            bat = agent.get("battery", 0.0)
            fsm = agent.get("fsm")
            if bat > 70.0 and fsm in (DroneFSMState.IN_FLIGHT, DroneFSMState.IDLE) and bat > highest_bat:
                highest_bat = bat
                relief_drone_id = d_id

        if not relief_drone_id:
            return None

        # Execute Handover
        self.last_handover_time = now

        # Relief drone moves to target position
        relief_agent = swarm_simulator.agents[relief_drone_id]
        relief_agent["fsm"] = DroneFSMState.ROUTING
        fsm_service.transition_state(relief_drone_id, DroneFSMState.ROUTING)

        # Low battery drone initiates Return to Home (RTH)
        low_agent = swarm_simulator.agents[low_bat_drone_id]
        low_agent["fsm"] = DroneFSMState.RTH
        fsm_service.transition_state(low_bat_drone_id, DroneFSMState.RTH)

        event_payload = {
            "event_type": "BATTERY_HANDOVER",
            "low_battery_drone": low_bat_drone_id,
            "low_battery_val": round(low_bat_val, 1),
            "relief_drone": relief_drone_id,
            "relief_battery_val": round(highest_bat, 1),
            "timestamp": now,
            "message": f"🔋 RELEVO AUTÓNOMO: {relief_drone_id} ({highest_bat:.0f}%) releva a {low_bat_drone_id} ({low_bat_val:.0f}% bat). {low_bat_drone_id} retorna a base (RTH)."
        }
        await ws_manager.broadcast_frame(event_payload)

        return event_payload

    def restore_fleet(self) -> Dict[str, any]:
        """Restores all drones to 100% battery, normal state, and in-flight status."""
        for d_id, agent in swarm_simulator.agents.items():
            agent["battery"] = 98.0
            agent["fsm"] = DroneFSMState.IN_FLIGHT
            fsm_service.transition_state(d_id, DroneFSMState.IN_FLIGHT)
        return {"status": "RESTORED", "active_drones": list(swarm_simulator.agents.keys())}

swarm_resilience = SwarmResilienceService()
