# -*- coding: utf-8 -*-
"""
AI Engine – ARES
Detección D-FINE, Proyección 3D, Kalman 3D, Trayectoria, Evasión CPA, Pipeline E2E.
"""

from .dfine import DFINEDetector, DetectionResult
from .vision import SpatialProjector, CameraIntrinsics
from .kalman import KalmanFilter3D, State6D
from .evasion import ReactiveEvasionEngine, DynamicObstacle
from .trajectory import Trajectory3D, Waypoint3D
from .pipeline import VisionEvasionPipeline, PipelineConfig
from .benchmark import EvasionBenchmark

__all__ = [
    "DFINEDetector",
    "DetectionResult",
    "SpatialProjector",
    "CameraIntrinsics",
    "KalmanFilter3D",
    "State6D",
    "ReactiveEvasionEngine",
    "DynamicObstacle",
    "Trajectory3D",
    "Waypoint3D",
    "VisionEvasionPipeline",
    "PipelineConfig",
    "EvasionBenchmark",
]
