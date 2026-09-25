from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import time

class AIHeartbeatPayload(BaseModel):
    node_id: str = Field(default="JETSON-ORIN-01", description="Identifier of the Edge AI node")
    model_name: str = Field(default="D-FINE-S-SAR", description="Name/version of the inference model (e.g. D-FINE-S, D-FINE-M)")
    architecture: str = Field(default="D-FINE RT-DETR (Fine-Grained Box Regression)", description="Model architecture")
    status: str = Field(default="ONLINE", description="ONLINE, INFERENCING, IDLE, WARNING, ERROR")
    fps: float = Field(default=32.4, ge=0.0, le=240.0, description="Inference frames per second")
    gpu_temp_c: float = Field(default=47.5, description="GPU temperature in Celsius")
    vram_usage_mb: float = Field(default=1880.0, description="VRAM consumption in MB")
    last_inference_latency_ms: float = Field(default=11.6, description="Latency per frame in milliseconds")
    timestamp: Optional[float] = None

class AIStatusResponse(BaseModel):
    is_online: bool
    status: str
    node_id: str
    model_name: str
    architecture: str = "D-FINE RT-DETR"
    fps: float
    gpu_temp_c: float
    vram_usage_mb: float
    last_inference_latency_ms: float
    seconds_since_last_heartbeat: float
    detections_processed_total: int
    system_message: str
