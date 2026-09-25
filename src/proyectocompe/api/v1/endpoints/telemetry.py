from fastapi import APIRouter
from proyectocompe.schemas.telemetry import ExternalTelemetryIngest
from proyectocompe.services.swarm_simulator import swarm_simulator

router = APIRouter()

@router.post("/ingest")
async def ingest_external_telemetry(payload: ExternalTelemetryIngest):
    """
    Ingestion endpoint for real UAVs, companion computers, SITL bridges, or MAVLink gateways.
    Updates real-time swarm registry and keeps heartbeat watchdog alive.
    """
    res = swarm_simulator.ingest_external_telemetry(payload)
    return res

@router.get("/status")
async def get_telemetry_status():
    """Returns telemetry frequency and list of external vs synthetic agents."""
    agents_summary = {}
    for d_id, d in swarm_simulator.agents.items():
        agents_summary[d_id] = {
            "name": d.get("name"),
            "is_external": d.get("is_external", False),
            "battery": d.get("battery"),
            "fsm": d.get("fsm"),
        }
    return {
        "status": "OPERATIONAL",
        "agents": agents_summary,
        "total_active": len(swarm_simulator.agents)
    }

@router.get("/mavlink/status")
async def get_mavlink_status():
    """Returns MAVLink UDP listener status, connected Pixhawk/ArduPilot autopilots and port info."""
    from proyectocompe.services.mavlink_gateway import mavlink_gateway
    return mavlink_gateway.get_status()

@router.post("/mavlink/start")
async def start_mavlink_gateway():
    """Starts the native background MAVLink UDP listener on port 14550."""
    from proyectocompe.services.mavlink_gateway import mavlink_gateway
    mavlink_gateway.start()
    return {"status": "MAVLINK_GATEWAY_STARTED", "port": mavlink_gateway.port}

@router.post("/mavlink/simulate")
async def simulate_mavlink_packet(drone_id: str = "MAV-01"):
    """Injects a simulated MAVLink GLOBAL_POSITION_INT packet into the C2 registry."""
    from proyectocompe.services.mavlink_gateway import mavlink_gateway
    return mavlink_gateway.simulate_telemetry_packet(drone_id=drone_id)
