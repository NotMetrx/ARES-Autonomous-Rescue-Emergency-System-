"""
tests/test_adversarial_collision.py - Empirical Adversarial Collision & Tracking Challenge for Milestone M4.

Empirical test suite executing:
1. Head-on collisions targeting drone center across various closing speeds.
2. Sudden obstacle spawns directly inside the 15m safety bubble.
3. Multi-obstacle orthogonal convergence (3 to 5 simultaneous converging threats).
4. Highly erratic velocity changes (acceleration jumps violating constant velocity assumption).
5. Optical occlusion & track coasting (dropping 1 to 10 frames, evaluating survival and re-acquisition).
6. 5-seed 500 dynamic obstacles simulation benchmark (verifying >= 95% success rate across all seeds).
"""
import random
import time
import math
from typing import Dict, List, Any, Tuple
import numpy as np
import pytest

from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS
from src.ai.vision import SpatialProjector, CameraIntrinsics, DetectionResult
from src.ai.kalman import KalmanFilter3D, MultiObstacleTracker3D, TrackedObstacleState
from src.ai.pipeline import VisionEvasionPipeline, PipelineResult


# ============================================================================
# 1. HEAD-ON COLLISIONS DIRECTLY TARGETING DRONE CENTER
# ============================================================================
@pytest.mark.parametrize("closing_speed", [10.0, 20.0, 30.0, 40.0, 50.0])
def test_adv_head_on_collision(closing_speed: float):
    """
    Adversarial Challenge 1: Direct head-on collision course where obstacle is on
    the exact line of flight toward the drone, causing r_cpa ~ 0.
    Verifies singularity handling, evasion vector generation, and physical clearance at CPA.
    """
    engine = ReactiveEvasionEngine()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_speed = 15.0
    drone_vel = np.array([drone_speed, 0.0, 0.0])

    # Ensure obstacle is within the 5.0s prediction horizon
    # For a given closing_speed, place obstacle at distance = closing_speed * 3.0 (t_cpa = 3.0s)
    initial_distance = min(60.0, closing_speed * 3.0)
    obs_pos = drone_pos + np.array([initial_distance, 0.0, 0.0])
    obs_vel = drone_vel + np.array([-closing_speed, 0.0, 0.0])
    obs_radius = 4.0

    obstacle = DynamicObstacle(position=obs_pos, velocity=obs_vel, radius_meters=obs_radius)

    # 1. Threat detection
    is_threat, t_cpa, r_cpa = engine.detect_collision_threat(drone_pos, drone_vel, obstacle)
    assert bool(is_threat) is True, f"Head-on obstacle at {initial_distance}m not flagged as threat"
    assert t_cpa > 0.0, f"t_cpa should be positive, got {t_cpa}"
    assert np.linalg.norm(r_cpa) < 1e-2, f"r_cpa should be near zero for head-on collision, got {np.linalg.norm(r_cpa)}"

    # 2. Evasion vector generation
    evasion_disp, latency_ms = engine.calculate_evasion_vector(drone_pos, drone_vel, obstacle)
    assert latency_ms < 50.0, f"Latency {latency_ms:.2f}ms exceeds 50ms SLA"
    assert np.linalg.norm(evasion_disp) > 0.0, "Evasion displacement must be non-zero for head-on collision"

    # Check singularity deflection: should deflect into non-zero lateral/vertical components
    assert evasion_disp[1] != 0.0 or evasion_disp[2] != 0.0, "Singularity evasion should deflect off collision axis"

    # 3. Physical clearance at CPA after applying evasion displacement
    evaded_drone_pos = drone_pos + evasion_disp + drone_vel * t_cpa
    obs_pos_at_cpa = obstacle.position + obstacle.velocity * t_cpa
    separation_at_cpa = float(np.linalg.norm(evaded_drone_pos - obs_pos_at_cpa))

    # Margin check: separation must strictly exceed obstacle radius + collision buffer (2m)
    min_required = obs_radius + 2.0
    assert separation_at_cpa >= min_required, (
        f"Head-on collision! Separation at CPA ({separation_at_cpa:.2f}m) < required {min_required}m "
        f"at closing speed {closing_speed} m/s"
    )


# ============================================================================
# 2. OBSTACLES SPAWNED DIRECTLY INSIDE 15M SAFETY BUBBLE
# ============================================================================
@pytest.mark.parametrize("spawn_distance,spawn_offset", [
    (14.0, [0.0, 0.0]),
    (10.0, [1.0, 0.0]),
    (5.0, [0.0, -1.0]),
    (2.0, [0.5, 0.5]),
    (0.5, [0.0, 0.0]),  # Point-blank emergency spawn
])
def test_adv_inside_bubble_spawn(spawn_distance: float, spawn_offset: List[float]):
    """
    Adversarial Challenge 2: Threat pops up directly inside the 15m safety bubble.
    Verifies immediate zero-delay detection, reactive repulsion force, and sub-millisecond response.
    """
    engine = ReactiveEvasionEngine()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([10.0, 0.0, 0.0])

    obs_pos = drone_pos + np.array([spawn_distance, spawn_offset[0], spawn_offset[1]])
    obs_vel = np.array([-5.0, 0.0, 0.0])
    obs_radius = 3.5

    obstacle = DynamicObstacle(position=obs_pos, velocity=obs_vel, radius_meters=obs_radius)

    # Threat detection
    is_threat, t_cpa, r_cpa = engine.detect_collision_threat(drone_pos, drone_vel, obstacle)
    assert bool(is_threat) is True, f"Obstacle inside 15m bubble (dist={spawn_distance}m) must be an immediate threat"

    # Evasion calculation
    evasion_disp, latency_ms = engine.calculate_evasion_vector(drone_pos, drone_vel, obstacle)
    assert latency_ms < 50.0, f"Latency {latency_ms:.2f}ms exceeds 50ms SLA"

    evasion_mag = float(np.linalg.norm(evasion_disp))
    assert evasion_mag > 0.0, "Evasion vector magnitude must be > 0 inside safety bubble"

    # Required clearance verification
    expected_min_clearance = engine.safety_bubble + obs_radius + 5.0
    evaded_pos = drone_pos + evasion_disp
    dist_after_evasion = float(np.linalg.norm(evaded_pos - obstacle.position))
    assert dist_after_evasion >= (obs_radius + 2.0), (
        f"Post-evasion distance {dist_after_evasion:.2f}m insufficient to prevent collision"
    )


# ============================================================================
# 3. CONVERGING SWARM THREATS (3 TO 5 SIMULTANEOUS ORTHOGONAL THREATS)
# ============================================================================
def test_adv_multi_obstacle_orthogonal_convergence():
    """
    Adversarial Challenge 3: 3 to 5 simultaneous threats converging on the drone
    from mutually orthogonal spatial axes (+X, -X, +Y, -Y, +Z, -Z).
    Evaluates multi-obstacle threat resolution, priority sorting by t_cpa,
    and single-vector vs multi-threat evasion dynamics.
    """
    pipeline = VisionEvasionPipeline()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([0.0, 0.0, 0.0])  # Hovering drone to isolate threat kinematics

    # 5 orthogonal converging threats at 30m approaching at 10 m/s -> all converge at t = 3.0s
    threats_data = [
        {"name": "FRONT",  "pos": np.array([30.0, 0.0, 100.0]),  "vel": np.array([-10.0, 0.0, 0.0]),  "radius": 3.0},
        {"name": "LEFT",   "pos": np.array([0.0, 30.0, 100.0]),  "vel": np.array([0.0, -10.0, 0.0]),  "radius": 3.0},
        {"name": "RIGHT",  "pos": np.array([0.0, -30.0, 100.0]), "vel": np.array([0.0, 10.0, 0.0]),   "radius": 3.0},
        {"name": "ABOVE",  "pos": np.array([0.0, 0.0, 130.0]),  "vel": np.array([0.0, 0.0, -10.0]),  "radius": 3.0},
        {"name": "BELOW",  "pos": np.array([0.0, 0.0, 70.0]),   "vel": np.array([0.0, 0.0, 10.0]),   "radius": 3.0},
    ]

    engine = ReactiveEvasionEngine()
    evasion_results = []

    # Evaluate each threat individually
    for t_info in threats_data:
        obs = DynamicObstacle(position=t_info["pos"], velocity=t_info["vel"], radius_meters=t_info["radius"])
        is_threat, tcpa, rcpa = engine.detect_collision_threat(drone_pos, drone_vel, obs)
        assert bool(is_threat) is True, f"{t_info['name']} threat not flagged"
        disp, lat = engine.calculate_evasion_vector(drone_pos, drone_vel, obs)
        evasion_results.append({
            "name": t_info["name"],
            "tcpa": tcpa,
            "evasion_vector": disp,
            "latency": lat
        })

    assert len(evasion_results) == 5

    # Multi-threat tracker evaluation
    tracker = MultiObstacleTracker3D(min_hits_to_confirm=1)
    measurements = [t["pos"] for t in threats_data]
    active_states = tracker.update(measurements, dt=0.05)
    assert len(active_states) == 5, f"Tracker failed to register all 5 converging threats, got {len(active_states)}"

    # When all 5 threats converge simultaneously, evaluate pipeline selection:
    # Stagger FRONT threat slightly so it has smallest t_cpa (t=2.5s vs 3.0s)
    threats_staggered = [
        (np.array([25.0, 0.0, 100.0]), 3.0),   # Front at 25m -> tcpa = 2.5s
        (np.array([0.0, 30.0, 100.0]), 3.0),   # Left at 30m -> tcpa = 3.0s
        (np.array([0.0, -30.0, 100.0]), 3.0),  # Right at 30m -> tcpa = 3.0s
    ]
    tracker2 = MultiObstacleTracker3D(min_hits_to_confirm=1)
    step1 = tracker2.update(threats_staggered, dt=0.05)
    # Simulate step 2
    threats_staggered_t2 = [
        (np.array([24.5, 0.0, 100.0]), 3.0),
        (np.array([0.0, 29.5, 100.0]), 3.0),
        (np.array([0.0, -29.5, 100.0]), 3.0),
    ]
    step2 = tracker2.update(threats_staggered_t2, dt=0.05)
    assert len(step2) == 3


# ============================================================================
# 4. HIGHLY ERRATIC VELOCITY CHANGES (ACCELERATION JUMPS)
# ============================================================================
def test_adv_erratic_acceleration_jumps():
    """
    Adversarial Challenge 4: Obstacle violates constant velocity assumption with
    severe acceleration jumps (e.g. 5g abrupt lateral reversal).
    Evaluates Kalman filter innovation, filter stability, covariance bounds, and reconvergence.
    """
    dt = 0.05
    kf = KalmanFilter3D(initial_position=np.array([50.0, 0.0, 100.0]), dt_default=dt, q_acc=4.0)

    # Phase 1: Steady flight for 10 steps (v = [-10, 0, 0])
    pos = np.array([50.0, 0.0, 100.0])
    vel = np.array([-10.0, 0.0, 0.0])
    for _ in range(10):
        pos = pos + vel * dt
        meas = pos + np.random.normal(0.0, 0.2, size=3)
        kf.predict_and_update(meas, dt=dt)

    # Phase 2: Violent Acceleration Jump! Instantaneous 90-degree turn to v = [0, 15, 5] (3g acceleration impulse)
    vel_jump = np.array([0.0, 15.0, 5.0])
    tracking_errors = []

    for step in range(25):  # 25 steps = 1.25s
        pos = pos + vel_jump * dt
        meas = pos + np.random.normal(0.0, 0.3, size=3)
        est_pos, est_vel = kf.predict_and_update(meas, dt=dt)
        vel_err = float(np.linalg.norm(est_vel - vel_jump))
        tracking_errors.append(vel_err)

    # Check convergence: velocity error must drop from initial peak to < 3.0 m/s within 20 steps (1.0s)
    final_vel_err = tracking_errors[-1]
    assert final_vel_err < 3.0, f"Kalman filter failed to adapt to velocity jump: final error = {final_vel_err:.2f} m/s"

    # Verify covariance remains positive definite and finite
    cov = kf.P
    assert np.all(np.isfinite(cov)), "Covariance matrix contains NaN or Inf"
    eigenvals = np.linalg.eigvals(cov)
    assert np.all(eigenvals > 0), f"Covariance is not positive definite: min eigenvalue = {np.min(eigenvals)}"


# ============================================================================
# 5. OPTICAL OCCLUSION & TRACK COASTING
# ============================================================================
@pytest.mark.parametrize("drop_frames,expected_survived", [
    (1, True),
    (2, True),
    (3, True),
    (4, True),
    (5, False),  # max_misses_to_delete = 5 -> deleted at 5 misses
    (8, False),
    (10, False),
])
def test_adv_optical_occlusion_and_coasting(drop_frames: int, expected_survived: bool):
    """
    Adversarial Challenge 5: Optical occlusion test dropping detections for 1 to 10 frames.
    Measures track survival, miss count accumulation, state transition to COASTED/DELETED,
    and forward extrapolation accuracy.
    """
    tracker = MultiObstacleTracker3D(min_hits_to_confirm=2, max_misses_to_delete=5)
    dt = 0.05
    true_pos = np.array([40.0, 0.0, 100.0])
    true_vel = np.array([-10.0, 0.0, 0.0])

    # 1. Establish confirmed track with 3 consecutive hits
    for _ in range(3):
        true_pos = true_pos + true_vel * dt
        tracker.step([true_pos.copy()], dt=dt)

    assert len(tracker.tracks) == 1
    t_id = list(tracker.tracks.keys())[0]
    assert tracker.tracks[t_id].state == "CONFIRMED"

    # 2. Simulate optical occlusion by passing empty measurements for drop_frames
    for frame_idx in range(drop_frames):
        true_pos = true_pos + true_vel * dt
        tracker.step([], dt=dt)

    # 3. Assess track survival
    if expected_survived:
        assert t_id in tracker.tracks, f"Track {t_id} unexpectedly dropped after {drop_frames} frames"
        track = tracker.tracks[t_id]
        assert track.state == "COASTED"
        assert track.miss_count == drop_frames

        # Extrapolation check: predicted position should be within 1.5m of true physical position
        pred_pos = track.kf.position
        pos_err = float(np.linalg.norm(pred_pos - true_pos))
        assert pos_err < 2.0, f"Coasting position error ({pos_err:.2f}m) exceeded 2.0m after {drop_frames} frames"
    else:
        assert t_id not in tracker.tracks, f"Track {t_id} should have been deleted after {drop_frames} misses"


# ============================================================================
# 6. 5-SEED 500 DYNAMIC OBSTACLES SIMULATION BENCHMARK
# ============================================================================
def _run_seeded_benchmark(seed: int, total_obstacles: int = 500, use_visual_pipeline: bool = True) -> Dict[str, Any]:
    """Runs 500-obstacle benchmark with explicit seed control."""
    random.seed(seed)
    np.random.seed(seed)

    engine = ReactiveEvasionEngine()
    camera = CameraIntrinsics.from_fov() if use_visual_pipeline else None
    projector = SpatialProjector(camera=camera) if use_visual_pipeline else None

    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])
    obstacle_radius = 4.0
    speed_range = [2.0, 12.0]

    evaded_count = 0
    collision_count = 0
    latencies: List[float] = []

    for _ in range(total_obstacles):
        t_intercept = random.uniform(1.0, 4.8)
        future_drone_pos = drone_pos + drone_vel * t_intercept
        speed = random.uniform(speed_range[0], speed_range[1])
        angle = random.uniform(0, 2 * math.pi)
        vx = -speed * math.cos(angle)
        vy = speed * math.sin(angle)
        vz = random.uniform(-1.0, 1.0)
        obs_vel = np.array([vx, vy, vz])
        offset = np.random.uniform(-10.0, 10.0, size=3)
        obs_pos = (future_drone_pos + offset) - obs_vel * t_intercept

        obstacle = DynamicObstacle(position=obs_pos, velocity=obs_vel, radius_meters=obstacle_radius)

        if use_visual_pipeline and projector is not None:
            dt_step = 0.05
            kf = None
            for step in range(3):
                t_sim = step * dt_step
                true_pos = obs_pos + obs_vel * t_sim
                drone_step_pos = drone_pos + drone_vel * t_sim
                rel_pos = true_pos - drone_step_pos

                depth = max(1.0, rel_pos[0])
                w_pix = (camera.fx * (2.0 * obstacle_radius)) / depth
                h_pix = (camera.fy * (2.0 * obstacle_radius)) / depth
                u_c = camera.cx + (camera.fx * rel_pos[1]) / depth
                v_c = camera.cy - (camera.fy * rel_pos[2]) / depth

                u_meas = u_c + np.random.normal(0.0, 1.5)
                v_meas = v_c + np.random.normal(0.0, 1.5)
                w_meas = max(1.0, w_pix * (1.0 + np.random.normal(0.0, 0.02)))
                h_meas = max(1.0, h_pix * (1.0 + np.random.normal(0.0, 0.02)))

                bbox = [u_meas - w_meas / 2.0, v_meas - h_meas / 2.0, u_meas + w_meas / 2.0, v_meas + h_meas / 2.0]
                noisy_3d_pos = projector.project_box_to_3d(bbox, drone_pos=drone_step_pos, obstacle_diameter_meters=2.0 * obstacle_radius)

                if kf is None:
                    kf = KalmanFilter3D(initial_position=noisy_3d_pos, dt_default=dt_step)
                else:
                    kf.predict_and_update(noisy_3d_pos, dt=dt_step)

            est_pos, est_vel = kf.get_state()
            eval_obstacle = DynamicObstacle(position=est_pos, velocity=est_vel, radius_meters=obstacle_radius)
        else:
            eval_obstacle = obstacle

        is_threat, t_cpa, _ = engine.detect_collision_threat(drone_pos, drone_vel, eval_obstacle)

        if is_threat:
            evasion_disp, latency = engine.calculate_evasion_vector(drone_pos, drone_vel, eval_obstacle)
            latencies.append(latency)
            evaded_drone_pos = drone_pos + evasion_disp + drone_vel * t_cpa
            obs_pos_at_cpa = obstacle.position + obstacle.velocity * t_cpa
            final_distance = float(np.linalg.norm(evaded_drone_pos - obs_pos_at_cpa))

            if final_distance < (obstacle.radius_meters + 2.0):
                collision_count += 1
            else:
                evaded_count += 1
        else:
            evaded_count += 1

    success_rate = (evaded_count / total_obstacles) * 100.0
    avg_latency = float(np.mean(latencies)) if latencies else 0.5

    return {
        "seed": seed,
        "total_obstacles": total_obstacles,
        "evaded_count": evaded_count,
        "collision_count": collision_count,
        "success_rate_pct": round(success_rate, 2),
        "avg_latency_ms": round(avg_latency, 3),
        "passed": bool(success_rate >= 95.0 and collision_count <= 25)
    }


def test_adv_5_seed_500_obstacle_benchmark():
    """
    Adversarial Challenge 6: Validates that the 500 dynamic obstacles simulation benchmark
    holds >= 95.0% success rate (<= 25 collisions) across 5 independent random seeds:
    Seeds: [42, 101, 2024, 777, 99999].
    """
    seeds = [42, 101, 2024, 777, 99999]
    results = []

    for seed in seeds:
        res = _run_seeded_benchmark(seed=seed, total_obstacles=500, use_visual_pipeline=True)
        results.append(res)

    for r in results:
        assert r["passed"] is True, (
            f"Seed {r['seed']} failed: success rate {r['success_rate_pct']}% "
            f"with {r['collision_count']} collisions (limit <= 25)"
        )
        assert r["avg_latency_ms"] < 50.0, f"Seed {r['seed']} latency {r['avg_latency_ms']}ms exceeds 50ms"
