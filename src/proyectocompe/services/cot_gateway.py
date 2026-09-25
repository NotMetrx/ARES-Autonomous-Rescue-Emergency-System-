"""
ARES Cursor-on-Target (CoT) & ATAK Gateway.
Translates real-time UAV swarm telemetry and detected emergency targets into
MIL-STD Cursor-on-Target (CoT) XML events and broadcasts them over UDP port 4242
for seamless ATAK (Android Tactical Assault Kit) and WinTAK integration.
"""
import socket
import datetime
from typing import List, Dict, Optional

# Standard ATAK CoT Event Types (MIL-STD 2525 / CoT Convention)
COT_TYPE_UAV = "a-f-A-M-F-Q"       # Friendly Airborne Drone / Rotary
COT_TYPE_SURVIVOR = "b-m-p-s-p-loc" # SAR / Evacuation / Survivor Person
COT_TYPE_FIRE = "b-m-o-f"          # Environmental / Fire Hazard
COT_TYPE_DEBRIS = "b-m-o-d"        # Obstacle / Debris
COT_TYPE_BASE = "a-f-G-U-C"         # Friendly Ground Base / TOC

class CoTGateway:
    def __init__(self, target_host: str = "127.0.0.1", target_port: int = 4242):
        self.target_host = target_host
        self.target_port = target_port
        self.total_packets_sent = 0
        self.last_broadcast_time: Optional[float] = None
        self.recent_events: List[str] = []
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Enable broadcast if needed
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    def _get_cot_timestamps(self, stale_duration_sec: int = 15):
        """Returns UTC ISO 8601 formatted timestamps for time, start, and stale."""
        now = datetime.datetime.now(datetime.timezone.utc)
        stale = now + datetime.timedelta(seconds=stale_duration_sec)
        time_str = now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        stale_str = stale.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        return time_str, time_str, stale_str

    def build_drone_cot_xml(
        self,
        drone_id: str,
        lat: float,
        lon: float,
        alt: float,
        speed_ms: float,
        battery: float,
        heading: float,
        fsm_state: str
    ) -> str:
        """Generates CoT XML for a friendly swarm UAV."""
        t_time, t_start, t_stale = self._get_cot_timestamps(stale_duration_sec=10)
        xml = (
            f'<?xml version="1.0" standalone="yes"?>\n'
            f'<event version="2.0" uid="{drone_id}" type="{COT_TYPE_UAV}" '
            f'time="{t_time}" start="{t_start}" stale="{t_stale}" how="m-g">\n'
            f'  <point lat="{lat:.7f}" lon="{lon:.7f}" hae="{alt:.1f}" ce="3.5" le="1.5"/>\n'
            f'  <detail>\n'
            f'    <contact callsign="{drone_id}"/>\n'
            f'    <track speed="{speed_ms:.1f}" course="{heading:.1f}"/>\n'
            f'    <status battery="{battery:.1f}"/>\n'
            f'    <remarks>ARES C2 Swarm | State: {fsm_state} | Bat: {battery:.1f}%</remarks>\n'
            f'  </detail>\n'
            f'</event>'
        )
        return xml

    def build_target_cot_xml(
        self,
        target_id: str,
        class_name: str,
        lat: float,
        lon: float,
        confidence: float,
        priority: str
    ) -> str:
        """Generates CoT XML for detected survivors or tactical hazards."""
        t_time, t_start, t_stale = self._get_cot_timestamps(stale_duration_sec=120)
        
        # Determine appropriate CoT MIL-STD symbol type
        c_upper = class_name.upper()
        if "SURVIVOR" in c_upper or "PERSON" in c_upper:
            cot_type = COT_TYPE_SURVIVOR
        elif "FIRE" in c_upper:
            cot_type = COT_TYPE_FIRE
        else:
            cot_type = COT_TYPE_DEBRIS

        xml = (
            f'<?xml version="1.0" standalone="yes"?>\n'
            f'<event version="2.0" uid="{target_id}" type="{cot_type}" '
            f'time="{t_time}" start="{t_start}" stale="{t_stale}" how="m-g">\n'
            f'  <point lat="{lat:.7f}" lon="{lon:.7f}" hae="0.0" ce="2.0" le="1.0"/>\n'
            f'  <detail>\n'
            f'    <contact callsign="{target_id} ({class_name})"/>\n'
            f'    <precisionlocation altsrc="DTED0"/>\n'
            f'    <remarks>ARES AI Detection: {class_name} | Conf: {confidence*100:.1f}% | Priority: {priority}</remarks>\n'
            f'  </detail>\n'
            f'</event>'
        )
        return xml

    def send_cot_event(self, xml_payload: str) -> bool:
        """Transmits raw CoT XML string over UDP to ATAK clients."""
        try:
            payload_bytes = xml_payload.encode("utf-8")
            self._sock.sendto(payload_bytes, (self.target_host, self.target_port))
            self.total_packets_sent += 1
            self.last_broadcast_time = datetime.datetime.now().timestamp()
            
            # Keep last 15 events in ring buffer
            self.recent_events.append(xml_payload)
            if len(self.recent_events) > 15:
                self.recent_events.pop(0)
            return True
        except Exception:
            return False

    def broadcast_swarm_and_targets(self, drones: List[Dict], targets: List[Dict]) -> int:
        """Broadcasts full fleet and active targets as individual CoT messages."""
        sent = 0
        for d in drones:
            xml = self.build_drone_cot_xml(
                drone_id=d.get("drone_id", "ARES-UAV"),
                lat=d.get("lat", 0.0),
                lon=d.get("lon", 0.0),
                alt=d.get("alt", 25.0),
                speed_ms=d.get("speed_ms", 0.0),
                battery=d.get("battery", 100.0),
                heading=d.get("orientation", {}).get("yaw", 0.0) if isinstance(d.get("orientation"), dict) else 0.0,
                fsm_state=str(d.get("fsm_state", "IN_FLIGHT"))
            )
            if self.send_cot_event(xml):
                sent += 1

        for t in targets:
            xml = self.build_target_cot_xml(
                target_id=t.get("target_id", "TGT-01"),
                class_name=t.get("class_name", "SURVIVOR"),
                lat=t.get("lat", 0.0),
                lon=t.get("lon", 0.0),
                confidence=t.get("confidence", 0.9),
                priority=t.get("priority", "HIGH")
            )
            if self.send_cot_event(xml):
                sent += 1

        return sent

    def get_status(self) -> Dict:
        """Returns ATAK CoT Gateway health and statistics."""
        return {
            "status": "ONLINE",
            "protocol": "Cursor-on-Target (CoT) XML v2.0",
            "target_host": self.target_host,
            "target_port": self.target_port,
            "total_packets_sent": self.total_packets_sent,
            "last_broadcast_time": self.last_broadcast_time,
            "recent_events_count": len(self.recent_events),
            "sample_event": self.recent_events[-1] if self.recent_events else None
        }

# Global instance
cot_gateway = CoTGateway()
