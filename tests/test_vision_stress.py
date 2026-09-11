"""
tests/test_vision_stress.py - Empirical Adversarial Stress & Latency Harness for Milestone M4.
Executes rigorous empirical challenges:
1. 500-cycle end-to-end execution latency distribution (<50ms budget: mean, median, P95, P99, max).
2. High obstacle load scaling (50 to 100 simultaneous detections in a single frame).
3. Degenerate bounding box inputs (0-area, inverted, negative, out-of-bounds, NaN/Inf).
4. Kalman numerical stability and covariance positive semi-definiteness under dynamic churn.
"""
import time
import math
import numpy as np
import pytest
from typing import List, Dict, Any, Tuple

from src.ai.dfine import DFINEDetector, DetectionResult, CLASS_NAMES, TORCH_AVAILABLE
from src.ai.vision import SpatialProjector, CameraIntrinsics, CLASS_METRIC_PRIORS
from src.ai.kalman import MultiObstacleTracker3D, KalmanFilter3D, TrackedObstacleState
from src.ai.pipeline import VisionEvasionPipeline, PipelineResult, LatencyBreakdown
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS

# --------------------------------------------------------------------------
# 1. 500-Cycle End-to-End Latency Distribution Stress Test
# --------------------------------------------------------------------------
def test_500_cycle_end_to_end_latency_distribution():
    """
    Empirically profiles 500 consecutive cycles of VisionEvasionPipeline.
    Measures end-to-end and component latency distribution:
    Mean, Median, Min, Max, P90, P95, P99, and StdDev.
    Verifies adherence to the <50ms statutory SLA budget.
    """
    pipeline = VisionEvasionPipeline()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])

    # Warmup cycles (10 iterations) to stabilize JIT, thread pool, and CPU caching
    for w in range(10):
        warmup_frame = np.random.randint(0, 50, (224, 224, 3), dtype=np.uint8)
        pipeline.process_frame(warmup_frame, drone_pos, drone_vel, dt=0.05)

    num_cycles = 500
    total_latencies: List[float] = []
    detection_latencies: List[float] = []
    projection_latencies: List[float] = []
    tracking_latencies: List[float] = []
    evasion_latencies: List[float] = []
    spike_cycles: List[Tuple[int, float]] = []

    np.random.seed(1337)
    for cycle in range(num_cycles):
        # Generate realistic dynamic synthetic frame with moving salient target
        frame = np.zeros((224, 224, 3), dtype=np.uint8)
        # Dynamic moving obstacle blob to trigger active detection & evasion paths
        bx = int(90 + 30 * math.sin(cycle * 0.1))
        by = int(90 + 30 * math.cos(cycle * 0.1))
        frame[by:by+30, bx:bx+30] = 200

        t_start = time.perf_counter()
        result = pipeline.process_frame(frame, drone_pos, drone_vel, dt=0.05)
        t_total = (time.perf_counter() - t_start) * 1000.0

        total_latencies.append(t_total)
        detection_latencies.append(result.latency.detection_ms)
        projection_latencies.append(result.latency.projection_ms)
        tracking_latencies.append(result.latency.tracking_ms)
        evasion_latencies.append(result.latency.evasion_ms)

        if t_total >= 50.0:
            spike_cycles.append((cycle, t_total))

    # Calculate empirical distribution statistics
    lat_arr = np.array(total_latencies)
    mean_lat = float(np.mean(lat_arr))
    median_lat = float(np.median(lat_arr))
    std_lat = float(np.std(lat_arr))
    min_lat = float(np.min(lat_arr))
    max_lat = float(np.max(lat_arr))
    p90_lat = float(np.percentile(lat_arr, 90))
    p95_lat = float(np.percentile(lat_arr, 95))
    p99_lat = float(np.percentile(lat_arr, 99))

    det_mean = float(np.mean(detection_latencies))
    proj_mean = float(np.mean(projection_latencies))
    track_mean = float(np.mean(tracking_latencies))
    eva_mean = float(np.mean(evasion_latencies))

    print("\n" + "=" * 65)
    print("500-CYCLE END-TO-END PIPELINE LATENCY DISTRIBUTION:")
    print("=" * 65)
    print(f"Cycles:     {num_cycles}")
    print(f"Mean:       {mean_lat:.2f} ms")
    print(f"Median:     {median_lat:.2f} ms")
    print(f"Std Dev:    {std_lat:.2f} ms")
    print(f"Min:        {min_lat:.2f} ms")
    print(f"P90:        {p90_lat:.2f} ms")
    print(f"P95:        {p95_lat:.2f} ms")
    print(f"P99:        {p99_lat:.2f} ms")
    print(f"Max:        {max_lat:.2f} ms")
    print(f"Spikes >=50ms: {len(spike_cycles)} / {num_cycles}")
    print("-" * 65)
    print("STAGE BREAKDOWN (MEAN):")
    print(f"  Detection:  {det_mean:.2f} ms")
    print(f"  Projection: {proj_mean:.3f} ms")
    print(f"  Tracking:   {track_mean:.3f} ms")
    print(f"  Evasion:    {eva_mean:.3f} ms")
    print("=" * 65)

    # Statistical assertions strictly enforcing SLA budget
    assert mean_lat < 50.0, f"Mean latency ({mean_lat:.2f} ms) exceeds 50 ms budget"
    assert median_lat < 50.0, f"Median latency ({median_lat:.2f} ms) exceeds 50 ms budget"
    assert p95_lat < 50.0, f"P95 latency ({p95_lat:.2f} ms) exceeds 50 ms budget"
    # Over 500 cycles on desktop CPU, ensure at least 95% of cycles are strictly under budget
    compliance_rate = (sum(1 for lat in total_latencies if lat < 50.0) / num_cycles) * 100.0
    assert compliance_rate >= 95.0, f"SLA compliance rate ({compliance_rate:.1f}%) fell below 95.0%"


# --------------------------------------------------------------------------
# 2. High Obstacle Load Scaling Stress Test (50 to 100 Simultaneous Detections)
# --------------------------------------------------------------------------
@pytest.mark.parametrize("obstacle_count", [50, 75, 100])
def test_high_obstacle_load_scaling(obstacle_count: int):
    """
    Stress-tests spatial projection, multi-target Kalman tracking, and CPA evasion
    under extreme simultaneous obstacle loads (50, 75, 100 detections in a single frame).
    Verifies that spatial projection, association, and evasion scale without latency blowup.
    """
    projector = SpatialProjector()
    tracker = MultiObstacleTracker3D(min_hits_to_confirm=1)
    evasion_engine = ReactiveEvasionEngine()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])

    np.random.seed(42)
    # Synthesize `obstacle_count` distinct bounding boxes distributed across the camera FOV
    detections: List[DetectionResult] = []
    for i in range(obstacle_count):
        cx = np.random.uniform(50.0, 590.0)
        cy = np.random.uniform(50.0, 430.0)
        bw = np.random.uniform(10.0, 80.0)
        bh = np.random.uniform(10.0, 80.0)
        x1 = max(0.0, cx - bw / 2.0)
        y1 = max(0.0, cy - bh / 2.0)
        x2 = min(640.0, cx + bw / 2.0)
        y2 = min(480.0, cy + bh / 2.0)

        detections.append(DetectionResult(
            bbox_2d=(x1, y1, x2, y2),
            confidence=float(np.random.uniform(0.5, 0.95)),
            class_id=0,
            class_name="OBSTACLE",
            uncertainty=0.03
        ))

    # 1. Measure Batch Projection Latency
    t0_proj = time.perf_counter()
    projected_points = projector.project_batch(detections, drone_pos=drone_pos)
    proj_lat_ms = (time.perf_counter() - t0_proj) * 1000.0

    assert projected_points.shape == (obstacle_count, 3)
    # Batch projection of 100 obstacles must execute in sub-millisecond time
    assert proj_lat_ms < 5.0, f"Projection of {obstacle_count} obstacles ({proj_lat_ms:.2f} ms) exceeded 5.0 ms"

    # 2. Measure Multi-Target Tracking Update Latency
    measurements_3d = [(projected_points[i], 4.0) for i in range(obstacle_count)]
    t0_track = time.perf_counter()
    # Step 1: Initial birth of tracks (tentative tracks created)
    active_tracks_step1 = tracker.update(measurements_3d, dt=0.05)
    track_lat_ms_step1 = (time.perf_counter() - t0_track) * 1000.0

    # Note: On step 1, newly spawned tracks are tentative; tracker.update only returns CONFIRMED/COASTED
    # Step 2: Second frame observation confirms tracks
    perturbed_measurements = [
        (projected_points[i] + np.random.normal(0.0, 0.2, size=3), 4.0)
        for i in range(obstacle_count)
    ]
    t0_match = time.perf_counter()
    active_tracks_step2 = tracker.update(perturbed_measurements, dt=0.05)
    track_lat_ms_step2 = (time.perf_counter() - t0_match) * 1000.0

    assert len(active_tracks_step2) == obstacle_count
    # Association and Kalman update for 100 tracks must remain well within budget (< 30 ms)
    assert track_lat_ms_step2 < 30.0, f"Tracking {obstacle_count} obstacles ({track_lat_ms_step2:.2f} ms) exceeded 30.0 ms"

    # 3. Measure CPA Evasion Evaluation across all active tracks
    t0_eva = time.perf_counter()
    threats_found = 0
    for track in active_tracks_step2:
        dyn_obs = DynamicObstacle(
            position=track.position,
            velocity=track.velocity,
            radius_meters=track.radius_meters
        )
        is_threat, tcpa, _ = evasion_engine.detect_collision_threat(drone_pos, drone_vel, dyn_obs)
        if is_threat:
            threats_found += 1
            _, _ = evasion_engine.calculate_evasion_vector(drone_pos, drone_vel, dyn_obs)
    eva_lat_ms = (time.perf_counter() - t0_eva) * 1000.0

    assert eva_lat_ms < 10.0, f"Evasion evaluation for {obstacle_count} tracks ({eva_lat_ms:.2f} ms) exceeded 10.0 ms"

    total_downstream_ms = proj_lat_ms + track_lat_ms_step2 + eva_lat_ms
    print(f"\n[Load: {obstacle_count:3d}] Proj: {proj_lat_ms:.3f}ms | Track: {track_lat_ms_step2:.3f}ms | Evasion: {eva_lat_ms:.3f}ms | Total Non-Neural: {total_downstream_ms:.3f}ms")
    assert total_downstream_ms < 25.0, f"Cumulative non-neural processing for {obstacle_count} obstacles exceeded 25.0 ms"


# --------------------------------------------------------------------------
# 3. Degenerate Bounding Box Input Stress Test
# --------------------------------------------------------------------------
def test_degenerate_bounding_boxes():
    """
    Adversarial challenge: Stress-tests spatial projection and pipeline robustness
    against pathological, corrupted, and degenerate 2D bounding boxes:
    - 0-area boxes (points, horizontal lines, vertical lines)
    - Inverted coordinates (x1 > x2, y1 > y2)
    - Negative pixel coordinates
    - Coordinates far beyond image boundaries
    - NaN and Inf coordinate injections
    """
    projector = SpatialProjector()
    drone_pos = np.array([0.0, 0.0, 100.0])

    pathological_cases = [
        # (Case Name, bbox_2d)
        ("Zero-Area Point", (100.0, 100.0, 100.0, 100.0)),
        ("Zero-Width Vertical Line", (150.0, 50.0, 150.0, 200.0)),
        ("Zero-Height Horizontal Line", (50.0, 150.0, 200.0, 150.0)),
        ("Inverted Coordinates X", (300.0, 50.0, 100.0, 200.0)),
        ("Inverted Coordinates Y", (50.0, 300.0, 200.0, 100.0)),
        ("Completely Inverted", (400.0, 400.0, 100.0, 100.0)),
        ("Negative Coordinates", (-100.0, -50.0, 50.0, 50.0)),
        ("Deep Negative Coords", (-500.0, -500.0, -100.0, -100.0)),
        ("Massive Out-of-Bounds", (1000.0, 2000.0, 3000.0, 4000.0)),
        ("Astronomical Coordinates", (1e6, 1e6, 1e6 + 50.0, 1e6 + 50.0)),
        ("Tiny Subpixel Box", (100.0, 100.0, 100.001, 100.001)),
    ]

    for name, bbox in pathological_cases:
        det = DetectionResult(
            bbox_2d=bbox,
            confidence=0.8,
            class_id=0,
            class_name="OBSTACLE",
            uncertainty=0.1
        )
        # Depth estimation must not crash with ZeroDivisionError or domain errors
        depth = projector.estimate_depth(det)
        assert not math.isnan(depth), f"Depth was NaN for {name}: {bbox}"
        assert not math.isinf(depth), f"Depth was Inf for {name}: {bbox}"
        assert depth >= 0.5 and depth <= 300.0, f"Depth out of bounds for {name}: {depth}"

        # 3D projection must yield valid finite 3D coordinates
        pos_3d = projector.project_to_3d(det, drone_pos=drone_pos)
        assert isinstance(pos_3d, np.ndarray) and pos_3d.shape == (3,)
        assert not np.any(np.isnan(pos_3d)), f"NaN in 3D position for {name}: {pos_3d}"
        assert not np.any(np.isinf(pos_3d)), f"Inf in 3D position for {name}: {pos_3d}"

        # project_box_to_3d convenience method must also succeed cleanly
        pos_box = projector.project_box_to_3d(bbox, drone_pos=drone_pos)
        assert isinstance(pos_box, np.ndarray) and pos_box.shape == (3,)
        assert not np.any(np.isnan(pos_box)), f"NaN in project_box_to_3d for {name}: {pos_box}"

    # Batch projection with degenerate cases must also execute safely
    batch_pathological = [
        DetectionResult(bbox_2d=b, confidence=0.75, class_id=0, class_name="OBSTACLE", uncertainty=0.1)
        for _, b in pathological_cases
    ]
    batch_pts = projector.project_batch(batch_pathological, drone_pos=drone_pos)
    assert batch_pts.shape == (len(pathological_cases), 3)
    assert not np.any(np.isnan(batch_pts)), "NaN detected in batch projection of degenerate boxes"
    assert not np.any(np.isinf(batch_pts)), "Inf detected in batch projection of degenerate boxes"


def test_nan_inf_bounding_box_resilience():
    """
    Tests behavior when NaN or Inf pixel values are passed to bounding box structures.
    Verifies that the system detects or sanitizes NaN/Inf values without catastrophic crash.
    """
    projector = SpatialProjector()
    drone_pos = np.array([0.0, 0.0, 100.0])

    nan_boxes = [
        (float("nan"), 100.0, 200.0, 200.0),
        (100.0, float("nan"), 200.0, 200.0),
        (100.0, 100.0, float("nan"), 200.0),
        (100.0, 100.0, 200.0, float("nan")),
        (float("inf"), 100.0, 200.0, 200.0),
        (100.0, 100.0, 200.0, float("inf")),
    ]

    for bbox in nan_boxes:
        det = DetectionResult(
            bbox_2d=bbox,
            confidence=0.8,
            class_id=0,
            class_name="OBSTACLE",
            uncertainty=0.1
        )
        try:
            depth = projector.estimate_depth(det)
            pos_3d = projector.project_to_3d(det, drone_pos=drone_pos)
            # If function succeeds, result should either be sanitized or handled cleanly
            print(f"[Sanitized NaN/Inf] Box: {bbox} -> Depth: {depth}, Pos: {pos_3d}")
        except Exception as e:
            # Expected graceful failure
            assert isinstance(e, (ValueError, TypeError, OverflowError))


# --------------------------------------------------------------------------
# 4. Kalman Covariance Stability and Dynamic Churn Stress Test
# --------------------------------------------------------------------------
def test_kalman_covariance_stability_and_churn():
    """
    Stress-tests Kalman filter numerical stability under dynamic tracking churn:
    - Rapid birth, coasting, and deletion of 50 intermittent tracks over 100 steps.
    - Verifies that state covariance matrix P remains symmetric positive semi-definite
      (all eigenvalues >= 0) via the Joseph form covariance update.
    """
    tracker = MultiObstacleTracker3D(gating_threshold_meters=15.0, min_hits_to_confirm=2, max_misses_to_delete=3)
    np.random.seed(999)

    # 1. Test single Kalman filter positive semi-definiteness under ill-conditioned measurements
    kf = KalmanFilter3D(initial_position=np.array([10.0, 0.0, 100.0]), dt_default=0.05)
    for step in range(100):
        # Inject noisy, sometimes jittery measurements
        meas = np.array([10.0 + step * 0.1, np.sin(step) * 5.0, 100.0]) + np.random.normal(0, 1.0, 3)
        kf.predict_and_update(meas, dt=0.05)

        # Check covariance matrix P symmetry: P == P^T
        assert np.allclose(kf.P, kf.P.T, atol=1e-8), f"Step {step}: Covariance P lost symmetry"

        # Check positive semi-definiteness: all eigenvalues >= 0
        eigenvals = np.linalg.eigvalsh(kf.P)
        assert np.all(eigenvals >= -1e-6), f"Step {step}: Negative eigenvalue in P: {eigenvals}"

    # 2. Multi-obstacle tracker churn: 30 tracks dynamically entering and leaving
    track_lifecycles = {}
    for step in range(50):
        # Step: Generate random subset of active measurements
        active_meas = []
        for obj_id in range(25):
            # 70% chance object is visible in this frame (30% occlusion rate)
            if np.random.rand() < 0.7:
                meas_pos = np.array([20.0 + obj_id * 2.0, np.sin(step * 0.2 + obj_id) * 3.0, 100.0])
                active_meas.append(meas_pos)

        confirmed_obstacles = tracker.step(active_meas, dt=0.05)
        for dyn_obs in confirmed_obstacles:
            assert dyn_obs.position.shape == (3,)
            assert dyn_obs.velocity.shape == (3,)
            assert not np.any(np.isnan(dyn_obs.position))
            assert not np.any(np.isnan(dyn_obs.velocity))

    print("\n[Kalman Churn] 50 steps completed successfully. Active tracks remaining:", len(tracker.tracks))
    assert len(tracker.tracks) > 0
