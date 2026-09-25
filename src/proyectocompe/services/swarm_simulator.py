import asyncio
import logging
import math
import time
from typing import Dict, List
from proyectocompe.core.config import settings
from proyectocompe.schemas.drone import DroneFSMState
from proyectocompe.schemas.telemetry import (
    DroneTelemetry,
    Orientation3D,
    SwarmTelemetryFrame,
    Vector3D,
)
from proyectocompe.services.collision_service import (
    collision_service,
    METERS_PER_LAT_DEG,
)
from proyectocompe.services.fsm_service import fsm_service
from proyectocompe.services.geofence_service import geofence_service
from proyectocompe.services.flight_recorder import flight_recorder
from proyectocompe.services.replay_engine import replay_engine
from proyectocompe.services.coverage_service import coverage_service
from proyectocompe.services.aerodynamics_service import aerodynamics_service
from proyectocompe.services.gps_anti_jamming_service import anti_jamming_service
from proyectocompe.services.cot_gateway import cot_gateway
from proyectocompe.services.binary_telemetry_service import binary_telemetry_service
from proyectocompe.websockets.connection_mgr import ws_manager

logger = logging.getLogger("ares.simulator")

class SwarmSimulator:
    """
    Real-time Swarm Physics, Kinematics & External Telemetry Ingestion Engine.
    Runs at 10-30 Hz to feed the WebSocket stream.
    Features:
    - 3D waypoint navigation
    - 15m reactive collision avoidance
    - Real-time No-Fly Zone / Geofence breach detection
    - Black box flight recording
    - External UAV MAVLink / SITL telemetry ingestion with heartbeat watchdog
    """
    def __init__(self, base_lat: float = -12.046374, base_lon: float = -77.042793):
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.is_running = False
        self.frame_seq = 0
        self.dt = 1.0 / settings.TELEMETRY_HZ
        
        # Internal state for each drone
        self.agents: Dict[str, dict] = {
            "ARES-01": {
                "name": "ARES Alpha",
                "lat": base_lat + 0.00010,
                "lon": base_lon - 0.00015,
                "alt": 25.0,
                "speed": 6.5,
                "heading": 45.0,
                "battery": 98.5,
                "fsm": DroneFSMState.IN_FLIGHT,
                "orbit_radius_m": 45.0,
                "orbit_phase": 0.0,
                "orbit_speed": 0.3,
                "is_external": False,
                "last_heartbeat": time.time(),
            },
            "ARES-02": {
                "name": "ARES Bravo",
                "lat": base_lat - 0.00012,
                "lon": base_lon + 0.00010,
                "alt": 28.0,
                "speed": 5.8,
                "heading": 210.0,
                "battery": 94.0,
                "fsm": DroneFSMState.IN_FLIGHT,
                "orbit_radius_m": 50.0,
                "orbit_phase": math.pi * 0.8,
                "orbit_speed": -0.28,
                "is_external": False,
                "last_heartbeat": time.time(),
            },
            "ARES-03": {
                "name": "ARES Charlie",
                "lat": base_lat + 0.00025,
                "lon": base_lon + 0.00018,
                "alt": 35.0,
                "speed": 7.0,
                "heading": 130.0,
                "battery": 89.2,
                "fsm": DroneFSMState.ROUTING,
                "orbit_radius_m": 70.0,
                "orbit_phase": math.pi * 1.5,
                "orbit_speed": 0.22,
                "is_external": False,
                "last_heartbeat": time.time(),
            },
        }

        # Register in FSM service
        for drone_id, data in self.agents.items():
            fsm_service.register_drone(drone_id, data["name"])
            fsm_service.transition_state(drone_id, data["fsm"])

    def ingest_external_telemetry(self, telemetry_in) -> dict:
        """Ingests live telemetry from real UAVs, companion computers or MAVLink gateways."""
        d_id = telemetry_in.drone_id
        now = time.time()

        if d_id not in self.agents:
            fsm_service.register_drone(d_id, f"External UAV {d_id}")
            self.agents[d_id] = {
                "name": f"External UAV {d_id}",
                "orbit_radius_m": 0.0,
                "orbit_phase": 0.0,
                "orbit_speed": 0.0,
            }

        agent = self.agents[d_id]
        agent["lat"] = telemetry_in.lat
        agent["lon"] = telemetry_in.lon
        agent["alt"] = telemetry_in.alt
        agent["speed"] = telemetry_in.speed_ms
        agent["heading"] = telemetry_in.yaw
        agent["battery"] = telemetry_in.battery
        agent["is_external"] = True
        agent["last_heartbeat"] = now
        agent["vx"] = telemetry_in.vx
        agent["vy"] = telemetry_in.vy
        agent["vz"] = telemetry_in.vz

        if telemetry_in.fsm_state:
            agent["fsm"] = telemetry_in.fsm_state
            fsm_service.transition_state(d_id, telemetry_in.fsm_state)

        return {"status": "INGESTED", "drone_id": d_id, "timestamp": now}

    def set_drone_command(self, drone_id: str, fsm_state: DroneFSMState):
        if drone_id in self.agents:
            self.agents[drone_id]["fsm"] = fsm_state

    def update_physics(self):
        """Updates kinematics, checks 15m safety bubble, checks geofences, and logs flight data."""
        now = time.time()
        
        # 1. Update orbital/waypoint positions (only for internal synthetic agents)
        for drone_id, agent in self.agents.items():
            if agent.get("is_external", False):
                # Heartbeat watchdog for live external drones
                if now - agent.get("last_heartbeat", now) > 3.5:
                    if agent["fsm"] != DroneFSMState.EMERGENCY:
                        logger.warning(f"Link lost for external drone {drone_id} (>3.5s). Triggering EMERGENCY.")
                        agent["fsm"] = DroneFSMState.EMERGENCY
                        fsm_service.transition_state(drone_id, DroneFSMState.EMERGENCY)
                continue

            if agent["fsm"] in (DroneFSMState.IN_FLIGHT, DroneFSMState.ROUTING, DroneFSMState.AVOIDING):
                agent["orbit_phase"] += agent["orbit_speed"] * self.dt
                
                # Metric offset from base
                x_m = agent["orbit_radius_m"] * math.cos(agent["orbit_phase"])
                y_m = agent["orbit_radius_m"] * math.sin(agent["orbit_phase"])
                
                # Add mild sinusoidal altitude variance
                agent["alt"] = 25.0 + 8.0 * math.sin(agent["orbit_phase"] * 1.2)

                # Convert local metric to WGS84
                agent["lat"] = self.base_lat + (y_m / METERS_PER_LAT_DEG)
                agent["lon"] = self.base_lon + (x_m / (METERS_PER_LAT_DEG * math.cos(math.radians(self.base_lat))))

                # Calculate heading and orientation
                agent["heading"] = (math.degrees(agent["orbit_phase"] + math.pi / 2.0)) % 360.0
                agent["battery"] = max(0.0, agent["battery"] - (0.01 * self.dt))

                # Update ground camera coverage footprint
                coverage_service.update_drone_coverage(agent["lat"], agent["lon"], agent["alt"])

        # 2. Evaluate 15m safety bubble using Collision Avoidance Service
        telemetry_raw = [
            {"drone_id": k, "lat": v["lat"], "lon": v["lon"], "alt": v["alt"]}
            for k, v in self.agents.items()
        ]
        breach_map, evasion_alerts = collision_service.evaluate_swarm_safety(telemetry_raw)

        # 3. Evaluate No-Fly Zones and Geofence boundaries
        geofence_alerts = geofence_service.evaluate_swarm_geofences(telemetry_raw)

        # 4. Global Aerodynamics & EW Environment
        wind = aerodynamics_service.get_current_wind()
        ew_status = anti_jamming_service.get_fleet_ew_status()

        # 5. Apply reactive evasion vectors & evaluate sensor integrity
        drone_telemetries: List[DroneTelemetry] = []
        for drone_id, agent in self.agents.items():
            in_breach, peer_id, nearest_dist, evasion_vec = breach_map.get(
                drone_id, (False, "", 999.0, None)
            )

            # Evaluate Electronic Warfare & GPS Anti-Jamming
            gps_rep = anti_jamming_service.evaluate_telemetry(
                drone_id=drone_id,
                lat=agent["lat"],
                lon=agent["lon"],
                alt=agent["alt"],
                speed_ms=agent["speed"],
                timestamp=now
            )
            if gps_rep.is_compromised:
                agent["fsm"] = DroneFSMState.GPS_DENIED

            # Evaluate dynamic Point of No Return (PNR)
            pnr = aerodynamics_service.evaluate_pnr(
                drone_id=drone_id,
                lat=agent["lat"],
                lon=agent["lon"],
                battery_pct=agent["battery"]
            )

            if in_breach:
                agent["fsm"] = DroneFSMState.AVOIDING
                # Apply vector nudge
                if evasion_vec:
                    agent["lat"] += (evasion_vec.y * 0.05) / METERS_PER_LAT_DEG
                    agent["lon"] += (evasion_vec.x * 0.05) / (METERS_PER_LAT_DEG * math.cos(math.radians(self.base_lat)))
                    agent["alt"] += evasion_vec.z * 0.05
            elif agent["fsm"] == DroneFSMState.AVOIDING:
                # Return to normal mission routing after evasion clear
                agent["fsm"] = DroneFSMState.IN_FLIGHT

            # Compute velocities
            vx = agent.get("vx", agent["speed"] * math.cos(math.radians(agent["heading"])))
            vy = agent.get("vy", agent["speed"] * math.sin(math.radians(agent["heading"])))
            vz = agent.get("vz", 0.5 * math.cos(agent.get("orbit_phase", 0.0) * 1.2))

            telemetry = DroneTelemetry(
                drone_id=drone_id,
                timestamp=now,
                lat=round(agent["lat"], 7),
                lon=round(agent["lon"], 7),
                alt=round(agent["alt"], 2),
                velocity=Vector3D(x=round(vx, 2), y=round(vy, 2), z=round(vz, 2)),
                orientation=Orientation3D(
                    roll=round(math.sin(agent.get("orbit_phase", 0.0)) * 12.0, 1),
                    pitch=round(math.cos(agent.get("orbit_phase", 0.0)) * 8.0, 1),
                    yaw=round(agent["heading"], 1),
                ),
                speed_ms=round(agent["speed"], 1),
                battery=round(agent["battery"], 1),
                fsm_state=agent["fsm"],
                in_safety_breach=in_breach,
                nearest_peer_id=peer_id if in_breach else None,
                nearest_distance_m=round(nearest_dist, 2) if nearest_dist < 900.0 else None,
                evasion_vector=evasion_vec,
                is_external=agent.get("is_external", False),
                pnr_margin_pct=pnr.battery_margin_pct,
                pnr_status=pnr.pnr_status,
                gps_denied=gps_rep.is_compromised,
                jamming_risk_pct=gps_rep.jamming_risk_pct,
                sat_count=gps_rep.sat_count
            )
            drone_telemetries.append(telemetry)

        self.frame_seq += 1
        cov_stats = coverage_service.get_stats()
        frame = SwarmTelemetryFrame(
            frame_sequence=self.frame_seq,
            timestamp=now,
            frequency_hz=settings.TELEMETRY_HZ,
            active_drones_count=len(drone_telemetries),
            drones=drone_telemetries,
            active_alerts=evasion_alerts,
            geofence_alerts=geofence_alerts,
            is_replay=False,
            coverage_pct=cov_stats["coverage_pct"],
            covered_area_m2=cov_stats["covered_area_m2"],
            wind_speed_ms=wind.speed_ms,
            wind_dir_deg=wind.direction_deg,
            ew_threat_level=ew_status["ew_environment"]
        )

        # Black Box Recording
        if flight_recorder.is_recording:
            flight_recorder.record_frame(frame.model_dump())

        return frame

    async def run_loop(self):
        """Asynchronous simulator loop running at the target frequency (e.g. 20 Hz)."""
        self.is_running = True
        logger.info(f"Swarm Simulator initialized at {settings.TELEMETRY_HZ} Hz.")
        while self.is_running:
            start_t = time.perf_counter()
            
            # If Replay Engine is active, do not broadcast simulation frame
            if not replay_engine.is_replaying:
                frame = self.update_physics()
                await ws_manager.broadcast_frame(frame.model_dump())

                # Broadcast ultra-compact binary packet to RF/LoRa radio gateways
                try:
                    binary_bytes = binary_telemetry_service.encode_swarm_frame([d.model_dump() for d in frame.drones])
                    await ws_manager.broadcast_binary_frame(binary_bytes)
                except Exception as e:
                    logger.debug(f"Binary broadcast error: {e}")

                # Check autonomous battery handover and broadcast ATAK CoT every ~1 sec (20 frames)
                if self.frame_seq % 20 == 0:
                    from proyectocompe.services.swarm_resilience_service import swarm_resilience
                    await swarm_resilience.evaluate_battery_handovers()
                    try:
                        cot_gateway.broadcast_swarm_and_targets([d.model_dump() for d in frame.drones], [])
                    except Exception as e:
                        logger.debug(f"CoT broadcast error: {e}")

            elapsed = time.perf_counter() - start_t
            sleep_time = max(0.001, self.dt - elapsed)
            await asyncio.sleep(sleep_time)

    def stop(self):
        self.is_running = False

swarm_simulator = SwarmSimulator()
