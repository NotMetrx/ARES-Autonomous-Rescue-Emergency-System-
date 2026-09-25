"""
ARES Aerodynamics & Point of No Return (PNR) Calculation Engine.
Estimates real-time wind speed/direction from flight dynamics and calculates
dynamic return battery thresholds against headwinds.
"""
import math
from typing import Dict, Tuple, Optional
from pydantic import BaseModel

METERS_PER_LAT_DEG = 111139.0

class WindEstimate(BaseModel):
    speed_ms: float
    direction_deg: float  # Degrees from where the wind originates (0=North, 90=East, etc.)
    vector_x: float       # East component (m/s)
    vector_y: float       # North component (m/s)
    intensity_label: str  # "CALMA", "BRISA MODERADA", "VIENTO FUERTE", "CONDICIÓN CRÍTICA"

class PNRStatus(BaseModel):
    drone_id: str
    distance_to_base_m: float
    return_time_sec: float
    return_ground_speed_ms: float
    battery_required_pct: float
    battery_margin_pct: float
    pnr_status: str       # "NOMINAL", "ADVISORY", "CRITICAL", "BREACHED"
    max_safe_radius_m: float
    rth_recommended: bool
    details: str

class AerodynamicsService:
    def __init__(self, base_lat: float = -12.046374, base_lon: float = -77.042793, base_alt: float = 0.0):
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.base_alt = base_alt
        self.nominal_airspeed_ms = 6.5  # Standard survey cruise speed
        self.reserve_battery_pct = 15.0 # Mandatory landing buffer
        self.base_burn_rate_pct_sec = 0.055 # Nominal battery drain (~30 min endurance)

        # Global ambient wind state (allows simulation or derivation)
        self.ambient_wind_speed_ms = 3.8
        self.ambient_wind_dir_deg = 135.0  # From Southeast

    def set_ambient_wind(self, speed_ms: float, direction_deg: float):
        """Manually override ambient wind for simulation or sensor input."""
        self.ambient_wind_speed_ms = max(0.0, speed_ms)
        self.ambient_wind_dir_deg = direction_deg % 360.0

    def get_current_wind(self) -> WindEstimate:
        """Returns the current estimated wind vector."""
        # Convert meteorological direction (from where wind blows) to cartesian vector
        rad = math.radians(self.ambient_wind_dir_deg)
        # Wind blowing FROM theta means air moves towards theta + 180
        vx = -self.ambient_wind_speed_ms * math.sin(rad)
        vy = -self.ambient_wind_speed_ms * math.cos(rad)

        speed = self.ambient_wind_speed_ms
        if speed < 1.5:
            label = "CALMA"
        elif speed < 5.5:
            label = "BRISA MODERADA"
        elif speed < 10.0:
            label = "VIENTO FUERTE"
        else:
            label = "CONDICIÓN CRÍTICA"

        return WindEstimate(
            speed_ms=round(speed, 1),
            direction_deg=round(self.ambient_wind_dir_deg, 1),
            vector_x=round(vx, 2),
            vector_y=round(vy, 2),
            intensity_label=label
        )

    def calculate_distance_and_bearing_to_base(self, lat: float, lon: float) -> Tuple[float, float, float, float]:
        """
        Calculates distance (m), bearing (deg), and unit vector (ux, uy) from drone back to base.
        """
        d_north = (self.base_lat - lat) * METERS_PER_LAT_DEG
        d_east = (self.base_lon - lon) * (METERS_PER_LAT_DEG * math.cos(math.radians(self.base_lat)))
        distance = math.sqrt(d_east**2 + d_north**2)

        if distance < 0.1:
            return 0.0, 0.0, 0.0, 0.0

        ux = d_east / distance
        uy = d_north / distance
        bearing = (math.degrees(math.atan2(d_east, d_north)) + 360.0) % 360.0

        return distance, bearing, ux, uy

    def evaluate_pnr(self, drone_id: str, lat: float, lon: float, battery_pct: float) -> PNRStatus:
        """
        Calculates Point of No Return metrics for a specific drone.
        Accounts for headwind resistance on the return flight to base.
        """
        dist_m, bearing_deg, ux, uy = self.calculate_distance_and_bearing_to_base(lat, lon)
        wind = self.get_current_wind()

        # Wind velocity projected along the return vector:
        # positive if tailwind assisting return, negative if headwind opposing return
        wind_along_path = (wind.vector_x * ux) + (wind.vector_y * uy)

        # Ground speed returning to base
        return_ground_speed = max(1.5, self.nominal_airspeed_ms + wind_along_path)
        return_time_sec = dist_m / return_ground_speed if return_ground_speed > 0 else 9999.0

        # Dynamic battery burn rate (increased if pushing against headwind)
        headwind_penalty = max(0.0, -wind_along_path) * 0.008
        burn_rate = self.base_burn_rate_pct_sec + headwind_penalty

        # Battery required to safely reach base + mandatory reserve buffer
        battery_for_flight = return_time_sec * burn_rate
        battery_required = self.reserve_battery_pct + battery_for_flight

        battery_margin = battery_pct - battery_required

        # Maximum safe operational radius from base given current battery
        usable_battery = max(0.0, battery_pct - self.reserve_battery_pct)
        max_safe_radius = (usable_battery / burn_rate) * return_ground_speed if burn_rate > 0 else 0.0

        # Determine status
        if battery_margin <= 0.0:
            status = "BREACHED"
            rth_rec = True
            details = f"¡ALERTA PNR! Batería insuficiente para retorno contra viento ({wind.speed_ms} m/s). RTH OBLIGATORIO."
        elif battery_margin <= 6.0:
            status = "CRITICAL"
            rth_rec = True
            details = f"Margen crítico de PNR ({battery_margin:.1f}%). Iniciar retorno preventivo inmediatamente."
        elif battery_margin <= 14.0:
            status = "ADVISORY"
            rth_rec = False
            details = f"Advertencia PNR: Margen moderado ({battery_margin:.1f}%). Monitorear consumo."
        else:
            status = "NOMINAL"
            rth_rec = False
            details = f"Margen seguro ({battery_margin:.1f}%). Radio disponible: {max_safe_radius:.0f}m."

        return PNRStatus(
            drone_id=drone_id,
            distance_to_base_m=round(dist_m, 1),
            return_time_sec=round(return_time_sec, 1),
            return_ground_speed_ms=round(return_ground_speed, 1),
            battery_required_pct=round(battery_required, 1),
            battery_margin_pct=round(battery_margin, 1),
            pnr_status=status,
            max_safe_radius_m=round(max_safe_radius, 1),
            rth_recommended=rth_rec,
            details=details
        )

# Global aerodynamic manager instance
aerodynamics_service = AerodynamicsService()
