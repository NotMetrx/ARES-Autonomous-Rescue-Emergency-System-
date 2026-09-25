import time
from proyectocompe.services.swarm_simulator import swarm_simulator
from proyectocompe.services.collision_service import collision_service
from proyectocompe.services.fsm_service import fsm_service
from proyectocompe.schemas.drone import DroneFSMState, DroneCommandType

def test_swarm_physics_and_collision():
    print("[TEST 1] Testing swarm simulator physics frame generation...")
    frame = swarm_simulator.update_physics()
    assert frame.active_drones_count == 3
    assert len(frame.drones) == 3
    print(f" -> Generated Frame #{frame.frame_sequence} with {len(frame.drones)} drones.")
    d0 = frame.drones[0]
    print(f" -> {d0.drone_id}: Lat={d0.lat}, Lon={d0.lon}, Alt={d0.alt}m, Speed={d0.speed_ms}m/s, State={d0.fsm_state}")

    print("\n[TEST 2] Testing 15m Safety Bubble & Sub-50ms Reactive Evasion...")
    # Intentionally place two drones within 8 meters of each other
    mock_telemetry = [
        {"drone_id": "TEST-A", "lat": -12.0463, "lon": -77.0428, "alt": 30.0},
        {"drone_id": "TEST-B", "lat": -12.0463, "lon": -77.0428 + 0.00007, "alt": 30.0}, # ~7.6 meters apart
    ]
    t0 = time.perf_counter()
    breach_map, alerts = collision_service.evaluate_swarm_safety(mock_telemetry)
    dt_ms = (time.perf_counter() - t0) * 1000.0

    assert breach_map["TEST-A"][0] is True, "TEST-A should be in breach"
    assert breach_map["TEST-B"][0] is True, "TEST-B should be in breach"
    assert len(alerts) > 0, "Should generate an evasion alert"
    assert dt_ms < 50.0, f"Latency {dt_ms}ms must be < 50ms!"
    print(f" -> Collision detected! Distance={breach_map['TEST-A'][2]:.2f}m (<15m).")
    print(f" -> Evasion vectors calculated in {dt_ms:.4f} ms (< 50ms requirement met!).")
    print(f" -> Evasion vector TEST-A: {breach_map['TEST-A'][3]}")
    print(f" -> Evasion vector TEST-B: {breach_map['TEST-B'][3]}")

    print("\n[TEST 3] Testing FSM Fleet State Transitions...")
    fsm_service.register_drone("UAV-99", "Interceptor")
    ok, msg = fsm_service.handle_command("UAV-99", DroneCommandType.TAKEOFF)
    assert ok is True
    assert fsm_service.get_drone("UAV-99").fsm_state == DroneFSMState.TAKEOFF
    print(f" -> Command TAKEOFF success: {msg}")

    print("\nALL BACKEND CORE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_swarm_physics_and_collision()
