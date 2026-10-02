"""
ARES Defense, Electronic Warfare, Tactical Aerodynamics, ATAK CoT & RF Link API Endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Query, Body
from pydantic import BaseModel
from proyectocompe.services.gps_anti_jamming_service import anti_jamming_service
from proyectocompe.services.aerodynamics_service import aerodynamics_service
from proyectocompe.services.cot_gateway import cot_gateway
from proyectocompe.services.binary_telemetry_service import binary_telemetry_service
from proyectocompe.services.swarm_simulator import swarm_simulator

router = APIRouter()

class EWAttackRequest(BaseModel):
    drone_id: str = "ARES-02"
    attack_type: str = "RF_JAMMING" # "RF_JAMMING", "SPOOFING_TELEPORT", "SPOOFING_ACCEL"

class ClearAttackRequest(BaseModel):
    drone_id: str = "ARES-02"

class WindUpdateRequest(BaseModel):
    speed_ms: float = 6.5
    direction_deg: float = 180.0

# --- Electronic Warfare / Anti-Jamming Endpoints ---

@router.get("/anti-jamming/status")
async def get_anti_jamming_status():
    """Returns Electronic Warfare threat level and GPS integrity status across the swarm."""
    return anti_jamming_service.get_fleet_ew_status()

@router.post("/anti-jamming/simulate-attack")
async def simulate_ew_attack(
    attack_type: Optional[str] = Query(default=None),
    drone_id: Optional[str] = Query(default=None),
    req: Optional[EWAttackRequest] = None
):
    """Simulates an active electronic warfare attack (Jamming or Spoofing) on a UAV."""
    d_id = drone_id or (req.drone_id if req else "ARES-01")
    a_type = attack_type or (req.attack_type if req else "RF_JAMMING")
    return anti_jamming_service.simulate_attack(d_id, a_type)

@router.post("/anti-jamming/clear-attack")
async def clear_ew_attack(
    drone_id: Optional[str] = Query(default=None),
    req: Optional[ClearAttackRequest] = None
):
    """Clears active electronic warfare interference and restores GPS locks."""
    d_id = drone_id or (req.drone_id if req else "ARES-01")
    res = anti_jamming_service.clear_attack(d_id)
    # Restore drone state in simulator
    if d_id in swarm_simulator.agents:
        from proyectocompe.schemas.drone import DroneFSMState
        swarm_simulator.agents[d_id]["fsm"] = DroneFSMState.IN_FLIGHT
    return res

# --- Aerodynamics & Point of No Return (PNR) Endpoints ---

@router.get("/aerodynamics/wind")
async def get_wind_estimate():
    """Returns real-time estimated wind vector and flight resistance."""
    return aerodynamics_service.get_current_wind()

@router.post("/aerodynamics/wind")
async def set_ambient_wind(
    speed_ms: Optional[float] = Query(default=None),
    direction_deg: Optional[float] = Query(default=None),
    req: Optional[WindUpdateRequest] = None
):
    """Overrides ambient wind speed and direction for meteorological simulation."""
    s = speed_ms if speed_ms is not None else (req.speed_ms if req else 6.5)
    d = direction_deg if direction_deg is not None else (req.direction_deg if req else 180.0)
    aerodynamics_service.set_ambient_wind(s, d)
    return {
        "status": "UPDATED",
        "wind": aerodynamics_service.get_current_wind()
    }

@router.get("/aerodynamics/pnr-status")
async def get_pnr_status_all():
    """Evaluates Point of No Return (PNR) metrics for all active swarm drones."""
    results = {}
    for drone_id, agent in swarm_simulator.agents.items():
        results[drone_id] = aerodynamics_service.evaluate_pnr(
            drone_id=drone_id,
            lat=agent["lat"],
            lon=agent["lon"],
            battery_pct=agent["battery"]
        )
    return results

# --- Cursor-on-Target (CoT) & ATAK Gateway Endpoints ---

@router.get("/cot/status")
async def get_cot_gateway_status():
    """Returns ATAK Cursor-on-Target UDP Gateway health, packet counters and port configuration."""
    return cot_gateway.get_status()

@router.post("/cot/broadcast-now")
async def trigger_cot_broadcast():
    """Manually triggers an immediate CoT XML broadcast to all ATAK / WinTAK clients on network."""
    drones_list = []
    for d_id, agent in swarm_simulator.agents.items():
        drones_list.append({
            "drone_id": d_id,
            "lat": agent["lat"],
            "lon": agent["lon"],
            "alt": agent["alt"],
            "speed_ms": agent["speed"],
            "battery": agent["battery"],
            "orientation": {"yaw": agent["heading"]},
            "fsm_state": str(agent["fsm"])
        })
    from proyectocompe.services.detection_db import detection_db
    detections = await detection_db.get_all_detections()
    targets_list = []
    for d in detections:
        targets_list.append({
            "target_id": d.detection_id,
            "class_name": str(d.target_class),
            "lat": d.estimated_lat,
            "lon": d.estimated_lon,
            "confidence": d.confidence,
            "priority": str(d.priority)
        })
    sent_count = cot_gateway.broadcast_swarm_and_targets(drones_list, targets_list)
    return {
        "status": "BROADCAST_COMPLETED",
        "events_transmitted": sent_count,
        "target_port": cot_gateway.target_port
    }

# --- RF Link Budget & Binary Telemetry Endpoints ---

@router.get("/rf-link/budget")
async def get_rf_link_budget(
    distance_m: float = Query(1200.0, description="Distance in meters between drone and Ground Station"),
    frequency_mhz: float = Query(915.0, description="RF carrier frequency (e.g. 433, 868, 915 MHz)"),
    tx_power_dbm: float = Query(20.0, description="Transmitter power in dBm (20 dBm = 100 mW)")
):
    """
    Computes Friis transmission equation, RSSI, SNR, packet loss,
    and shows 97% bandwidth compression metrics for tactical radio links.
    """
    return binary_telemetry_service.calculate_rf_link_budget(
        distance_m=distance_m,
        frequency_mhz=frequency_mhz,
        tx_power_dbm=tx_power_dbm
    )
