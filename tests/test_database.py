import sqlite3
import concurrent.futures
import pytest
from src.database.db import get_sync_connection, init_db
from src.database.seed import seed_database

def test_db_001_cascade_delete(test_db_path):
    """TEST-DB-001: Integridad referencial en cascada controlada."""
    with get_sync_connection(test_db_path) as conn:
        cursor = conn.cursor()

        # Insert a mission
        cursor.execute("""
            INSERT INTO missions (
                mission_code, priority_id, status_id, created_by_operator_id,
                origin_latitude, origin_longitude, origin_altitude_meters,
                dest_latitude, dest_longitude, dest_altitude_meters,
                scheduled_departure_time
            ) VALUES ('MSN-TEST-CASCADE', 1, 1, 1, -12.0, -77.0, 100.0, -12.1, -77.1, 100.0, '2026-09-11 12:00:00')
        """)
        mission_id = cursor.lastrowid

        # Insert supplies, assignments, trajectories, waypoints
        cursor.execute("INSERT INTO mission_supplies (mission_id, supply_id, quantity) VALUES (?, 1, 2)", (mission_id,))
        cursor.execute("INSERT INTO mission_assignments (mission_id, drone_id, swarm_role_id) VALUES (?, 4, 1)", (mission_id,))
        cursor.execute("""
            INSERT INTO trajectories (mission_id, drone_id, rl_model_version, total_distance_meters, estimated_duration_seconds)
            VALUES (?, 4, 'ares-v1', 1200.0, 100)
        """, (mission_id,))
        traj_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO waypoints (trajectory_id, sequence_order, latitude, longitude, altitude_meters, target_speed_mps, expected_timestamp_offset_ms)
            VALUES (?, 0, -12.0, -77.0, 100.0, 15.0, 0)
        """, (traj_id,))
        conn.commit()

        # Verify rows exist
        cursor.execute("SELECT COUNT(*) FROM mission_supplies WHERE mission_id = ?", (mission_id,))
        assert cursor.fetchone()[0] == 1
        cursor.execute("SELECT COUNT(*) FROM mission_assignments WHERE mission_id = ?", (mission_id,))
        assert cursor.fetchone()[0] == 1
        cursor.execute("SELECT COUNT(*) FROM trajectories WHERE mission_id = ?", (mission_id,))
        assert cursor.fetchone()[0] == 1
        cursor.execute("SELECT COUNT(*) FROM waypoints WHERE trajectory_id = ?", (traj_id,))
        assert cursor.fetchone()[0] == 1

        # Delete mission
        cursor.execute("DELETE FROM missions WHERE mission_id = ?", (mission_id,))
        conn.commit()

        # Verify cascaded deletion
        cursor.execute("SELECT COUNT(*) FROM mission_supplies WHERE mission_id = ?", (mission_id,))
        assert cursor.fetchone()[0] == 0
        cursor.execute("SELECT COUNT(*) FROM mission_assignments WHERE mission_id = ?", (mission_id,))
        assert cursor.fetchone()[0] == 0
        cursor.execute("SELECT COUNT(*) FROM trajectories WHERE mission_id = ?", (mission_id,))
        assert cursor.fetchone()[0] == 0
        cursor.execute("SELECT COUNT(*) FROM waypoints WHERE trajectory_id = ?", (traj_id,))
        assert cursor.fetchone()[0] == 0

def test_db_002_concurrent_telemetry_wal_mode(test_db_path):
    """TEST-DB-002: Ingesta concurrente de telemetría bajo SQLite WAL Mode (20 hilos paralelos)."""
    # Create test mission first
    with get_sync_connection(test_db_path) as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO missions (
                mission_code, priority_id, status_id, created_by_operator_id,
                origin_latitude, origin_longitude, origin_altitude_meters,
                dest_latitude, dest_longitude, dest_altitude_meters,
                scheduled_departure_time
            ) VALUES ('MSN-TEST-WAL-001', 1, 3, 1, -12.0, -77.0, 100.0, -12.1, -77.1, 100.0, '2026-09-11 12:00:00')
        """)
        mission_id = cur.lastrowid
        conn.commit()

    def worker_insert_telemetry(worker_id: int):
        conn = get_sync_connection(test_db_path)
        try:
            for i in range(10):
                conn.execute("""
                    INSERT INTO telemetry_logs (
                        drone_id, mission_id, current_latitude, current_longitude,
                        current_altitude_meters, current_speed_mps, battery_percentage,
                        signal_snr_db
                    ) VALUES (4, ?, ?, ?, 120.0, 15.0, 95.0, 30.0)
                """, (mission_id, -12.0 + worker_id*0.001, -77.0 + i*0.001))
                conn.commit()
                # Read concurrent query
                cur = conn.execute("SELECT status_id FROM missions WHERE mission_id = ?", (mission_id,))
                _ = cur.fetchone()
            return True
        finally:
            conn.close()

    # Run 20 concurrent threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(worker_insert_telemetry, i) for i in range(20)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    assert len(results) == 20
    assert all(results)

    # Verify total 200 telemetry entries inserted
    with get_sync_connection(test_db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM telemetry_logs WHERE mission_id = ?", (mission_id,))
        count = cur.fetchone()[0]
        assert count == 200
