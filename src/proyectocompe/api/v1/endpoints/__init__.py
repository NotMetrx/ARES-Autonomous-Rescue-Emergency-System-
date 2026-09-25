from .drones import router as drones_router
from .missions import router as missions_router
from .tiles import router as tiles_router
from .detections import router as detections_router

__all__ = ["drones_router", "missions_router", "tiles_router", "detections_router"]
