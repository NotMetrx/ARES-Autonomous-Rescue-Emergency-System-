"""
src/ai/pipeline.py - Unified Tactical Edge Vision-Evasion Pipeline for ARES.
Integrates D-FINE PyTorch Object Detection, Pinhole 3D Spatial Projection,
6-State Kinematic Kalman Filtering, and Reactive CPA Evasion strictly within <50ms budget.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple, Optional, Union
import time
import numpy as np

from src.ai.dfine import DFINEDetector, DetectionResult, CLASS_NAMES
from src.ai.vision import SpatialProjector, CameraIntrinsics
from src.ai.kalman import MultiObstacleTracker3D, KalmanFilter3D, TrackedObstacleState
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS

@dataclass
class LatencyBreakdown:
    """Granular execution latency metrics in milliseconds."""
    preprocess_ms: float
    detection_ms: float
    projection_ms: float
    tracking_ms: float
    evasion_ms: float
    total_pipeline_ms: float

    @property
    def is_within_sla(self) -> bool:
        """Verifies cumulative latency complies with <50ms statutory SLA."""
        return self.total_pipeline_ms < 50.0

@dataclass
class PipelineResult:
    """Unified result contract of the perception-to-evasion cycle."""
    threat_detected: bool
    evasion_vector: np.ndarray                      # 3D displacement vector [dx, dy, dz]
    time_to_cpa_seconds: float                     # Estimated seconds to CPA
    distance_at_cpa_meters: float                  # Estimated distance at CPA
    tracked_obstacles: List[TrackedObstacleState]  # Active 3D tracks
    raw_detections: List[DetectionResult]          # 2D camera detections
    latency: LatencyBreakdown                      # Timing breakdown

class VisionEvasionPipeline:
    """
    Tactical edge pipeline connecting perception to avoidance:
    Camera Frame -> D-FINE Detection -> 3D Pinhole Projection -> Kalman Filter Tracking -> CPA Evasion.
    """
    def __init__(
        self,
        detector: Optional[DFINEDetector] = None,
        projector: Optional[SpatialProjector] = None,
        tracker: Optional[MultiObstacleTracker3D] = None,
        evasion_engine: Optional[ReactiveEvasionEngine] = None,
        safety_bubble_radius: float = SAFETY_BUBBLE_RADIUS_METERS,
        confidence_threshold: float = 0.35,
        default_obstacle_radius: float = 4.0
    ):
        self.detector = detector or DFINEDetector(conf_threshold=confidence_threshold)
        self.projector = projector or SpatialProjector()
        self.tracker = tracker or MultiObstacleTracker3D(min_hits_to_confirm=1)
        self.evasion_engine = evasion_engine or ReactiveEvasionEngine()
        self.safety_bubble_radius = safety_bubble_radius
        self.confidence_threshold = confidence_threshold
        self.default_obstacle_radius = default_obstacle_radius
        self._last_time: Optional[float] = None

        # Pre-warm neural detector and spatial projector to eliminate cold-start cache misses
        try:
            _warm = np.zeros((224, 224, 3), dtype=np.uint8)
            self.detector.detect(_warm)
        except Exception:
            pass

    def process_frame(
        self,
        frame: np.ndarray,
        drone_pos: np.ndarray,
        drone_vel: np.ndarray,
        dt: Optional[float] = None,
        timestamp: Optional[float] = None,
        injected_detections: Optional[List[DetectionResult]] = None
    ) -> PipelineResult:
        """
        Executes end-to-end perception to evasion cycle:
        Frame -> D-FINE -> 3D Projection -> Kalman -> Evasion Vector.
        """
        t0 = time.perf_counter()

        now = timestamp if timestamp is not None else time.time()
        if dt is None:
            dt = (now - self._last_time) if self._last_time is not None else 0.05
        self._last_time = now
        dt = float(np.clip(dt, 0.001, 0.5))

        # 1. D-FINE Ingestion & Neural Inference
        t_det_start = time.perf_counter()
        if injected_detections is not None:
            detections = list(injected_detections)
        else:
            detections = self.detector.detect(frame, conf_thresh=self.confidence_threshold)
        t_det_end = time.perf_counter()
        detection_ms = (t_det_end - t_det_start) * 1000.0

        # 2. 3D Spatial Projection
        t_proj_start = time.perf_counter()
        measurements_3d: List[Tuple[np.ndarray, float]] = []
        for det in detections:
            try:
                pos_3d = self.projector.project_to_3d(det, drone_pos=drone_pos)
                prior = self.projector.priors.get(det.class_name, self.projector.priors["DEFAULT"])
                measurements_3d.append((pos_3d, prior.radius))
            except ValueError:
                # Discard degenerate / corrupted detections
                continue
        t_proj_end = time.perf_counter()
        projection_ms = (t_proj_end - t_proj_start) * 1000.0

        # 3. 3D Kinematic Kalman Tracking
        t_track_start = time.perf_counter()
        active_tracks: List[TrackedObstacleState] = self.tracker.update(measurements_3d, dt=dt)
        t_track_end = time.perf_counter()
        tracking_ms = (t_track_end - t_track_start) * 1000.0

        # 4. Reactive CPA Evasion Evaluation
        t_eva_start = time.perf_counter()
        threat_detected = False
        most_critical_evasion = np.zeros(3, dtype=float)
        min_tcpa = float("inf")
        min_dist_cpa = float("inf")

        for track in active_tracks:
            obstacle = DynamicObstacle(
                position=track.position,
                velocity=track.velocity,
                radius_meters=track.radius_meters
            )
            is_threat, tcpa, rcpa = self.evasion_engine.detect_collision_threat(
                drone_pos=drone_pos,
                drone_vel=drone_vel,
                obstacle=obstacle
            )
            if is_threat:
                threat_detected = True
                evasion_disp, _ = self.evasion_engine.calculate_evasion_vector(
                    drone_pos=drone_pos,
                    drone_vel=drone_vel,
                    obstacle=obstacle
                )
                if tcpa < min_tcpa:
                    min_tcpa = tcpa
                    min_dist_cpa = float(np.linalg.norm(rcpa))
                    most_critical_evasion = evasion_disp

        t_eva_end = time.perf_counter()
        evasion_ms = (t_eva_end - t_eva_start) * 1000.0

        total_pipeline_ms = (time.perf_counter() - t0) * 1000.0
        preprocess_ms = max(0.0, total_pipeline_ms - (detection_ms + projection_ms + tracking_ms + evasion_ms))

        latency_breakdown = LatencyBreakdown(
            preprocess_ms=round(preprocess_ms, 3),
            detection_ms=round(detection_ms, 3),
            projection_ms=round(projection_ms, 3),
            tracking_ms=round(tracking_ms, 3),
            evasion_ms=round(evasion_ms, 3),
            total_pipeline_ms=round(total_pipeline_ms, 3)
        )

        return PipelineResult(
            threat_detected=threat_detected,
            evasion_vector=most_critical_evasion,
            time_to_cpa_seconds=min_tcpa if threat_detected else 0.0,
            distance_at_cpa_meters=min_dist_cpa if threat_detected else 0.0,
            tracked_obstacles=active_tracks,
            raw_detections=detections,
            latency=latency_breakdown
        )
