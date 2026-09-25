from typing import List
from fastapi import APIRouter, HTTPException
from proyectocompe.schemas.drone import DroneStatus, DroneCommandRequest, DroneFSMState
from proyectocompe.services.fsm_service import fsm_service
from proyectocompe.services.swarm_simulator import swarm_simulator

router = APIRouter()

@router.get("", response_model=List[DroneStatus])
async def list_fleet_drones():
    """Retrieve current operational status and FSM state for all drones in the swarm."""
    return fsm_service.get_all_drones()

@router.get("/{drone_id}", response_model=DroneStatus)
async def get_drone_status(drone_id: str):
    """Retrieve details for a specific drone by ID."""
    drone = fsm_service.get_drone(drone_id)
    if not drone:
        raise HTTPException(status_code=404, detail=f"Drone {drone_id} not found in active fleet")
    return drone

@router.post("/command")
async def send_fleet_command(cmd_req: DroneCommandRequest):
    """
    Broadcast tactical command to all active drones in the swarm:
    - TAKEOFF
    - LAND
    - RTH
    - EMERGENCY_STOP
    """
    results = []
    for d in fsm_service.get_all_drones():
        success, msg = fsm_service.handle_command(d.drone_id, cmd_req.command)
        if success:
            drone_updated = fsm_service.get_drone(d.drone_id)
            if drone_updated:
                swarm_simulator.set_drone_command(d.drone_id, drone_updated.fsm_state)
            results.append({"drone_id": d.drone_id, "status": "SUCCESS", "detail": msg})
        else:
            results.append({"drone_id": d.drone_id, "status": "FAILED", "detail": msg})

    return {
        "status": "COMPLETED",
        "command": cmd_req.command.value,
        "results": results,
        "message": f"Comando {cmd_req.command.value} ejecutado en {len(results)} drones."
    }

@router.post("/{drone_id}/command")
async def send_drone_command(drone_id: str, cmd_req: DroneCommandRequest):
    """
    Send tactical command to a drone:
    - TAKEOFF
    - LAND
    - RTH
    - EMERGENCY_STOP
    - GOTO / HOLD
    """
    success, msg = fsm_service.handle_command(drone_id, cmd_req.command)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    # Propagate state to simulator if running
    drone = fsm_service.get_drone(drone_id)
    if drone:
        swarm_simulator.set_drone_command(drone_id, drone.fsm_state)

    return {"status": "SUCCESS", "drone_id": drone_id, "command": cmd_req.command.value, "detail": msg}

@router.post("/{drone_id}/fsm-transition")
async def manual_fsm_transition(drone_id: str, new_state: DroneFSMState):
    """Force an FSM transition under tactical override."""
    success = fsm_service.transition_state(drone_id, new_state)
    if not success:
        raise HTTPException(status_code=400, detail=f"Invalid transition to {new_state.value}")
    
    swarm_simulator.set_drone_command(drone_id, new_state)
    return {"status": "SUCCESS", "drone_id": drone_id, "new_state": new_state.value}
