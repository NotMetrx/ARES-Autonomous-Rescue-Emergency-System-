"""
ARES AI and Vision Engine Package.
Exports D-FINE neural object detector, 3D pinhole projection, 6-state Kalman tracking,
and reactive 3D CPA evasion pipeline.
"""
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS
from src.ai.trajectory import generate_waypoints, haversine_distance
from src.ai.benchmark import run_simulation_benchmark
from src.ai.dfine import DFINEDetector, DetectionResult, CLASS_NAMES
from src.ai.vision import (
    SpatialProjector, CameraIntrinsics, MetricPrior, CLASS_METRIC_PRIORS
)
from src.ai.kalman import (
    KalmanFilter3D, SingleObstacleKalmanFilter, TrackedObstacle,
    MultiObstacleTracker3D, KalmanObstacleTracker, TrackedObstacleState
)
from src.ai.pipeline import VisionEvasionPipeline, PipelineResult, LatencyBreakdown

__all__ = [
    "ReactiveEvasionEngine",
    "DynamicObstacle",
    "SAFETY_BUBBLE_RADIUS_METERS",
    "generate_waypoints",
    "haversine_distance",
    "run_simulation_benchmark",
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
    "VisionEvasionPipeline",
    "PipelineResult",
    "LatencyBreakdown",
]
