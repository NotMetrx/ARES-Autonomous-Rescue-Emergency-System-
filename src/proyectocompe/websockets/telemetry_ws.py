import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from proyectocompe.websockets.connection_mgr import ws_manager

logger = logging.getLogger("ares.ws_route")
ws_router = APIRouter()

@ws_router.websocket("/ws/telemetry")
async def telemetry_websocket_endpoint(websocket: WebSocket):
    """
    Primary High-Frequency Telemetry Stream (10-30 Hz JSON).
    Delivers:
    - 3D Kinematics (Lat, Lon, Alt, Roll, Pitch, Yaw)
    - 15m Safety Bubble Status & Reactive Evasion Vectors
    - Fleet FSM Status, PNR margins, Wind vectors & GPS-Denied status
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"Received client message over WS: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

@ws_router.websocket("/ws/telemetry/binary")
async def telemetry_binary_websocket_endpoint(websocket: WebSocket):
    """
    Ultra-Compact Binary Telemetry Stream (~73 bytes per frame) for RF/LoRa radio gateways.
    Delivers compressed struct frames with CRC16 integrity.
    """
    await ws_manager.connect_binary(websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            logger.debug(f"Received binary radio client uplink: {len(data)} bytes")
    except WebSocketDisconnect:
        ws_manager.disconnect_binary(websocket)
    except Exception as e:
        logger.error(f"Binary WebSocket error: {e}")
        ws_manager.disconnect_binary(websocket)
