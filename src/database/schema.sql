PRAGMA foreign_keys = ON;

-- 1. Catálogo de Roles de Operadores
CREATE TABLE IF NOT EXISTS roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- 'ADMIN', 'TACTICAL_OPERATOR', 'OBSERVER'
    description TEXT NOT NULL
);

-- 2. Operadores del Centro de Comando Táctico
CREATE TABLE IF NOT EXISTS operators (
    operator_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT
);

-- 3. Categorías de Insumos Médicos
CREATE TABLE IF NOT EXISTS supply_categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- 'BLOOD', 'SERUM', 'ANTIDOTE', 'SURGICAL'
    name TEXT NOT NULL,
    is_thermosensitive INTEGER NOT NULL CHECK(is_thermosensitive IN (0, 1))
);

-- 4. Catálogo de Suministros Médicos de Emergencia
CREATE TABLE IF NOT EXISTS medical_supplies (
    supply_id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL UNIQUE,
    unit_weight_grams INTEGER NOT NULL CHECK(unit_weight_grams > 0),
    max_transit_minutes INTEGER NOT NULL CHECK(max_transit_minutes > 0),
    FOREIGN KEY (category_id) REFERENCES supply_categories(category_id) ON DELETE RESTRICT
);

-- 5. Modelos de Drones Homologados
CREATE TABLE IF NOT EXISTS drone_models (
    model_id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL UNIQUE,
    max_payload_grams INTEGER NOT NULL CHECK(max_payload_grams >= 1000), -- Supuesto: payload > 1 kg
    max_flight_time_seconds INTEGER NOT NULL CHECK(max_flight_time_seconds > 0),
    battery_capacity_mah INTEGER NOT NULL CHECK(battery_capacity_mah > 0),
    cruise_speed_mps REAL NOT NULL CHECK(cruise_speed_mps > 0.0)
);

-- 6. Estados de Ciclo de Vida del Dron
CREATE TABLE IF NOT EXISTS drone_statuses (
    status_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE           -- 'IDLE', 'ROUTING', 'IN_FLIGHT', 'RETURNING', 'MAINTENANCE', 'EMERGENCY'
);

-- 7. Flota de Drones
CREATE TABLE IF NOT EXISTS drones (
    drone_id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    status_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL UNIQUE,
    firmware_version TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    FOREIGN KEY (model_id) REFERENCES drone_models(model_id) ON DELETE RESTRICT,
    FOREIGN KEY (status_id) REFERENCES drone_statuses(status_id) ON DELETE RESTRICT
);

-- 8. Prioridades de Misión
CREATE TABLE IF NOT EXISTS mission_priority_levels (
    priority_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- 'GOLDEN_HOUR_CRITICAL', 'HIGH', 'STANDARD'
    max_sla_minutes INTEGER NOT NULL CHECK(max_sla_minutes > 0)
);

-- 9. Estados Operativos de la Misión
CREATE TABLE IF NOT EXISTS mission_statuses (
    status_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE           -- 'DRAFT', 'OPTIMIZING', 'ACTIVE', 'COMPLETED', 'ABORTED', 'FAILED'
);

-- 10. Misiones de Emergencia
CREATE TABLE IF NOT EXISTS missions (
    mission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_code TEXT NOT NULL UNIQUE,  -- Formato: 'MSN-YYYYMMDD-XXXX'
    priority_id INTEGER NOT NULL,
    status_id INTEGER NOT NULL,
    created_by_operator_id INTEGER NOT NULL,
    origin_latitude REAL NOT NULL CHECK(origin_latitude BETWEEN -90.0 AND 90.0),
    origin_longitude REAL NOT NULL CHECK(origin_longitude BETWEEN -180.0 AND 180.0),
    origin_altitude_meters REAL NOT NULL CHECK(origin_altitude_meters >= 0.0),
    dest_latitude REAL NOT NULL CHECK(dest_latitude BETWEEN -90.0 AND 90.0),
    dest_longitude REAL NOT NULL CHECK(dest_longitude BETWEEN -180.0 AND 180.0),
    dest_altitude_meters REAL NOT NULL CHECK(dest_altitude_meters >= 0.0),
    scheduled_departure_time TEXT NOT NULL,
    actual_start_time TEXT,
    actual_end_time TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    FOREIGN KEY (priority_id) REFERENCES mission_priority_levels(priority_id) ON DELETE RESTRICT,
    FOREIGN KEY (status_id) REFERENCES mission_statuses(status_id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by_operator_id) REFERENCES operators(operator_id) ON DELETE RESTRICT
);

-- 11. Carga Asignada por Misión (3NF: Misiones <-> Suministros)
CREATE TABLE IF NOT EXISTS mission_supplies (
    mission_id INTEGER NOT NULL,
    supply_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    PRIMARY KEY (mission_id, supply_id),
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE,
    FOREIGN KEY (supply_id) REFERENCES medical_supplies(supply_id) ON DELETE RESTRICT
);

-- 12. Roles Tácticos en el Enjambre
CREATE TABLE IF NOT EXISTS swarm_roles (
    swarm_role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE           -- 'LEADER', 'PAYLOAD_CARRIER', 'COMM_RELAY', 'SCOUT'
);

-- 13. Asignación de Unidades a la Misión (3NF: Misiones <-> Drones)
CREATE TABLE IF NOT EXISTS mission_assignments (
    mission_id INTEGER NOT NULL,
    drone_id INTEGER NOT NULL,
    swarm_role_id INTEGER NOT NULL,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    PRIMARY KEY (mission_id, drone_id),
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE,
    FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE RESTRICT,
    FOREIGN KEY (swarm_role_id) REFERENCES swarm_roles(swarm_role_id) ON DELETE RESTRICT
);

-- 14. Trayectorias 3D Calculadas por RL (PyTorch)
CREATE TABLE IF NOT EXISTS trajectories (
    trajectory_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER NOT NULL,
    drone_id INTEGER NOT NULL,
    rl_model_version TEXT NOT NULL,
    total_distance_meters REAL NOT NULL CHECK(total_distance_meters >= 0.0),
    estimated_duration_seconds INTEGER NOT NULL CHECK(estimated_duration_seconds >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    generated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE,
    FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE RESTRICT
);

-- 15. Waypoints Discretizados de la Trayectoria
CREATE TABLE IF NOT EXISTS waypoints (
    waypoint_id INTEGER PRIMARY KEY AUTOINCREMENT,
    trajectory_id INTEGER NOT NULL,
    sequence_order INTEGER NOT NULL CHECK(sequence_order >= 0),
    latitude REAL NOT NULL CHECK(latitude BETWEEN -90.0 AND 90.0),
    longitude REAL NOT NULL CHECK(longitude BETWEEN -180.0 AND 180.0),
    altitude_meters REAL NOT NULL CHECK(altitude_meters >= 0.0),
    target_speed_mps REAL NOT NULL CHECK(target_speed_mps >= 0.0),
    expected_timestamp_offset_ms INTEGER NOT NULL CHECK(expected_timestamp_offset_ms >= 0),
    UNIQUE (trajectory_id, sequence_order),
    FOREIGN KEY (trajectory_id) REFERENCES trajectories(trajectory_id) ON DELETE CASCADE
);

-- 16. Telemetría de la Flota en Tiempo Real
CREATE TABLE IF NOT EXISTS telemetry_logs (
    telemetry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_id INTEGER NOT NULL,
    mission_id INTEGER NOT NULL,
    current_latitude REAL NOT NULL,
    current_longitude REAL NOT NULL,
    current_altitude_meters REAL NOT NULL,
    current_speed_mps REAL NOT NULL,
    battery_percentage REAL NOT NULL CHECK(battery_percentage BETWEEN 0.0 AND 100.0),
    signal_snr_db REAL NOT NULL,
    timestamp_utc TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE
);

-- 17. Registro de Benchmark y Métricas de Simulación
CREATE TABLE IF NOT EXISTS simulation_runs (
    simulation_run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER NOT NULL,
    rl_model_checkpoint TEXT NOT NULL,
    total_obstacles_injected INTEGER NOT NULL CHECK(total_obstacles_injected >= 0),
    evaded_obstacles_count INTEGER NOT NULL CHECK(evaded_obstacles_count >= 0),
    collisions_count INTEGER NOT NULL CHECK(collisions_count >= 0),
    success_rate_percentage REAL NOT NULL CHECK(success_rate_percentage BETWEEN 0.0 AND 100.0),
    execution_time_ms INTEGER NOT NULL CHECK(execution_time_ms >= 0),
    executed_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE
);

-- 18. Registro de Obstáculos Dinámicos Simulados
CREATE TABLE IF NOT EXISTS dynamic_obstacles (
    obstacle_id INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_run_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude_meters REAL NOT NULL,
    radius_meters REAL NOT NULL CHECK(radius_meters > 0.0),
    velocity_x REAL NOT NULL,
    velocity_y REAL NOT NULL,
    velocity_z REAL NOT NULL,
    detected_at_ms INTEGER NOT NULL,
    FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(simulation_run_id) ON DELETE CASCADE
);

-- Índices Operativos
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status_id);
CREATE INDEX IF NOT EXISTS idx_drones_status ON drones(status_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_seq ON waypoints(trajectory_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_telemetry_drone_time ON telemetry_logs(drone_id, timestamp_utc);
