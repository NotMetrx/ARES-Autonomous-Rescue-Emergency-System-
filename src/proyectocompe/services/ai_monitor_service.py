import time
import logging
from typing import Dict, Optional
from proyectocompe.schemas.ai_engine import AIHeartbeatPayload, AIStatusResponse
from proyectocompe.websockets.connection_mgr import ws_manager

logger = logging.getLogger("ares.ai_monitor")

class AIMonitorService:
    """
    Monitors health, telemetry, and uptime of the Edge AI Detection Engine (Jetson / RPi).
    Triggers watchdog alerts if heartbeat is lost for > 6 seconds.
    """
    def __init__(self):
        self.last_heartbeat_time: float = time.time()
        self.latest_payload: AIHeartbeatPayload = AIHeartbeatPayload(
            node_id="JETSON-ORIN-01",
            model_name="D-FINE-S-SAR",
            architecture="D-FINE RT-DETR (Fine-Grained Box Regression)",
            status="ONLINE",
            fps=32.4,
            gpu_temp_c=46.8,
            vram_usage_mb=1880.0,
            last_inference_latency_ms=11.4,
            timestamp=time.time()
        )
        self.detections_processed_count: int = 0
        self.watchdog_timeout_sec: float = 6.0

    def record_heartbeat(self, payload: AIHeartbeatPayload) -> AIStatusResponse:
        now = time.time()
        payload.timestamp = now
        self.last_heartbeat_time = now
        self.latest_payload = payload
        return self.get_status()

    def increment_detections(self):
        self.detections_processed_count += 1

    def get_status(self) -> AIStatusResponse:
        now = time.time()
        delta = now - self.last_heartbeat_time
        is_online = delta <= self.watchdog_timeout_sec

        status = self.latest_payload.status if is_online else "OFFLINE"
        msg = (
            f"Edge AI {self.latest_payload.node_id} ({self.latest_payload.model_name}) running normally"
            if is_online else f"CRITICAL: Edge AI Heartbeat lost for {delta:.1f}s!"
        )

        return AIStatusResponse(
            is_online=is_online,
            status=status,
            node_id=self.latest_payload.node_id,
            model_name=self.latest_payload.model_name,
            fps=self.latest_payload.fps if is_online else 0.0,
            gpu_temp_c=self.latest_payload.gpu_temp_c,
            vram_usage_mb=self.latest_payload.vram_usage_mb,
            last_inference_latency_ms=self.latest_payload.last_inference_latency_ms,
            seconds_since_last_heartbeat=round(delta, 2),
            detections_processed_total=self.detections_processed_count,
            system_message=msg
        )

ai_monitor = AIMonitorService()
