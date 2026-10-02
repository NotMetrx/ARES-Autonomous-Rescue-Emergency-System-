# Project: ARES (Autonomous Rescue Emergency System)

## Architecture
ARES is an Edge Computing platform implemented in pure Python for autonomous rescue drone fleet orchestration during the Golden Hour (< 60 min).
- **Core Database Layer (`src/database/`)**: SQLite in strict 3NF with WAL mode (`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`), connection pooling, thread-safe concurrent writes, and cascade deletions across 18 relational tables.
- **Domain & Invariant Engine (`src/core/`)**: Validates the 5 critical mission invariants: Golden Hour SLA (t <= 3600s), Payload limits (<= 90% drone nominal capacity), Battery RTH reserve (>= 30%), Thermal decay thresholds for perishable medical supplies, and strict FSM state transitions for both missions and drones.
- **Tactical REST API Layer (`src/api/`)**: FastAPI application providing JWT (HS256) operator authentication, mission planning, drone dispatching, real-time edge telemetry ingestion, offline HTML5 tactical dashboard, and OpenAPI documentation.
- **AI & Perception Engine (`src/ai/`)**: Modular PyTorch D-FINE object detection pipeline, 3D pinhole camera spatial projection, 6-state 3D Kalman filter tracking, analytical Closest Point of Approach (CPA) 3D reactive evasion (< 50ms recalculation latency), and 500-obstacle Monte Carlo simulation benchmark (>= 95% evasion success rate).

```
[Operators] ──(JWT HS256)──> [FastAPI REST API /api/v1] ───> [Tactical Dashboard (/)]
                                   │              │
                                   ▼              ▼
                     [Domain Invariants & FSM]  [SQLite 3NF WAL Database]
                                   │                    (18 Tables)
                                   ▼
                       [AI & Perception Engine]
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
             [PyTorch / D-FINE]        [3D Reactive Evasion Engine]
          (Object Detection Head)      (CPA Threat Detection < 50ms)
                    │                             ▲
                    ▼                             │
            [Spatial Projection] ──> [Kalman Filter]
```

## Feature Inventory
Every feature identified during the survey phase is assigned to a specific milestone.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Operator Authentication | Authenticates operators via credentials and issues HS256 JWT (8h expiry). | M3 | survey / spec §3.1 |
| 2 | Bearer Token Validation Dependency | Validates Bearer tokens and extracts operator context for protected routes. | M3 | survey / spec §3.1 |
| 3 | Mission Creation | Creates emergency mission order, validates supplies, calculates cargo weight. | M3 | survey / spec §3.2 |
| 4 | Mission Query | Fetches complete mission status, origin/destination, cargo, and assignments. | M3 | survey / spec §3.2 |
| 5 | 3D Trajectory Calculation | Discretizes 3D route waypoints, applies wind compensation, validates invariants. | M3 | survey / spec §3.3 |
| 6 | Mission Dispatch | Transitions mission to ACTIVE and drone units to IN_FLIGHT. | M3 | survey / spec §3.3 |
| 7 | Edge Telemetry Ingestion | Ingests real-time drone telemetry and flags collision alerts. | M3 | survey / spec §3.4 |
| 8 | Evasion Benchmark Simulation | Simulates 500 dynamic obstacles against reactive evasion engine (>=95% success). | M4 | survey / spec §3.5 |
| 9 | Tactical Command Web Dashboard | Embedded offline HTML5/CSS tactical command console at `/`. | M3 | survey / spec §1.2 |
| 10 | Health Check Endpoint | Lightweight health probe verifying system status and SQLite WAL mode at `/health`. | M3 | survey / spec §1.2 |
| 11 | Swagger UI OpenAPI Documentation | Interactive API exploration and client generation interface at `/docs`. | M3 | survey / spec §3 |
| 12 | Foreign Key & WAL PRAGMA Enforcement | SQLite connection management with `foreign_keys = ON` and `journal_mode = WAL`. | M1 | survey / spec §2.2 |
| 13 | Default Tactical Catalogs & Fixtures | Pre-seeds roles, priorities, statuses, categories, medical supplies, drone fleet. | M1 | survey / spec §2.2 |
| 14 | 3D Discretized Waypoint Generation | Haversine distance, altitude profile, climb/cruise/descent waypoint calculation. | M4 | survey / spec §2.2 |
| 15 | Reactive 3D Evasion Engine | Analytical Closest Point of Approach (CPA) 3D repulsion vector (<50ms). | M4 | survey / spec §4.1 |
| 16 | Golden Hour SLA Validator | Invariant check: planning + flight time <= 3600s. | M2 | survey / spec §4.1 |
| 17 | Payload Overload Validator | Invariant check: total cargo weight <= 90% of drone max payload capacity. | M2 | survey / spec §4.1 |
| 18 | Thermal Sensitivity Validator | Invariant check: flight time <= max_transit_minutes * 60 for perishable supplies. | M2 | survey / spec §4.1 |
| 19 | Battery Safety Reserve Validator | Invariant check: estimated battery consumption <= 70% (>= 30% RTH reserve). | M2 | survey / spec §4.1 |
| 20 | Finite State Machine Transitions | Governs state transitions for missions and drones with strict validation. | M2 | survey / spec §4.2 |
| 21 | PyTorch D-FINE Detection Head | Neural object detection head with Fine-grained Distribution Refinement (FDR). | M4 | survey / ORIGINAL_REQUEST |
| 22 | 3D Spatial Projection Interface | Pinhole camera back-projection transforming 2D detections into 3D obstacle coords. | M4 | survey / ORIGINAL_REQUEST |
| 23 | 3D Kinematic Kalman Filter | 6-state Kalman filter estimating obstacle positions and velocities under noise. | M4 | survey / ORIGINAL_REQUEST |
| 24 | Vision-Evasion Pipeline Integration | End-to-end perception to evasion pipeline operating within <50ms budget. | M4 | survey / ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Persistence (R2) | 18 3NF tables, SQLite WAL mode, foreign keys, cascade deletes, concurrency. | None | DONE |
| M2 | Domain Logic & Invariants (R4) | Golden Hour, Payload, Thermal decay, Battery RTH, FSM state machines. | M1 | DONE |
| M3 | Tactical REST API (R1) | FastAPI, JWT HS256 auth, missions, telemetry, offline dashboard. | M1, M2 | DONE |
| M4 | AI Engine & Vision Pipeline (R3) | PyTorch D-FINE perception, 3D projection, Kalman tracking, evasion integration. | M1, M2 | IN_PROGRESS |
| M5 | Dual Track E2E Validation & Final Gate | 4-tier E2E test suite (Tiers 1-4), 13/13 test pass, Tier 5 adversarial hardening. | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### `src/database/db.py` ↔ Application Services
- `get_db_connection(db_path: Optional[str]) -> sqlite3.Connection`:
  - Returns connection with row_factory=sqlite3.Row, foreign_keys=ON, journal_mode=WAL, busy_timeout=5000.
- `get_async_db_connection(db_path: Optional[str]) -> aiosqlite.Connection`:
  - Async context manager yielding aiosqlite connection with identical PRAGMAs.

### `src/core/rules.py` ↔ Route Calculation (`src/api/routes.py`)
- `validate_golden_hour(estimated_duration_seconds: float, planning_time_seconds: float = 0.0) -> None`:
  - Raises `DomainValidationError("GOLDEN_HOUR_EXCEEDED")` if total > 3600.
- `validate_payload_capacity(total_cargo_weight_grams: int, max_payload_grams: int) -> None`:
  - Raises `DomainValidationError("INSUFFICIENT_FLEET")` if cargo > 0.90 * max_payload.
- `validate_thermal_sensitivity(flight_time_seconds: float, max_transit_minutes: int, item_name: str) -> None`:
  - Raises `DomainValidationError("THERMAL_DECAY_EXCEEDED")` if flight_time > max_transit_minutes * 60.
- `validate_battery_reserve(estimated_consumption_pct: float) -> None`:
  - Raises `DomainValidationError("BATTERY_RESERVE_VIOLATION")` if consumption > 70.0%.

### `src/core/fsm.py` ↔ Mission/Drone Controllers
- `validate_mission_transition(current: str, target: str) -> bool`:
  - Valid transitions: DRAFT -> OPTIMIZING -> ACTIVE -> COMPLETED / ABORTED; DRAFT/OPTIMIZING -> FAILED.
- `validate_drone_transition(current: str, target: str) -> bool`:
  - Valid transitions: IDLE -> ROUTING -> IN_FLIGHT -> RETURNING -> MAINTENANCE -> IDLE; IN_FLIGHT -> EMERGENCY.

### `src/ai/dfine.py` & `src/ai/vision.py` ↔ `src/ai/evasion.py`
- `DFINEDetector.detect(frame: np.ndarray) -> List[DetectionResult]`:
  - Inputs: RGB/BGR image frame (H x W x 3).
  - Outputs: List of `DetectionResult(bbox_2d, confidence, class_name)`.
  - Latency target: <= 30ms on CPU.
- `SpatialProjector.project_to_3d(detection: DetectionResult, depth_estimate: float) -> np.ndarray`:
  - Outputs: 3D position vector `[x, y, z]` in drone body/local frame.
- `KalmanFilter3D.predict_and_update(measurement: np.ndarray, dt: float) -> Tuple[np.ndarray, np.ndarray]`:
  - Outputs: `(estimated_position, estimated_velocity)` in 3D.
- `ReactiveEvasionEngine.calculate_evasion_vector(drone_pos, drone_vel, obstacle: DynamicObstacle) -> Tuple[np.ndarray, float]`:
  - Calculates CPA and 3D deflection vector within safety bubble (15m radius, 5s horizon).
  - Latency: < 1ms.

## Code Layout
```
C:\Users\WinterOS\Desktop\ARES/
├── specs/
│   └── spec.md                      # Authoritative system specification
├── src/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py                  # JWT HS256 auth & dependencies
│   │   ├── routes.py                # REST API routes under /api/v1
│   │   └── main.py                  # FastAPI app & tactical dashboard
│   ├── core/
│   │   ├── __init__.py
│   │   ├── models.py                # Pydantic schemas & DTOs
│   │   ├── fsm.py                   # Mission & drone FSM transitions
│   │   └── rules.py                 # Domain invariant validators
│   ├── database/
│   │   ├── __init__.py
│   │   ├── db.py                    # SQLite connection & WAL management
│   │   ├── schema.sql               # 18-table 3NF DDL schema
│   │   └── seed.py                  # Database seed fixtures
│   └── ai/
│       ├── __init__.py
│       ├── trajectory.py            # 3D Haversine waypoint generator
│       ├── evasion.py               # Analytical CPA reactive evasion
│       ├── dfine.py                 # PyTorch D-FINE perception module (NEW)
│       ├── vision.py                # 3D spatial projection & camera (NEW)
│       ├── kalman.py                # 3D kinematic state estimation (NEW)
│       ├── pipeline.py              # End-to-end vision-evasion pipeline (NEW)
│       └── benchmark.py             # 500-obstacle Monte Carlo benchmark
├── tests/
│   ├── test_auth.py                 # TEST-AUTH-001..004
│   ├── test_domain.py               # TEST-DOM-001..005
│   ├── test_database.py             # TEST-DB-001..002
│   ├── test_ai.py                   # TEST-AI-001..002
│   ├── test_vision.py               # Vision & D-FINE tests (NEW)
│   └── e2e/                         # 4-tier E2E test suite (NEW)
├── requirements.txt
├── PROJECT.md                       # Project orchestration document
├── TEST_INFRA.md                    # E2E test suite architecture & catalog
└── TEST_READY.md                    # E2E test readiness certificate
```
