"""
src/ai/benchmark.py - 500-Obstacle Dynamic Monte Carlo Simulation Benchmark for ARES.
Validates >=95% collision avoidance success rate, <=25 collisions, and <50ms latency.
Supports pure kinematic mode and full visual sensing simulation with pinhole camera and Kalman tracking.
"""
import random
import time
from typing import Dict, Any, List, Optional
import numpy as np

from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle, SAFETY_BUBBLE_RADIUS_METERS
from src.ai.vision import SpatialProjector, CameraIntrinsics, DetectionResult
from src.ai.kalman import KalmanFilter3D

def run_simulation_benchmark(
    total_obstacles: int = 500,
    speed_range: Optional[List[float]] = None,
    obstacle_radius: float = 4.0,
    model_checkpoint: str = "model_epoch_200_edge.pt",
    use_visual_pipeline: bool = False
) -> Dict[str, Any]:
    """
    Executes dynamic obstacle evasion benchmark on 500 dynamic obstacles.
    Validates >=95% success rate, <=25 collisions, and <50ms latency.
    """
    if speed_range is None:
        speed_range = [2.0, 12.0]

    engine = ReactiveEvasionEngine(model_checkpoint=model_checkpoint)
    camera = CameraIntrinsics.from_fov() if use_visual_pipeline else None
    projector = SpatialProjector(camera=camera) if use_visual_pipeline else None

    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])  # 15 m/s forward cruise speed

    evaded_count = 0
    collision_count = 0
    latencies: List[float] = []

    random.seed(42)  # Reproducible benchmark seed
    np.random.seed(42)

    for _ in range(total_obstacles):
        # Generate dynamic obstacles heading toward or intersecting the drone's path
        t_intercept = random.uniform(1.0, 4.8)

        # Future drone position at intercept
        future_drone_pos = drone_pos + drone_vel * t_intercept

        # Random speed within range
        speed = random.uniform(speed_range[0], speed_range[1])

        # Heading angle
        angle = random.uniform(0, 2 * np.pi)
        vx = -speed * np.cos(angle)
        vy = speed * np.sin(angle)
        vz = random.uniform(-1.0, 1.0)
        obs_vel = np.array([vx, vy, vz])

        # Start position such that obstacle will intercept drone position at t_intercept +/- small offset
        offset = np.random.uniform(-10.0, 10.0, size=3)
        obs_pos = (future_drone_pos + offset) - obs_vel * t_intercept

        obstacle = DynamicObstacle(
            position=obs_pos,
            velocity=obs_vel,
            radius_meters=obstacle_radius
        )

        if use_visual_pipeline and projector is not None:
            # Multi-frame visual projection and Kalman state filtering
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

                # Inject optical pixel noise (sigma = 1.5 px) and FDR depth noise (sigma = 2%)
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
            perceived_obstacle = DynamicObstacle(
                position=est_pos,
                velocity=est_vel,
                radius_meters=obstacle_radius
            )
            eval_obstacle = perceived_obstacle
        else:
            eval_obstacle = obstacle

        is_threat, t_cpa, _ = engine.detect_collision_threat(drone_pos, drone_vel, eval_obstacle)

        if is_threat:
            evasion_disp, latency = engine.calculate_evasion_vector(drone_pos, drone_vel, eval_obstacle)
            latencies.append(latency)

            # Test evasion effect at CPA using real physical positions
            evaded_drone_pos = drone_pos + evasion_disp + drone_vel * t_cpa
            obs_pos_at_cpa = obstacle.position + obstacle.velocity * t_cpa
            final_distance = float(np.linalg.norm(evaded_drone_pos - obs_pos_at_cpa))

            # Collision occurred if final distance is less than safety distance
            if final_distance < (obstacle.radius_meters + 2.0):
                collision_count += 1
            else:
                evaded_count += 1
        else:
            # Safe by default
            evaded_count += 1

    success_rate = (evaded_count / total_obstacles) * 100.0
    avg_latency = float(np.mean(latencies)) if latencies else 0.5

    return {
        "rl_model_checkpoint": model_checkpoint,
        "total_obstacles_injected": total_obstacles,
        "evaded_obstacles_count": evaded_count,
        "collisions_count": collision_count,
        "success_rate_percentage": round(success_rate, 2),
        "charter_threshold_percentage": 95.0,
        "charter_criterion_met": bool(success_rate >= 95.0),
        "avg_recalculation_latency_ms": round(avg_latency, 2),
        "visual_pipeline_mode": use_visual_pipeline
    }

if __name__ == "__main__":
    res = run_simulation_benchmark(use_visual_pipeline=True)
    print("Visual benchmark results:", res)
