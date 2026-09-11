# SPECIFICATION DOCUMENT: ARES (Autonomous Rescue Emergency System)

**Feature Branch:** `specs/001-ares-system-core/spec.md`

**Proyecto:** ARES - Autonomous Rescue Emergency System (D-RDG)

**Líder Técnico / Arquitecto de IA:** Jhoao Didier Lopez Gonzales

**Estado:** APPROVED

**Versión:** 1.0.0-MVP

---

## 1. Objetivo

### 1.1. Contexto y Justificación del Negocio

En situaciones de catástrofe natural o colapso de infraestructura civil, las vías terrestres quedan inhabilitadas, bloqueando el suministro de insumos médicos esenciales (sangre, sueros, antídotos) y la localización oportuna de heridos en escombros durante los primeros 60 minutos (la "Hora Dorada"). La aviación tripulada convencional presenta costos prohibitivos y tiempos de despliegue lentos, mientras que los drones comerciales actuales dependen de un pilotaje manual individual (relación 1:1), careciendo de escalabilidad en emergencias masivas.

ARES resuelve esta problemática mediante una plataforma centralizada de gestión de flotas y orquestación autónoma de enjambres de drones asistida por Aprendizaje por Refuerzo (RL), proyectando una reducción del 75% en costos operativos frente a medios aéreos tradicionales. El sistema opera bajo una arquitectura de computación en el borde (*Edge Computing*), ejecutando toda la inferencia y almacenamiento en hardware local para garantizar operatividad continua y latencia ultra baja incluso ante la caída total de redes de telecomunicaciones e Internet.

### 1.2. Alcance del MVP (Horizonte: 16 semanas)

* **In-Scope:**
* Centro de Comando Operativo y panel táctico local (PHP / JavaScript / HTML5) para control geoespacial de misiones.


* Motor de optimización de trayectorias 3D y evasión dinámica de obstáculos en tiempo real implementado en PyTorch (Python).


* Persistencia relacional de alta velocidad en base de datos local SQLite configurada en modo WAL (*Write-Ahead Logging*).


* Módulo de despacho con balanceo de carga útil (*payload*) y cumplimiento estricto del SLA de 60 minutos de la Hora Dorada.


* Entorno de simulación por software para benchmarking y validación algorítmica.




* **Out-of-Scope:**
* Control de telemetría de radiofrecuencia sobre hardware físico de drones (restringido a simulación en esta fase).


* Transmisión de vídeo en alta definición (únicamente telemetría posicional y de estado).
* Conectividad o sincronización con servicios en la nube pública.





### 1.3. Criterios de Éxito Técnico

1. Alcanzar una tasa de éxito superior al 95% en la evasión autónoma de obstáculos dinámicos en entorno de simulación 3D mediante PyTorch.


2. Latencia de recálculo de trayectoria local en el borde inferior a 50 ms ante colisiones inminentes.


3. Operatividad completa del panel táctico y base de datos en entorno local aislado sin acceso a Internet.



---

## 2. Esquema de Datos (Tercera Forma Normal - 3NF)

El modelo de datos relacional opera sobre SQLite local. Cumple de forma estricta con la **Tercera Forma Normal (3NF)**: todos los atributos no-clave dependen exclusivamente de su clave primaria de manera directa (eliminación total de dependencias funcionales parciales y transitivas).

### 2.1. Diagrama de Relaciones Lógicas

```
[ROLES] 1───N [OPERATORS] 1───N [MISSIONS] 1───N [MISSION_SUPPLIES] N───1 [MEDICAL_SUPPLIES]
                                    │                                              │
                                    │ 1───N [MISSION_ASSIGNMENTS] N───1            N───1 [SUPPLY_CATEGORIES]
                                    │               │              [DRONES]
                                    │               │                 │
                                    │               │                 ├───N───1 [DRONE_MODELS]
                                    │               │                 └───N───1 [DRONE_STATUSES]
                                    │               └───N───1 [SWARM_ROLES]
                                    │
                                    ├───1───N [TRAJECTORIES] 1───N [WAYPOINTS]
                                    │
                                    ├───1───N [SIMULATION_RUNS] 1───N [DYNAMIC_OBSTACLES]
                                    │
                                    └───1───N [TELEMETRY_LOGS]

```

### 2.2. Definición DDL Formal

```sql
PRAGMA foreign_keys = ON;

-- 1. Catálogo de Roles de Operadores
CREATE TABLE roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- 'ADMIN', 'TACTICAL_OPERATOR', 'OBSERVER'
    description TEXT NOT NULL
);

-- 2. Operadores del Centro de Comando Táctico
CREATE TABLE operators (
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
CREATE TABLE supply_categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- 'BLOOD', 'SERUM', 'ANTIDOTE', 'SURGICAL'
    name TEXT NOT NULL,
    is_thermosensitive INTEGER NOT NULL CHECK(is_thermosensitive IN (0, 1))
);

-- 4. Catálogo de Suministros Médicos de Emergencia
CREATE TABLE medical_supplies (
    supply_id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL UNIQUE,
    unit_weight_grams INTEGER NOT NULL CHECK(unit_weight_grams > 0),
    max_transit_minutes INTEGER NOT NULL CHECK(max_transit_minutes > 0),
    FOREIGN KEY (category_id) REFERENCES supply_categories(category_id) ON DELETE RESTRICT
);

-- 5. Modelos de Drones Homologados
CREATE TABLE drone_models (
    model_id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL UNIQUE,
    max_payload_grams INTEGER NOT NULL CHECK(max_payload_grams >= 1000), -- Supuesto: payload > 1 kg
    max_flight_time_seconds INTEGER NOT NULL CHECK(max_flight_time_seconds > 0),
    battery_capacity_mah INTEGER NOT NULL CHECK(battery_capacity_mah > 0),
    cruise_speed_mps REAL NOT NULL CHECK(cruise_speed_mps > 0.0)
);

-- 6. Estados de Ciclo de Vida del Dron
CREATE TABLE drone_statuses (
    status_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE           -- 'IDLE', 'ROUTING', 'IN_FLIGHT', 'RETURNING', 'MAINTENANCE', 'EMERGENCY'
);

-- 7. Flota de Drones
CREATE TABLE drones (
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
CREATE TABLE mission_priority_levels (
    priority_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- 'GOLDEN_HOUR_CRITICAL', 'HIGH', 'STANDARD'
    max_sla_minutes INTEGER NOT NULL CHECK(max_sla_minutes > 0)
);

-- 9. Estados Operativos de la Misión
CREATE TABLE mission_statuses (
    status_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE           -- 'DRAFT', 'OPTIMIZING', 'ACTIVE', 'COMPLETED', 'ABORTED', 'FAILED'
);

-- 10. Misiones de Emergencia
CREATE TABLE missions (
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
CREATE TABLE mission_supplies (
    mission_id INTEGER NOT NULL,
    supply_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    PRIMARY KEY (mission_id, supply_id),
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE,
    FOREIGN KEY (supply_id) REFERENCES medical_supplies(supply_id) ON DELETE RESTRICT
);

-- 12. Roles Tácticos en el Enjambre
CREATE TABLE swarm_roles (
    swarm_role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE           -- 'LEADER', 'PAYLOAD_CARRIER', 'COMM_RELAY', 'SCOUT'
);

-- 13. Asignación de Unidades a la Misión (3NF: Misiones <-> Drones)
CREATE TABLE mission_assignments (
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
CREATE TABLE trajectories (
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
CREATE TABLE waypoints (
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
CREATE TABLE telemetry_logs (
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
CREATE TABLE simulation_runs (
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
CREATE TABLE dynamic_obstacles (
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
CREATE INDEX idx_missions_status ON missions(status_id);
CREATE INDEX idx_drones_status ON drones(status_id);
CREATE INDEX idx_waypoints_seq ON waypoints(trajectory_id, sequence_order);
CREATE INDEX idx_telemetry_drone_time ON telemetry_logs(drone_id, timestamp_utc);

```

---

## 3. Endpoints (Contratos de API REST)

* **Prefijo base:** `/api/v1`
* **Protocolo de transporte:** HTTP/1.1 sobre red local (Edge)
* **Formato:** `application/json`
* **Autenticación:** Cabecera `Authorization: Bearer <TOKEN>` (JWT con algoritmo HS256 verificado localmente)
* **Estructura estándar de error:**

```json
{
  "error": {
    "code": "STRING_IDENTIFIER",
    "message": "Descripción clara del fallo",
    "details": {}
  }
}

```

---

### 3.1. Autenticación y Control de Operadores

#### `POST /api/v1/auth/login`

Autentica al operador táctico en la consola local.

* **Headers:** `Content-Type: application/json`
* **Request Body:**

```json
{
  "username": "operador_tactico",
  "password": "PasswordSeguro2026!"
}

```

* **Response `200 OK`:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.k7...",
  "token_type": "Bearer",
  "expires_in_seconds": 28800,
  "operator": {
    "operator_id": 1,
    "username": "operador_tactico",
    "full_name": "Jhoao Didier Lopez Gonzales",
    "role": "TACTICAL_OPERATOR"
  }
}

```

* **Errores:**
* `400 Bad Request`: Formato JSON inválido o parámetros faltantes.
* `401 Unauthorized`: `{"error": {"code": "INVALID_CREDENTIALS", "message": "Credenciales inválidas"}}`
* `403 Forbidden`: `{"error": {"code": "USER_DISABLED", "message": "El operador se encuentra inactivo"}}`



---

### 3.2. Gestión de Misiones Médicas

#### `POST /api/v1/missions`

Crea una nueva orden de misión de emergencia médica.

* **Headers:** `Authorization: Bearer <TOKEN>`, `Content-Type: application/json`
* **Request Body:**

```json
{
  "priority_code": "GOLDEN_HOUR_CRITICAL",
  "origin": {
    "latitude": -12.046374,
    "longitude": -77.042793,
    "altitude_meters": 150.0
  },
  "destination": {
    "latitude": -12.056500,
    "longitude": -77.084400,
    "altitude_meters": 120.0
  },
  "scheduled_departure_time": "2026-09-11T16:45:00Z",
  "supplies": [
    {
      "supply_id": 1,
      "quantity": 2
    },
    {
      "supply_id": 3,
      "quantity": 1
    }
  ]
}

```

* **Response `201 Created`:**

```json
{
  "mission_id": 101,
  "mission_code": "MSN-20260911-0101",
  "status": "DRAFT",
  "priority_code": "GOLDEN_HOUR_CRITICAL",
  "max_sla_minutes": 60,
  "total_cargo_weight_grams": 950,
  "created_at": "2026-09-11T16:35:10Z"
}

```

* **Errores:**
* `400 Bad Request`: `{"error": {"code": "INVALID_SUPPLY", "message": "Uno o más IDs de insumos no existen"}}`
* `401 Unauthorized`: Token no provisto o expirado.
* `422 Unprocessable Entity`: Coordenadas geográficas fuera de rango [-90, 90] o [-180, 180].



#### `GET /api/v1/missions/{id}`

Obtiene el detalle completo del estado, insumos y unidades asignadas de una misión.

* **Headers:** `Authorization: Bearer <TOKEN>`
* **Response `200 OK`:**

```json
{
  "mission_id": 101,
  "mission_code": "MSN-20260911-0101",
  "status": "ACTIVE",
  "priority": "GOLDEN_HOUR_CRITICAL",
  "origin": { "latitude": -12.046374, "longitude": -77.042793, "altitude_meters": 150.0 },
  "destination": { "latitude": -12.056500, "longitude": -77.084400, "altitude_meters": 120.0 },
  "cargo": [
    { "name": "Sangre O Negativo (Paquete)", "unit_weight_grams": 350, "quantity": 2 },
    { "name": "Antídoto Polivalente", "unit_weight_grams": 250, "quantity": 1 }
  ],
  "assignments": [
    { "drone_id": 4, "serial_number": "ARES-DRN-004", "swarm_role": "PAYLOAD_CARRIER" },
    { "drone_id": 7, "serial_number": "ARES-DRN-007", "swarm_role": "COMM_RELAY" }
  ]
}

```

* **Errores:**
* `404 Not Found`: `{"error": {"code": "MISSION_NOT_FOUND", "message": "Misión solicitada no existe"}}`



---

### 3.3. Optimización de Rutas e Inferencia RL (PyTorch)

#### `POST /api/v1/missions/{id}/route/calculate`

Invoca al motor de Aprendizaje por Refuerzo para calcular las trayectorias 3D libres de colisión.

* **Headers:** `Authorization: Bearer <TOKEN>`, `Content-Type: application/json`
* **Request Body:**

```json
{
  "required_swarm_size": 2,
  "dynamic_obstacle_simulation": true,
  "environmental_factors": {
    "wind_vector_mps": [2.1, -1.0, 0.0],
    "no_fly_zones": [
      {
        "latitude": -12.0510,
        "longitude": -77.0620,
        "radius_meters": 150.0,
        "ceiling_meters": 200.0
      }
    ]
  }
}

```

* **Response `200 OK`:**

```json
{
  "mission_id": 101,
  "rl_model_version": "ares-rl-ppo-v1.4",
  "computation_latency_ms": 32.8,
  "routes": [
    {
      "drone_id": 4,
      "swarm_role": "PAYLOAD_CARRIER",
      "trajectory_id": 204,
      "total_distance_meters": 4820.0,
      "estimated_flight_seconds": 385,
      "waypoints_generated": 64
    },
    {
      "drone_id": 7,
      "swarm_role": "COMM_RELAY",
      "trajectory_id": 205,
      "total_distance_meters": 3600.0,
      "estimated_flight_seconds": 310,
      "waypoints_generated": 40
    }
  ]
}

```

* **Errores:**
* `409 Conflict`: `{"error": {"code": "INSUFFICIENT_FLEET", "message": "No hay drones IDLE con payload suficiente"}}`
* `422 Unprocessable Entity`: `{"error": {"code": "GOLDEN_HOUR_EXCEEDED", "message": "Tiempo estimado de vuelo supera la ventana de 60 minutos"}}`
* `503 Service Unavailable`: Falla en el worker de inferencia PyTorch.



#### `POST /api/v1/missions/{id}/dispatch`

Confirma la ruta calculada, cambia el estado a `ACTIVE` e inicia el plan de vuelo.

* **Headers:** `Authorization: Bearer <TOKEN>`
* **Response `200 OK`:**

```json
{
  "mission_id": 101,
  "status": "ACTIVE",
  "dispatched_at": "2026-09-11T16:45:02Z",
  "drones_dispatched": [4, 7]
}

```

* **Errores:**
* `409 Conflict`: `{"error": {"code": "INVALID_STATE", "message": "La misión requiere cálculo previo de ruta"}}`



---

### 3.4. Telemetría y Monitoreo en el Borde

#### `POST /api/v1/telemetry/ingest`

Ingesta paquetes de telemetría de posición, velocidad y batería de los drones.

* **Headers:** `Authorization: Bearer <TOKEN>`, `Content-Type: application/json`
* **Request Body:**

```json
{
  "drone_id": 4,
  "mission_id": 101,
  "current_latitude": -12.048910,
  "current_longitude": -77.049500,
  "current_altitude_meters": 142.5,
  "current_speed_mps": 14.8,
  "battery_percentage": 91.2,
  "signal_snr_db": 28.5,
  "timestamp_utc": "2026-09-11T16:46:15Z"
}

```

* **Response `202 Accepted`:**

```json
{
  "status": "RECORDED",
  "collision_alert": false
}

```

---

### 3.5. Simulación y Benchmark Algorítmico

#### `POST /api/v1/simulations/benchmark`

Ejecuta la batería de pruebas de evasión dinámica en simulación para certificar el criterio del charter (> 95% de éxito).

* **Headers:** `Authorization: Bearer <TOKEN>`, `Content-Type: application/json`
* **Request Body:**

```json
{
  "mission_id": 101,
  "total_obstacles_injected": 500,
  "obstacle_speed_range_mps": [2.0, 12.0],
  "obstacle_radius_meters": 4.0
}

```

* **Response `200 OK`:**

```json
{
  "simulation_run_id": 88,
  "mission_id": 101,
  "rl_model_checkpoint": "model_epoch_200_edge.pt",
  "total_obstacles_injected": 500,
  "evaded_obstacles_count": 484,
  "collisions_count": 16,
  "success_rate_percentage": 96.8,
  "charter_threshold_percentage": 95.0,
  "charter_criterion_met": true,
  "avg_recalculation_latency_ms": 18.6
}

```

---

## 4. Lógica de Negocio y Reglas Arquitectónicas

### 4.1. Invariantes de Dominio

1. **Restricción Estricta de la "Hora Dorada":**


Toda misión clasificada como `GOLDEN_HOUR_CRITICAL` impone una ventana temporal máxima de 60 minutos desde la creación hasta la entrega efectiva:



$$t_{\text{planificación}} + t_{\text{vuelo\_estimado}} \le 3600\text{ segundos}$$



Si el algoritmo no encuentra un vector que garantice este SLA, el sistema rechaza el plan y alerta al operador para redistribuir puntos de despegue.
2. **Capacidad de Carga Útil (Payload) con Margen Aerodinámico:**


Para cada dron asignado con rol `PAYLOAD_CARRIER`, el peso de los insumos no debe exceder el 90% de su capacidad nominal máxima homologada:

$$\sum_{i=1}^{n} (\text{unit\_weight\_grams}_i \times \text{quantity}_i) \le 0.90 \times \text{max\_payload\_grams}$$



El 10% restante está reservado como margen aerodinámico de estabilidad ante ráfagas de viento. La flota base contempla aeronaves con capacidad de carga útil superior a 1 kg (1000 gramos).


3. **Autonomía Energética de Seguridad (Reserva RTH):**
El consumo de batería estimado para el trayecto de ida y vuelta no puede superar el 70% de la capacidad nominal. El 30% restante se mantiene como reserva obligatoria para maniobras de evasión dinámica de obstáculos y retorno seguro al punto base.
4. **Caducidad Térmica de Suministros Críticos:**
Para insumos con `is_thermosensitive = 1` (sangre, sueros, antídotos), el tiempo de vuelo estimado $t_{\text{vuelo\_estimado}}$ en segundos debe satisfacer:



$$t_{\text{vuelo\_estimado}} \le (\text{max\_transit\_minutes} \times 60)$$


5. **Burbuja de Seguridad 3D y Evasión Dinámica:**
Cada dron mantiene una esfera virtual de protección con radio $R_{\text{burbuja}} = 15$ metros. Todo obstáculo móvil cuya trayectoria proyectada intercepte esta burbuja en un tiempo $t \le 5$ segundos dispara un vector reactivo de evasión generado por el modelo RL en menos de 50 ms.



### 4.2. Máquinas de Estados Finitas (FSM)

#### Ciclo de Vida de la Misión (`missions.status_id`)

```
  [DRAFT] ───(Cálculo de trayectorias RL)───> [OPTIMIZING]
     │                                             │
     │ (Falla / Sin recursos)                      │ (Ruta calculada con éxito)
     v                                             v
 [FAILED] <───────────────────────────────── [ACTIVE]
                                                   │
                                                   ├───(Misión abortada manualmente)───> [ABORTED]
                                                   │
                                                   └───(Insumos entregados)────────────> [COMPLETED]

```

#### Ciclo de Vida de la Flota de Drones (`drones.status_id`)

```
  [IDLE] ───(Asignado a misión)───> [ROUTING] ───(Despegue)───> [IN_FLIGHT]
    ^                                                               │
    │                                                               ├───(Colisión / Falla)───> [EMERGENCY]
    │                                                               │
    │                                                               └───(Entrega lista)──────> [RETURNING]
    │                                                                                             │
    └──────────(Diagnóstico y batería recargada)──────── [MAINTENANCE] <──────────────────────────┘

```

---

## 5. Suite de Tests Necesaria

Matriz de pruebas obligatoria diseñada bajo el principio *Test-First* (ninguna implementación debe comenzar hasta que estas pruebas existan y fallen en la fase roja):

### 5.1. Pruebas de Autenticación y Autorización (Security Contracts)

* **TEST-AUTH-001: Autenticación exitosa de operador activo**
* **Given:** Un operador registrado con `is_active = 1` y hash de contraseña válido en SQLite.


* **When:** Se envía `POST /api/v1/auth/login` con credenciales legítimas.
* **Then:** Retorna `200 OK`, token JWT con claim de expiración y datos del operador con su rol táctico.


* **TEST-AUTH-002: Rechazo de credenciales incorrectas**
* **Given:** Un operador existente en la base de datos local.
* **When:** Se envía `POST /api/v1/auth/login` con contraseña equivocada.
* **Then:** Retorna `401 Unauthorized` con código de error `INVALID_CREDENTIALS`.


* **TEST-AUTH-003: Bloqueo de operadores inactivos**
* **Given:** Un registro de operador con `is_active = 0`.
* **When:** Se intenta el inicio de sesión con las credenciales correctas.
* **Then:** Retorna `403 Forbidden` con código de error `USER_DISABLED`.


* **TEST-AUTH-004: Protección de rutas autenticadas**
* **Given:** Cualquier endpoint bajo `/api/v1/missions`.
* **When:** Se efectúa una llamada HTTP sin cabecera `Authorization` o con un token alterado/expirado.
* **Then:** Retorna `401 Unauthorized`.



---

### 5.2. Pruebas de Dominio y Lógica de Negocio (Integration & Domain)

* **TEST-DOM-001: Registro y cálculo de peso de insumos médicos**
* **Given:** Insumos existentes en catálogo con pesos de 350g y 250g.


* **When:** Se crea una misión vía `POST /api/v1/missions` con 2 unidades del primero y 1 del segundo.
* **Then:** Retorna `201 Created`, estado `DRAFT`, y valida que `total_cargo_weight_grams` sea exactamente 950g.


* **TEST-DOM-002: Bloqueo por sobrecarga de peso de carga útil (> 90% límite)**

* **Given:** Drones homologados con `max_payload_grams = 1000` (límite operativo neto: 900g).


* **When:** Se intenta despachar una misión con carga de 950g asignada a un único dron.
* **Then:** La API rechaza el despacho con código `409 Conflict` y código de error `INSUFFICIENT_FLEET` o exige asignar unidades adicionales.


* **TEST-DOM-003: Cumplimiento del SLA de la Hora Dorada**

* **Given:** Una misión configurada con prioridad `GOLDEN_HOUR_CRITICAL`.


* **When:** La simulación de vuelo arroja un tiempo de trayectoria estimado de 65 minutos.


* **Then:** La solicitud `POST /api/v1/missions/{id}/route/calculate` rechaza la ruta con código `422 Unprocessable Entity` y código `GOLDEN_HOUR_EXCEEDED`.




* **TEST-DOM-004: Invariante de insumo termosensible**

* **Given:** Un insumo clasificado en `supply_categories` como `is_thermosensitive = 1` y `max_transit_minutes = 20`.


* **When:** La ruta calculada estima una duración de vuelo de 25 minutos.
* **Then:** El sistema emite error de inviabilidad térmica impidiendo el despacho de la misión.


* **TEST-DOM-005: Transición de estados en FSM**
* **Given:** Una misión en estado `ACTIVE`.
* **When:** Un cliente invoca nuevamente el endpoint `POST /api/v1/missions/{id}/dispatch`.
* **Then:** Retorna `409 Conflict` con mensaje de transición de estado inválida.



---

### 5.3. Pruebas de Integridad Relacional en 3NF y Concurrencia SQLite

* **TEST-DB-001: Integridad referencial en cascada controlada**
* **Given:** Una misión con registros hijos en `mission_supplies`, `mission_assignments` y `trajectories`.
* **When:** Se elimina la misión directamente en la base de datos con `PRAGMA foreign_keys = ON;`.
* **Then:** Todos los registros relacionados en las tablas hijas se eliminan en cascada sin dejar huérfanos ni generar bloqueos.


* **TEST-DB-002: Ingesta concurrente de telemetría bajo SQLite WAL Mode**

* **Given:** La base de datos SQLite operando con `PRAGMA journal_mode = WAL;`.


* **When:** Se ejecutan 20 hilos paralelos registrando telemetría continua en `telemetry_logs` mientras se consulta el estado de las misiones.
* **Then:** Ninguna operación arroja error de bloqueo `SQLITE_BUSY` y el 100% de las filas se persisten consistentemente.



---

### 5.4. Pruebas de Algoritmo de IA y Evasión Dinámica (Charter Benchmarking)

* **TEST-AI-001: Tasa de éxito de evasión dinámica en simulación (> 95%)**

* **Given:** El modelo PyTorch cargado localmente y un entorno de simulación 3D con 500 obstáculos dinámicos inyectados.


* **When:** Se ejecuta `POST /api/v1/simulations/benchmark`.


* **Then:** El número total de colisiones registradas es $\le 25$, certificando que la métrica de éxito es $\ge 95.0\%$, retornando `charter_criterion_met: true`.




* **TEST-AI-002: Latencia de recálculo reactivo en el Edge (< 50 ms)**

* **Given:** Un dron simulado en trayectoria con detección súbita de obstáculo a 15 metros.
* **When:** Se mide el tiempo transcurrido desde la detección del objeto hasta la actualización del nuevo waypoint de evasión en memoria.
* **Then:** La latencia total del ciclo de inferencia es estrictamente inferior a 50 ms sin realizar consultas externas de red.

