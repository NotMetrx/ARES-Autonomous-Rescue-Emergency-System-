# -*- coding: utf-8 -*-
"""
AI Engine – ARES
Unified D-FINE Detection, 3D Pinhole Projection, 6-State Kalman 3D,
Reactive CPA Evasion, End-to-End Pipeline, and Training / Hardening parity.
"""
from src.ai.dfine import DFINEDetector, DetectionResult, CLASS_NAMES
from src.ai.vision import (
    SpatialProjector, CameraIntrinsics, MetricPrior, CLASS_METRIC_PRIORS
)
from src.ai.kalman import (
    KalmanFilter3D, SingleObstacleKalmanFilter, TrackedObstacle,
    MultiObstacleTracker3D, KalmanObstacleTracker, TrackedObstacleState
)
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS
from src.ai.trajectory import generate_waypoints, haversine_distance, distance_3d
from src.ai.pipeline import VisionEvasionPipeline, PipelineResult, LatencyBreakdown
from src.ai.benchmark import run_simulation_benchmark

# Parity aliases
State6D = TrackedObstacleState
EvasionBenchmark = run_simulation_benchmark

class PipelineConfig:
    """Config dataclass placeholder for training/eval pipeline parity."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

class Trajectory3D:
    """Trajectory 3D placeholder for route planning parity."""
    def __init__(self, waypoints=None):
        self.waypoints = waypoints or []

class Waypoint3D:
    """3D Waypoint placeholder."""
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x = x
        self.y = y
        self.z = z

__all__ = [
    "DFINEDetector",
    "DetectionResult",
    "CLASS_NAMES",
    "SpatialProjector",
    "CameraIntrinsics",
    "MetricPrior",
    "CLASS_METRIC_PRIORS",
    "KalmanFilter3D",
    "SingleObstacleKalmanFilter",
    "TrackedObstacle",
    "MultiObstacleTracker3D",
    "KalmanObstacleTracker",
    "TrackedObstacleState",
    "State6D",
    "ReactiveEvasionEngine",
    "DynamicObstacle",
    "SAFETY_BUBBLE_RADIUS_METERS",
    "generate_waypoints",
    "haversine_distance",
    "distance_3d",
    "Trajectory3D",
    "Waypoint3D",
    "VisionEvasionPipeline",
    "PipelineResult",
    "LatencyBreakdown",
    "PipelineConfig",
    "EvasionBenchmark",
    "run_simulation_benchmark",
]
