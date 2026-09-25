import asyncio
import logging
import math
import socket
import time
from typing import Dict, List, Optional
from proyectocompe.schemas.telemetry import ExternalTelemetryIngest, DroneFSMState
from proyectocompe.services.swarm_simulator import swarm_simulator

logger = logging.getLogger("ares.mavlink")

class MAVLinkGatewayService:
    """
    Native MAVLink v1/v2 UDP Telemetry & Command Gateway.
    Allows real Pixhawk/CubeOrange flight controllers, ArduPilot, PX4,
    and Gazebo/AirSim SITL simulators to connect on UDP port 14550.
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 14550):
        self.host = host
        self.port = port
        self.is_running = False
        self.packets_received: int = 0
        self.connected_systems: Dict[int, dict] = {}
        self._task: Optional[asyncio.Task] = None
        self._connection = None

    def start(self):
        """Launches the background UDP MAVLink listener."""
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._listen_loop())
            logger.info(f"MAVLink Gateway listening on UDP {self.host}:{self.port}")

    def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()

    async def _listen_loop(self):
        try:
            from pymavlink import mavutil
            # Open UDP listen socket
            conn_str = f"udpin:{self.host}:{self.port}"
            self._connection = mavutil.mavlink_connection(conn_str)
            logger.info(f"MAVLink connection established on {conn_str}")

            while self.is_running:
                # Read message in a non-blocking way
                msg = self._connection.recv_match(blocking=False)
                if msg:
                    self._process_mavlink_msg(msg)
                    self.packets_received += 1
                else:
                    await asyncio.sleep(0.01)

        except ImportError:
            logger.warning("pymavlink not available; running MAVLink gateway in fallback simulation mode.")
        except Exception as e:
            logger.error(f"Error in MAVLink UDP loop: {e}")

    def _process_mavlink_msg(self, msg):
        msg_type = msg.get_type()
        sys_id = msg.get_srcSystem()
        drone_id = f"MAV-{sys_id:02d}"

        if sys_id not in self.connected_systems:
            self.connected_systems[sys_id] = {
                "drone_id": drone_id,
                "first_seen": time.time(),
                "last_seen": time.time(),
                "autopilot": "PX4/ArduPilot",
                "lat": 0.0,
                "lon": 0.0,
                "alt": 0.0,
                "battery": 100.0,
                "armed": False
            }

        sys_data = self.connected_systems[sys_id]
        sys_data["last_seen"] = time.time()

        if msg_type == "HEARTBEAT":
            from pymavlink import mavutil
            sys_data["armed"] = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)

        elif msg_type == "GLOBAL_POSITION_INT":
            lat = msg.lat / 1e7
            lon = msg.lon / 1e7
            alt = msg.relative_alt / 1000.0
            vx = msg.vx / 100.0
            vy = msg.vy / 100.0
            vz = msg.vz / 100.0
            yaw = (msg.hdg / 100.0) if msg.hdg != 65535 else 0.0
            speed = math.sqrt(vx * vx + vy * vy)

            sys_data["lat"] = lat
            sys_data["lon"] = lon
            sys_data["alt"] = alt

            # Ingest into simulator fleet
            telemetry_in = ExternalTelemetryIngest(
                drone_id=drone_id,
                lat=lat,
                lon=lon,
                alt=alt,
                vx=round(vx, 2),
                vy=round(vy, 2),
                vz=round(vz, 2),
                yaw=round(yaw, 1),
                speed_ms=round(speed, 1),
                battery=sys_data["battery"],
                fsm_state=DroneFSMState.IN_FLIGHT
            )
            swarm_simulator.ingest_external_telemetry(telemetry_in)

        elif msg_type == "ATTITUDE":
            sys_data["roll"] = math.degrees(msg.roll)
            sys_data["pitch"] = math.degrees(msg.pitch)
            sys_data["yaw"] = math.degrees(msg.yaw)

        elif msg_type == "SYS_STATUS":
            if msg.battery_remaining != -1:
                sys_data["battery"] = float(msg.battery_remaining)

    def simulate_telemetry_packet(self, drone_id: str = "MAV-01", lat: float = None, lon: float = None, alt: float = 32.0):
        """Simulation helper to inject a valid MAVLink drone telemetry into C2 without physical radio."""
        if lat is None:
            lat = swarm_simulator.base_lat + 0.0003
        if lon is None:
            lon = swarm_simulator.base_lon - 0.0002

        telemetry_in = ExternalTelemetryIngest(
            drone_id=drone_id,
            lat=round(lat, 7),
            lon=round(lon, 7),
            alt=alt,
            vx=4.2,
            vy=1.8,
            vz=0.1,
            yaw=75.0,
            speed_ms=5.5,
            battery=88.5,
            fsm_state=DroneFSMState.IN_FLIGHT
        )
        self.packets_received += 1
        return swarm_simulator.ingest_external_telemetry(telemetry_in)

    def get_status(self) -> dict:
        return {
            "is_running": self.is_running,
            "host": self.host,
            "port": self.port,
            "packets_received": self.packets_received,
            "connected_systems_count": len(self.connected_systems),
            "connected_systems": list(self.connected_systems.values())
        }

mavlink_gateway = MAVLinkGatewayService()
