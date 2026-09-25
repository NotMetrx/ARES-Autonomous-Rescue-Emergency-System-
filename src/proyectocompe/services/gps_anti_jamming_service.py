"""
ARES Electronic Warfare (EW) & GPS Anti-Jamming / Anti-Spoofing Service.
Monitors multi-sensor kinematics to detect GPS spoofing, satellite jamming,
and activates Autonomous GPS-Denied Dead Reckoning navigation.
"""
import time
import math
from typing import Dict, Optional
from pydantic import BaseModel

class GPSHealthReport(BaseModel):
    drone_id: str
    is_compromised: bool
    nav_mode: str          # "GPS_FIX_3D", "GPS_DEGRADED", "GPS_DENIED_DEAD_RECKONING"
    sat_count: int
    hdop: float
    jamming_risk_pct: float
    threat_type: Optional[str] = None # None, "SPOOFING_TELEPORT", "SPOOFING_ACCEL", "RF_JAMMING"
    dead_reckoning_active: bool
    emergency_heading_deg: float
    details: str

class GPSAntiJammingService:
    def __init__(self):
        # Drone history cache: drone_id -> {lat, lon, alt, speed, timestamp, sat_count}
        self.history: Dict[str, Dict] = {}
        # Injected attacks for simulation/testing
        self.injected_attacks: Dict[str, Dict] = {}
        # Dead reckoning accumulator: drone_id -> {est_lat, est_lon, est_alt}
        self.dr_cache: Dict[str, Dict] = {}

    def reset(self, drone_id: Optional[str] = None):
        """Resets telemetry history and active attacks."""
        if drone_id:
            self.history.pop(drone_id, None)
            self.injected_attacks.pop(drone_id, None)
            self.dr_cache.pop(drone_id, None)
        else:
            self.history.clear()
            self.injected_attacks.clear()
            self.dr_cache.clear()

    def simulate_attack(self, drone_id: str, attack_type: str = "RF_JAMMING") -> Dict:
        """Simulates an electronic warfare GPS jamming or spoofing attack."""
        self.injected_attacks[drone_id] = {
            "attack_type": attack_type,
            "timestamp": time.time(),
            "active": True
        }
        return {
            "status": "ATTACK_INJECTED",
            "drone_id": drone_id,
            "attack_type": attack_type,
            "message": f"Ataque EW ({attack_type}) inyectado en {drone_id}. Modo GPS-Denied forzado."
        }

    def clear_attack(self, drone_id: str) -> Dict:
        """Clears simulated electronic warfare attack."""
        if drone_id in self.injected_attacks:
            del self.injected_attacks[drone_id]
        if drone_id in self.dr_cache:
            del self.dr_cache[drone_id]
        return {
            "status": "RESTORED",
            "drone_id": drone_id,
            "message": f"Enlace GPS normalizado para {drone_id}."
        }

    def evaluate_telemetry(
        self,
        drone_id: str,
        lat: float,
        lon: float,
        alt: float,
        speed_ms: float,
        timestamp: float,
        sat_count: int = 16,
        hdop: float = 0.8
    ) -> GPSHealthReport:
        """
        Validates telemetry physics to detect spoofing / jamming attacks.
        Returns detailed GPSHealthReport.
        """
        # 1. Check for manual/injected simulation
        if drone_id in self.injected_attacks and self.injected_attacks[drone_id]["active"]:
            atk = self.injected_attacks[drone_id]["attack_type"]
            return GPSHealthReport(
                drone_id=drone_id,
                is_compromised=True,
                nav_mode="GPS_DENIED_DEAD_RECKONING",
                sat_count=2 if "JAMMING" in atk else 14,
                hdop=8.5 if "JAMMING" in atk else 0.9,
                jamming_risk_pct=98.5,
                threat_type=atk,
                dead_reckoning_active=True,
                emergency_heading_deg=225.0,
                details=f"🚨 ATAQUE EW DETECTADO: {atk}. Bloqueo satelital activo. Conmutado a Dead Reckoning inercial."
            )

        # 2. Physics & Kinematic Continuity Check
        threat_type = None
        is_compromised = False
        jamming_risk = 2.0  # Base nominal risk

        prev = self.history.get(drone_id)
        if prev:
            dt = timestamp - prev["timestamp"]
            if 0.001 <= dt < 2.0:
                # Calculate distance jumped
                d_lat = (lat - prev["lat"]) * 111139.0
                d_lon = (lon - prev["lon"]) * (111139.0 * math.cos(math.radians(lat)))
                jump_distance = math.sqrt(d_lat**2 + d_lon**2)
                implied_speed = jump_distance / dt

                # Check teleportation (> 18m in dt)
                if jump_distance > 18.0 and implied_speed > 35.0:
                    threat_type = "SPOOFING_TELEPORT"
                    is_compromised = True
                    jamming_risk = 95.0

                # Check acceleration glitch (> 24 m/s²)
                dv = abs(speed_ms - prev["speed_ms"])
                accel = dv / dt
                if accel > 24.0:
                    threat_type = "SPOOFING_ACCEL"
                    is_compromised = True
                    jamming_risk = 88.0

        # Check sat count degradation
        if sat_count < 4 or hdop > 5.0:
            threat_type = "RF_JAMMING"
            is_compromised = True
            jamming_risk = 92.0

        # Update history
        self.history[drone_id] = {
            "lat": lat,
            "lon": lon,
            "alt": alt,
            "speed_ms": speed_ms,
            "timestamp": timestamp,
            "sat_count": sat_count
        }

        # Calculate emergency return bearing to base (-12.046374, -77.042793)
        base_lat, base_lon = -12.046374, -77.042793
        d_north = (base_lat - lat) * 111139.0
        d_east = (base_lon - lon) * (111139.0 * math.cos(math.radians(base_lat)))
        emergency_bearing = (math.degrees(math.atan2(d_east, d_north)) + 360.0) % 360.0

        if is_compromised:
            nav_mode = "GPS_DENIED_DEAD_RECKONING"
            details = f"🚨 INTERFERENCIA EW: {threat_type}. Señal GPS anómala. Navegando por Dead Reckoning a rumbo {emergency_bearing:.0f}°."
        elif sat_count < 8 or hdop > 2.0:
            nav_mode = "GPS_DEGRADED"
            details = f"Precaución: Cobertura GNSS degradada (Sats: {sat_count}, HDOP: {hdop:.1f})."
            jamming_risk = 35.0
        else:
            nav_mode = "GPS_FIX_3D"
            details = f"Señal GNSS nominal (Sats: {sat_count}, HDOP: {hdop:.1f}, Integridad 100%)."

        return GPSHealthReport(
            drone_id=drone_id,
            is_compromised=is_compromised,
            nav_mode=nav_mode,
            sat_count=sat_count,
            hdop=hdop,
            jamming_risk_pct=round(jamming_risk, 1),
            threat_type=threat_type,
            dead_reckoning_active=is_compromised,
            emergency_heading_deg=round(emergency_bearing, 1),
            details=details
        )

    def get_fleet_ew_status(self) -> Dict:
        """Returns overall electronic warfare threat overview for the swarm."""
        active_attacks = {k: v["attack_type"] for k, v in self.injected_attacks.items() if v.get("active")}
        return {
            "ew_environment": "HOSTIL (JAMMING/SPOOFING ACTIVO)" if active_attacks else "SEGURO (NOMINAL)",
            "active_threats_count": len(active_attacks),
            "compromised_drones": list(active_attacks.keys()),
            "threats_detail": active_attacks
        }

# Global singleton
anti_jamming_service = GPSAntiJammingService()
