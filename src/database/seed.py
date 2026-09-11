import hashlib
from src.database.db import get_sync_connection, init_db, DEFAULT_DB_PATH

def hash_password(password: str) -> str:
    """Hash password using sha256 as fallback or bcrypt if available."""
    try:
        from passlib.hash import bcrypt
        return bcrypt.hash(password)
    except Exception:
        # Fallback salt-based hash if passlib/bcrypt isn't ready yet
        return "sha256$" + hashlib.sha256(password.encode()).hexdigest()

def seed_database(db_path: str = DEFAULT_DB_PATH) -> None:
    init_db(db_path)
    with get_sync_connection(db_path) as conn:
        cursor = conn.cursor()

        # 1. Roles
        roles = [
            ('ADMIN', 'Administrador del sistema de comando'),
            ('TACTICAL_OPERATOR', 'Operador táctico de misiones de rescate'),
            ('OBSERVER', 'Observador y analista de telemetría')
        ]
        cursor.executemany("INSERT OR IGNORE INTO roles (code, description) VALUES (?, ?);", roles)

        # 2. Priority Levels
        priorities = [
            ('GOLDEN_HOUR_CRITICAL', 60),
            ('HIGH', 120),
            ('STANDARD', 240)
        ]
        cursor.executemany("INSERT OR IGNORE INTO mission_priority_levels (code, max_sla_minutes) VALUES (?, ?);", priorities)

        # 3. Mission Statuses
        mission_statuses = [
            ('DRAFT',),
            ('OPTIMIZING',),
            ('ACTIVE',),
            ('COMPLETED',),
            ('ABORTED',),
            ('FAILED',)
        ]
        cursor.executemany("INSERT OR IGNORE INTO mission_statuses (code) VALUES (?);", mission_statuses)

        # 4. Swarm Roles
        swarm_roles = [
            ('LEADER',),
            ('PAYLOAD_CARRIER',),
            ('COMM_RELAY',),
            ('SCOUT',)
        ]
        cursor.executemany("INSERT OR IGNORE INTO swarm_roles (code) VALUES (?);", swarm_roles)

        # 5. Drone Statuses
        drone_statuses = [
            ('IDLE',),
            ('ROUTING',),
            ('IN_FLIGHT',),
            ('RETURNING',),
            ('MAINTENANCE',),
            ('EMERGENCY',)
        ]
        cursor.executemany("INSERT OR IGNORE INTO drone_statuses (code) VALUES (?);", drone_statuses)

        # 6. Supply Categories
        categories = [
            ('BLOOD', 'Hemoderivados y Sangre', 1),
            ('SERUM', 'Sueros e Hidratación Intravenosa', 1),
            ('ANTIDOTE', 'Antídotos y Fármacos Sensibles', 1),
            ('SURGICAL', 'Material Quirúrgico y Trauma', 0)
        ]
        cursor.executemany("INSERT OR IGNORE INTO supply_categories (code, name, is_thermosensitive) VALUES (?, ?, ?);", categories)

        # 7. Medical Supplies
        supplies = [
            (1, 1, 'Sangre O Negativo (Paquete)', 350, 45),
            (2, 2, 'Suero Fisiológico 500ml', 500, 60),
            (3, 3, 'Antídoto Polivalente', 250, 30),
            (4, 4, 'Kit Quirúrgico Trauma', 600, 120),
            (5, 1, 'Muestra Termo Crítica', 200, 20)
        ]
        cursor.executemany("""
            INSERT OR IGNORE INTO medical_supplies (supply_id, category_id, name, unit_weight_grams, max_transit_minutes)
            VALUES (?, ?, ?, ?, ?);
        """, supplies)

        # 8. Drone Models
        models = [
            (1, 'ARES-X1-Heavy', 2000, 3600, 15000, 18.0),
            (2, 'ARES-S1-Scout', 1000, 4200, 12000, 22.0)
        ]
        cursor.executemany("""
            INSERT OR IGNORE INTO drone_models (model_id, model_name, max_payload_grams, max_flight_time_seconds, battery_capacity_mah, cruise_speed_mps)
            VALUES (?, ?, ?, ?, ?, ?);
        """, models)

        # 9. Operators
        # Query role ID for TACTICAL_OPERATOR
        cursor.execute("SELECT role_id FROM roles WHERE code = 'TACTICAL_OPERATOR'")
        tac_role_row = cursor.fetchone()
        tac_role_id = tac_role_row[0] if tac_role_row else 2

        pw_hash = hash_password("PasswordSeguro2026!")
        cursor.execute("""
            INSERT OR IGNORE INTO operators (operator_id, role_id, username, password_hash, full_name, is_active)
            VALUES (1, ?, 'operador_tactico', ?, 'Jhoao Didier Lopez Gonzales', 1);
        """, (tac_role_id, pw_hash))

        # Inactive operator for TEST-AUTH-003
        cursor.execute("""
            INSERT OR IGNORE INTO operators (operator_id, role_id, username, password_hash, full_name, is_active)
            VALUES (2, ?, 'operador_inactivo', ?, 'Operador Inactivo de Prueba', 0);
        """, (tac_role_id, pw_hash))

        # 10. Drones
        cursor.execute("SELECT status_id FROM drone_statuses WHERE code = 'IDLE'")
        idle_status_row = cursor.fetchone()
        idle_status_id = idle_status_row[0] if idle_status_row else 1

        drones = [
            (1, 2, idle_status_id, 'ARES-DRN-001', 'v1.4.0'),
            (4, 1, idle_status_id, 'ARES-DRN-004', 'v1.4.0'),
            (7, 2, idle_status_id, 'ARES-DRN-007', 'v1.4.0'),
        ]
        cursor.executemany("""
            INSERT OR IGNORE INTO drones (drone_id, model_id, status_id, serial_number, firmware_version)
            VALUES (?, ?, ?, ?, ?);
        """, drones)

        conn.commit()
    print("Database seeded successfully at:", db_path)

if __name__ == "__main__":
    seed_database()
