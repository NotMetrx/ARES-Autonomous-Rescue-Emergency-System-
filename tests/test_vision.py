"""
tests/test_vision.py - Unit, Integration, and Benchmark Tests for Vision Pipeline.
Validates TEST-VIS-001 through TEST-VIS-006:
- TEST-VIS-001: test_dfine_forward_pass_and_fdr_uncertainty
- TEST-VIS-002: test_pinhole_spatial_projection
- TEST-VIS-003: test_kalman_filter_velocity_convergence
- TEST-VIS-004: test_end_to_end_vision_evasion_latency
- TEST-VIS-005: test_visual_obstacle_collision_avoidance
- TEST-VIS-006: test_500_dynamic_obstacles_visual_benchmark
"""
import time
import math
import numpy as np
import pytest

from src.ai.dfine import (
    DFINEDetector, DetectionResult, CLASS_NAMES,
    TORCH_AVAILABLE
)
if TORCH_AVAILABLE:
    import torch
    from src.ai.dfine import DFINEDetectionModel

from src.ai.vision import (
    SpatialProjector, CameraIntrinsics, CLASS_METRIC_PRIORS, MetricPrior
)
from src.ai.kalman import (
    KalmanFilter3D, SingleObstacleKalmanFilter, TrackedObstacle,
    MultiObstacleTracker3D, TrackedObstacleState
)
from src.ai.pipeline import (
    VisionEvasionPipeline, PipelineResult, LatencyBreakdown
)
from src.ai.benchmark import run_simulation_benchmark
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS

# --------------------------------------------------------------------------
# TEST-VIS-001: D-FINE Forward Pass & FDR Uncertainty Regression
# --------------------------------------------------------------------------
def test_dfine_forward_pass_and_fdr_uncertainty():
    """TEST-VIS-001: D-FINE forward pass, tensor shapes, FDR expectation and variance."""
    detector = DFINEDetector(input_size=(224, 224), conf_threshold=0.35)
    dummy_frame = np.zeros((224, 224, 3), dtype=np.uint8)

    # 1. Pipeline detect call contract
    results = detector.detect(dummy_frame)
    assert isinstance(results, list)

    # 2. PyTorch neural network validation
    if TORCH_AVAILABLE:
        model = DFINEDetectionModel(num_classes=4, num_queries=20, num_bins=16)
        model.eval()

        dummy_tensor = torch.zeros(1, 3, 224, 224, dtype=torch.float32)
        with torch.inference_mode():
            cls_logits, expected_boxes, uncertainties = model(dummy_tensor)

        assert cls_logits.shape == (1, 20, 4), f"Unexpected cls_logits shape: {cls_logits.shape}"
        assert expected_boxes.shape == (1, 20, 4), f"Unexpected expected_boxes shape: {expected_boxes.shape}"
        assert uncertainties.shape == (1, 20, 4), f"Unexpected uncertainties shape: {uncertainties.shape}"

        # Coordinate expectations must lie in [0.0, 1.0]
        assert (expected_boxes >= 0.0).all() and (expected_boxes <= 1.0).all()
        # Uncertainties must be non-negative
        assert (uncertainties >= 0.0).all()

        # 3. Mathematical validation of FDR Distribution Properties:
        bins = torch.linspace(0.0, 1.0, 16)

        # Case A: Sharp Dirac distribution (certainty) -> sigma -> 0
        sharp_probs = torch.zeros(16)
        sharp_probs[5] = 1.0
        sharp_exp = (sharp_probs * bins).sum().item()
        sharp_var = (sharp_probs * ((bins - sharp_exp) ** 2)).sum().item()
        sharp_std = math.sqrt(sharp_var + 1e-8)
        assert pytest.approx(sharp_exp, abs=1e-5) == bins[5].item()
        assert sharp_std < 0.01, f"Sharp distribution uncertainty ({sharp_std}) should be ~0"

        # Case B: Uniform distribution (maximum ambiguity) -> sigma ~ 0.288
        uniform_probs = torch.ones(16) / 16.0
        uniform_exp = (uniform_probs * bins).sum().item()
        uniform_var = (uniform_probs * ((bins - uniform_exp) ** 2)).sum().item()
        uniform_std = math.sqrt(uniform_var)
        assert pytest.approx(uniform_exp, abs=0.01) == 0.5
        assert pytest.approx(uniform_std, abs=0.03) == 0.298

        # 4. CPU Inference latency <= 30ms
        latencies = []
        # Warmup
        for _ in range(3):
            with torch.inference_mode():
                _ = model(dummy_tensor)

        for _ in range(15):
            t0 = time.perf_counter()
            with torch.inference_mode():
                _ = model(dummy_tensor)
            latencies.append((time.perf_counter() - t0) * 1000.0)

        median_latency = float(np.median(latencies))
        assert median_latency <= 30.0, f"D-FINE CPU median latency ({median_latency:.2f} ms) exceeds 30ms budget"

# --------------------------------------------------------------------------
# TEST-VIS-002: 3D Pinhole Spatial Projection & Depth Estimation
# --------------------------------------------------------------------------
def test_pinhole_spatial_projection():
    """TEST-VIS-002: 2D bounding box to 3D coordinate projection, depth estimation, and latency."""
    camera = CameraIntrinsics.from_fov(width=640, height=480, hfov_deg=75.0)
    projector = SpatialProjector(camera=camera)

    # 1. Geometric depth estimation:
    # An obstacle with width 4.0m that occupies 160 pixels horizontally:
    # Z = (fx * W) / w_pix = (417.0 * 4.0) / 160.0 = 10.425 meters
    det = DetectionResult(
        bbox_2d=(240.0, 160.0, 400.0, 320.0),
        confidence=0.95,
        class_id=0,
        class_name="OBSTACLE",
        uncertainty=0.05
    )
    depth = projector.estimate_depth(det)
    expected_depth = (camera.fx * 4.0) / 160.0
    assert pytest.approx(depth, rel=1e-3) == expected_depth

    # 2. Frame transformation (Camera -> Body -> World)
    drone_pos = np.array([0.0, 0.0, 100.0])
    pos_world = projector.project_to_3d(det, depth_estimate=20.0, drone_pos=drone_pos, drone_yaw=0.0)

    # +X is forward in body frame (+0.15m camera mount offset)
    assert pytest.approx(pos_world[0], abs=0.25) == 20.15
    assert pytest.approx(pos_world[1], abs=0.5) == 0.0
    assert pytest.approx(pos_world[2], abs=0.5) == 100.0

    # 3. Direct project_box_to_3d convenience interface
    bbox_centered = (80.0, 80.0, 144.0, 144.0)
    pos_box = projector.project_box_to_3d(bbox_centered, drone_pos=drone_pos, obstacle_diameter_meters=4.0)
    assert isinstance(pos_box, np.ndarray) and pos_box.shape == (3,)

    # 4. Batch projection latency (< 1.0 ms for 20 detections)
    batch_dets = [
        DetectionResult(
            bbox_2d=(100.0 + i, 100.0, 200.0 + i, 200.0),
            confidence=0.90,
            class_id=0,
            class_name="OBSTACLE",
            uncertainty=0.02
        )
        for i in range(20)
    ]
    # Warmup
    _ = projector.project_batch(batch_dets, drone_pos=drone_pos)

    t0 = time.perf_counter()
    for _ in range(10):
        batch_pts = projector.project_batch(batch_dets, drone_pos=drone_pos)
    batch_ms = (time.perf_counter() - t0) * 1000.0 / 10.0

    assert batch_pts.shape == (20, 3)
    assert batch_ms < 1.0, f"Batch projection latency ({batch_ms:.3f} ms) exceeded 1.0 ms limit"

# --------------------------------------------------------------------------
# TEST-VIS-003: 6-State Kinematic Kalman Filter Convergence
# --------------------------------------------------------------------------
def test_kalman_filter_velocity_convergence():
    """TEST-VIS-003: 6-state Kalman filter velocity tracking convergence under noisy measurements."""
    true_pos = np.array([30.0, 10.0, 100.0])
    true_vel = np.array([-10.0, 2.0, 0.0])  # Approaching drone at 10 m/s
    dt = 0.05

    kf = KalmanFilter3D(initial_position=true_pos, dt_default=dt, q_acc=2.5)

    np.random.seed(42)
    for _ in range(20):  # 20 steps = 1.0 second of observations
        true_pos = true_pos + true_vel * dt
        noisy_measurement = true_pos + np.random.normal(0.0, [0.4, 0.4, 0.8])
        kf.predict_and_update(noisy_measurement, dt=dt)

    est_pos = kf.position
    est_vel = kf.velocity

    vel_error = float(np.linalg.norm(est_vel - true_vel))
    assert vel_error < 1.0, f"Kalman velocity error ({vel_error:.2f} m/s) did not converge within 1.0 m/s"

    # SingleObstacleKalmanFilter alias compatibility
    skf = SingleObstacleKalmanFilter(initial_pos=np.array([50.0, 0.0, 100.0]), dt=0.05)
    skf.predict(dt=0.05)
    skf.update(np.array([49.5, 0.1, 100.0]))
    s_pos, s_vel = skf.get_state()
    assert s_pos.shape == (3,) and s_vel.shape == (3,)

    # Coasting through visual dropouts (3 occluded frames)
    tracker = MultiObstacleTracker3D(min_hits_to_confirm=2)
    tracker.step([np.array([20.0, 0.0, 100.0])], dt=0.05)
    tracker.step([np.array([19.5, 0.0, 100.0])], dt=0.05)

    assert len(tracker.tracks) == 1
    t_id = list(tracker.tracks.keys())[0]
    assert tracker.tracks[t_id].state == "CONFIRMED"

    # 3 frames with no observations
    for _ in range(3):
        tracker.step([], dt=0.05)

    assert t_id in tracker.tracks
    assert tracker.tracks[t_id].state == "COASTED"
    assert tracker.tracks[t_id].miss_count == 3
    # Extrapolated forward position
    assert tracker.tracks[t_id].kf.position[0] < 19.5

# --------------------------------------------------------------------------
# TEST-VIS-004: End-to-End Vision-Evasion Pipeline Latency (< 50 ms)
# --------------------------------------------------------------------------
def test_end_to_end_vision_evasion_latency():
    """TEST-VIS-004: Verifies cumulative pipeline latency < 50 ms and breakdown components."""
    pipeline = VisionEvasionPipeline()
    frame = np.zeros((224, 224, 3), dtype=np.uint8)
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])

    # Warmup pass
    _ = pipeline.process_frame(frame, drone_pos, drone_vel)

    latencies = []
    results: List[PipelineResult] = []
    for _ in range(5):
        res = pipeline.process_frame(frame, drone_pos, drone_vel)
        latencies.append(res.latency.total_pipeline_ms)
        results.append(res)

    mean_latency = float(np.mean(latencies))
    assert mean_latency < 50.0, f"Mean pipeline latency ({mean_latency:.2f} ms) exceeds 50 ms SLA"

    last_res = results[-1]
    assert last_res.latency.is_within_sla is True
    assert last_res.latency.detection_ms >= 0.0
    assert last_res.latency.projection_ms >= 0.0
    assert last_res.latency.tracking_ms >= 0.0
    assert last_res.latency.evasion_ms >= 0.0

# --------------------------------------------------------------------------
# TEST-VIS-005: Visual Obstacle Collision Avoidance within Safety Bubble
# --------------------------------------------------------------------------
def test_visual_obstacle_collision_avoidance():
    """TEST-VIS-005: Reactive evasion vector triggers when dynamic obstacle enters 15m bubble."""
    pipeline = VisionEvasionPipeline()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])

    # Draw synthetic high-contrast obstacle blob on camera frame
    frame = np.zeros((224, 224, 3), dtype=np.uint8)
    # Draw 40x40 pixel obstacle square in center
    frame[92:132, 92:132] = 240

    # Process frame 1 (birth) and frame 2 (confirmation)
    _ = pipeline.process_frame(frame, drone_pos, drone_vel, dt=0.05)
    res = pipeline.process_frame(frame, drone_pos, drone_vel, dt=0.05)

    assert isinstance(res, PipelineResult)
    assert len(res.raw_detections) > 0, "D-FINE failed to detect synthetic visual obstacle"

    # Also test explicit injection of threatening detection
    injected_det = DetectionResult(
        bbox_2d=(220.0, 140.0, 420.0, 340.0),
        confidence=0.92,
        class_id=0,
        class_name="OBSTACLE",
        uncertainty=0.04
    )
    res_injected = pipeline.process_frame(
        frame, drone_pos, drone_vel,
        injected_detections=[injected_det]
    )

    assert isinstance(res_injected, PipelineResult)
    assert len(res_injected.tracked_obstacles) > 0

    # Verify reactive evasion vector is activated
    engine = ReactiveEvasionEngine()
    critical_obstacle = DynamicObstacle(
        position=np.array([14.0, 0.0, 100.0]),  # 14m ahead (inside 15m bubble)
        velocity=np.array([-5.0, 0.0, 0.0]),
        radius_meters=4.0
    )
    is_threat, tcpa, _ = engine.detect_collision_threat(drone_pos, drone_vel, critical_obstacle)
    assert bool(is_threat) is True

    evasion_vector, evasion_latency = engine.calculate_evasion_vector(drone_pos, drone_vel, critical_obstacle)
    assert np.linalg.norm(evasion_vector) > 0.0, "Evasion vector must be non-zero within 15m safety bubble"
    assert evasion_latency < 50.0

# --------------------------------------------------------------------------
# TEST-VIS-006: 500 Dynamic Obstacles Visual Simulation Benchmark
# --------------------------------------------------------------------------
def test_500_dynamic_obstacles_visual_benchmark():
    """TEST-VIS-006: Monte Carlo benchmark with 500 dynamic obstacles under visual sensing."""
    result = run_simulation_benchmark(total_obstacles=500, use_visual_pipeline=True)

    assert result["total_obstacles_injected"] == 500
    assert result["collisions_count"] <= 25, f"Collisions ({result['collisions_count']}) exceeded limit (25)"
    assert result["success_rate_percentage"] >= 95.0, f"Success rate ({result['success_rate_percentage']}%) below 95.0%"
    assert result["charter_criterion_met"] is True
    assert result["avg_recalculation_latency_ms"] < 50.0
    assert result["visual_pipeline_mode"] is True
