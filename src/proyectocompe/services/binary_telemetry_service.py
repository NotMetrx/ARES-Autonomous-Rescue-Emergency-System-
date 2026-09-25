"""
ARES Ultra-Compact Binary Telemetry Serializer & RF Link Budget Simulator.
Compresses telemetry down to ~22 bytes per drone (97% bandwidth reduction)
for resilient transmission over constrained Long-Range RF (LoRa/RFD900 915MHz) links.
"""
import struct
import math
from typing import Dict, List, Tuple

MAGIC_HEADER = 0xAA55
CRC_POLYNOMIAL = 0x1021

DRONE_ID_MAP = {
    "ARES-01": 1,
    "ARES-02": 2,
    "ARES-03": 3,
    "ARES-04": 4
}
INV_DRONE_ID_MAP = {v: k for k, v in DRONE_ID_MAP.items()}

FSM_STATE_MAP = {
    "IDLE": 0,
    "TAKEOFF": 1,
    "IN_FLIGHT": 2,
    "ROUTING": 3,
    "AVOIDING": 4,
    "RTH": 5,
    "LANDED": 6,
    "GPS_DENIED": 7,
    "EMERGENCY": 8
}
INV_FSM_STATE_MAP = {v: k for k, v in FSM_STATE_MAP.items()}

def compute_crc16(data: bytes) -> int:
    """Computes standard CRC16-CCITT for binary payload integrity verification."""
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ CRC_POLYNOMIAL) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

class BinaryTelemetryService:
    def __init__(self):
        self.seq = 0

    def encode_swarm_frame(self, drones: List[Dict]) -> bytes:
        """
        Serializes swarm telemetry frame into ultra-compact binary struct.
        Layout:
          Header (5 bytes): Magic (2B), Seq (2B), DroneCount (1B)
          Per Drone (22 bytes each):
            - DroneIdIndex (1B)
            - Lat * 1e6 (4B int32)
            - Lon * 1e6 (4B int32)
            - Alt decimeters (2B int16)
            - Vx cm/s (2B int16)
            - Vy cm/s (2B int16)
            - Vz cm/s (2B int16)
            - Yaw decidegrees (2B uint16)
            - Battery % (1B uint8)
            - FSM State (1B uint8)
            - Flags (1B uint8)
          Footer (2 bytes): CRC16-CCITT
        """
        self.seq = (self.seq + 1) & 0xFFFF
        count = len(drones)
        
        # Pack header
        payload = bytearray(struct.pack("!HHB", MAGIC_HEADER, self.seq, count))

        for d in drones:
            drone_id = d.get("drone_id", "ARES-01")
            id_idx = DRONE_ID_MAP.get(drone_id, 255)
            
            lat_micro = int(round(d.get("lat", 0.0) * 1e6))
            lon_micro = int(round(d.get("lon", 0.0) * 1e6))
            alt_deci = int(round(d.get("alt", 0.0) * 10.0))

            vel = d.get("velocity", {})
            if isinstance(vel, dict):
                vx = int(round(vel.get("x", 0.0) * 100.0))
                vy = int(round(vel.get("y", 0.0) * 100.0))
                vz = int(round(vel.get("z", 0.0) * 100.0))
            else:
                vx = vy = vz = 0

            orient = d.get("orientation", {})
            yaw = orient.get("yaw", 0.0) if isinstance(orient, dict) else 0.0
            yaw_deci = int(round((yaw % 360.0) * 10.0))

            battery = int(max(0, min(100, round(d.get("battery", 100.0)))))
            state_str = str(d.get("fsm_state", "IN_FLIGHT")).replace("DroneFSMState.", "")
            state_val = FSM_STATE_MAP.get(state_str, 2)

            flags = 0
            if d.get("in_safety_breach", False):
                flags |= (1 << 0)
            if d.get("pnr_status") in ["CRITICAL", "BREACHED"]:
                flags |= (1 << 1)
            if d.get("gps_denied", False):
                flags |= (1 << 2)
            if battery < 22:
                flags |= (1 << 3)

            drone_bytes = struct.pack(
                "!BiihhhhHBBB",
                id_idx,
                lat_micro,
                lon_micro,
                alt_deci,
                vx, vy, vz,
                yaw_deci,
                battery,
                state_val,
                flags
            )
            payload.extend(drone_bytes)

        # Compute and append CRC16
        crc = compute_crc16(payload)
        payload.extend(struct.pack("!H", crc))
        return bytes(payload)

    def decode_swarm_frame(self, data: bytes) -> Dict:
        """Decodes raw binary packet back into structured python dictionary."""
        if len(data) < 7:
            raise ValueError("Payload too short to be a valid ARES binary frame")

        magic, seq, count = struct.unpack("!HHB", data[:5])
        if magic != MAGIC_HEADER:
            raise ValueError(f"Invalid magic header: 0x{magic:04X} (expected 0xAA55)")

        expected_crc = struct.unpack("!H", data[-2:])[0]
        actual_crc = compute_crc16(data[:-2])
        if expected_crc != actual_crc:
            raise ValueError(f"CRC verification failed: 0x{actual_crc:04X} != 0x{expected_crc:04X}")

        drones = []
        offset = 5
        drone_stride = 22

        for _ in range(count):
            if offset + drone_stride > len(data) - 2:
                break
            (
                id_idx,
                lat_micro,
                lon_micro,
                alt_deci,
                vx, vy, vz,
                yaw_deci,
                battery,
                state_val,
                flags
            ) = struct.unpack("!BiihhhhHBBB", data[offset:offset + drone_stride])
            offset += drone_stride

            drone_id = INV_DRONE_ID_MAP.get(id_idx, f"UAV-{id_idx}")
            fsm_state = INV_FSM_STATE_MAP.get(state_val, "IN_FLIGHT")

            drones.append({
                "drone_id": drone_id,
                "lat": round(lat_micro / 1e6, 7),
                "lon": round(lon_micro / 1e6, 7),
                "alt": round(alt_deci / 10.0, 1),
                "velocity": {"x": round(vx / 100.0, 2), "y": round(vy / 100.0, 2), "z": round(vz / 100.0, 2)},
                "orientation": {"yaw": round(yaw_deci / 10.0, 1)},
                "battery": battery,
                "fsm_state": fsm_state,
                "in_safety_breach": bool(flags & (1 << 0)),
                "pnr_critical": bool(flags & (1 << 1)),
                "gps_denied": bool(flags & (1 << 2)),
                "battery_low": bool(flags & (1 << 3))
            })

        return {
            "magic": hex(magic),
            "seq": seq,
            "drones_count": count,
            "payload_bytes": len(data),
            "drones": drones
        }

    def calculate_rf_link_budget(
        self,
        distance_m: float = 1200.0,
        frequency_mhz: float = 915.0,
        tx_power_dbm: float = 20.0,      # 100 mW
        tx_antenna_gain_dbi: float = 2.15, # Dipole
        rx_antenna_gain_dbi: float = 5.0   # Ground station antenna
    ) -> Dict:
        """
        Calculates Friis transmission radio link budget, RSSI, SNR,
        and estimated packet loss for tactical 915 MHz RF links.
        """
        dist = max(1.0, distance_m)
        freq_hz = frequency_mhz * 1e6
        c = 299792458.0  # Speed of light m/s

        # Free Space Path Loss (FSPL) in dB
        # FSPL = 20*log10(d) + 20*log10(f) - 147.55
        fspl = 20.0 * math.log10(dist) + 20.0 * math.log10(freq_hz) - 147.55

        # Received Power (RSSI) in dBm
        rssi = tx_power_dbm + tx_antenna_gain_dbi + rx_antenna_gain_dbi - fspl

        # Receiver noise floor for ~125 kHz LoRa / FSK channel is ~ -115 dBm
        noise_floor_dbm = -115.0
        snr = rssi - noise_floor_dbm

        # Empirical packet delivery ratio (PDR) model based on SNR
        if snr > 10.0:
            packet_loss_pct = 0.0
            link_quality = "EXCELENTE (SIN PÉRDIDA)"
        elif snr > 3.0:
            packet_loss_pct = round((10.0 - snr) * 1.5, 1)
            link_quality = "BUENA"
        elif snr > -5.0:
            packet_loss_pct = round(10.5 + (3.0 - snr) * 6.0, 1)
            link_quality = "DEGRADADA (MARGINAL)"
        else:
            packet_loss_pct = min(100.0, round(58.0 + (-5.0 - snr) * 10.0, 1))
            link_quality = "CRÍTICA / PÉRDIDA DE ENLACE"

        # Theoretical JSON transmission time at 19,200 baud vs Binary
        json_bytes = 2400
        binary_bytes = 73
        baud_rate = 19200 # bits per sec (~2400 bytes/sec)
        time_json_ms = (json_bytes / (baud_rate / 8)) * 1000.0
        time_binary_ms = (binary_bytes / (baud_rate / 8)) * 1000.0
        bandwidth_savings_pct = round((1.0 - (binary_bytes / json_bytes)) * 100.0, 1)

        return {
            "frequency_mhz": frequency_mhz,
            "distance_m": round(dist, 1),
            "tx_power_dbm": tx_power_dbm,
            "fspl_db": round(fspl, 1),
            "rssi_dbm": round(rssi, 1),
            "snr_db": round(snr, 1),
            "link_quality": link_quality,
            "packet_loss_pct": packet_loss_pct,
            "telemetry_binary_bytes": binary_bytes,
            "telemetry_json_bytes": json_bytes,
            "bandwidth_savings_pct": bandwidth_savings_pct,
            "latency_over_radio_json_ms": round(time_json_ms, 1),
            "latency_over_radio_binary_ms": round(time_binary_ms, 1)
        }

# Global instance
binary_telemetry_service = BinaryTelemetryService()
