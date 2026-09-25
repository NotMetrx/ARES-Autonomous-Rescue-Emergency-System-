import json
import logging
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger("ares.ws")

class TelemetryConnectionManager:
    """Manages real-time WebSocket client connections for ARES Tactical Dashboard (JSON & Binary)."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.active_binary_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Active clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"Client disconnected. Active clients: {len(self.active_connections)}")

    async def connect_binary(self, websocket: WebSocket):
        await websocket.accept()
        self.active_binary_connections.add(websocket)
        logger.info(f"Binary radio client connected. Active binary clients: {len(self.active_binary_connections)}")

    def disconnect_binary(self, websocket: WebSocket):
        self.active_binary_connections.discard(websocket)
        logger.info(f"Binary radio client disconnected. Active binary clients: {len(self.active_binary_connections)}")

    async def broadcast_frame(self, frame_data: dict):
        """Broadcasts a high-frequency telemetry frame to all connected dashboards."""
        if not self.active_connections:
            return

        dead_connections = set()
        payload = json.dumps(frame_data)

        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.add(connection)

        for dead in dead_connections:
            self.active_connections.discard(dead)

    async def broadcast_binary_frame(self, binary_data: bytes):
        """Broadcasts ultra-compact packed bytes to RF/LoRa radio bridge clients."""
        if not self.active_binary_connections:
            return

        dead_connections = set()
        for connection in self.active_binary_connections:
            try:
                await connection.send_bytes(binary_data)
            except Exception:
                dead_connections.add(connection)

        for dead in dead_connections:
            self.active_binary_connections.discard(dead)

ws_manager = TelemetryConnectionManager()
