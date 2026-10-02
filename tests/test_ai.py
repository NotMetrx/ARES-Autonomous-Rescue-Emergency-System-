import pytest
import numpy as np
from src.ai.benchmark import run_simulation_benchmark
from src.ai.evasion import ReactiveEvasionEngine, DynamicObstacle

def test_ai_001_simulation_benchmark_success_rate():
    """TEST-AI-001: Tasa de éxito de evasión dinámica en simulación (> 95%)."""
    result = run_simulation_benchmark(total_obstacles=500)
    
    assert result["total_obstacles_injected"] == 500
    assert result["collisions_count"] <= 25, f"Collisions ({result['collisions_count']}) exceeded limit (25)"
    assert result["success_rate_percentage"] >= 95.0, f"Success rate ({result['success_rate_percentage']}%) below charter (95.0%)"
    assert result["charter_criterion_met"] is True

def test_ai_002_reactive_recalculation_latency():
    """TEST-AI-002: Latencia de recálculo reactivo en el Edge (< 50 ms)."""
    engine = ReactiveEvasionEngine()
    drone_pos = np.array([0.0, 0.0, 100.0])
    drone_vel = np.array([15.0, 0.0, 0.0])
    
    # Sudden obstacle 15 meters ahead
    obstacle = DynamicObstacle(
        position=np.array([15.0, 0.0, 100.0]),
        velocity=np.array([-5.0, 0.0, 0.0]),
        radius_meters=4.0
    )
    
    evasion_disp, latency_ms = engine.calculate_evasion_vector(drone_pos, drone_vel, obstacle)
    
    assert latency_ms < 50.0, f"Inference latency ({latency_ms:.2f} ms) exceeded edge threshold (50 ms)"
    assert np.linalg.norm(evasion_disp) > 0.0, "Evasion vector must be non-zero when obstacle is in safety zone"
