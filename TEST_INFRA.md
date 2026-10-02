# TEST_INFRA — ARES E2E Test Suite Architecture & Infrastructure

## 1. Executive Summary & Testing Philosophy
ARES (Autonomous Rescue Emergency System) operates in mission-critical edge computing environments where system failure directly impacts human survival during the Golden Hour (< 60 minutes). 

The ARES End-to-End (E2E) Test Suite implements a strict **opaque-box (black-box)** testing paradigm:
- The system is treated strictly as an opaque entity verified through public interfaces (REST API contracts, domain validation boundaries, SQLite 3NF relational invariants, and perception/evasion benchmark engines).
- Expected outputs are derived purely from authoritative requirements (`specs/spec.md`, `ORIGINAL_REQUEST.md`, `PROJECT.md`), mathematical properties (e.g., Haversine distance, Closest Point of Approach), and official schema constraints.
- No facade or tautological tests: each test exercises real database persistence, cryptographic verification, state machine validation, or kinematic physics.

---

## 2. Methodology & Test Derivation

The E2E test suite synthesizes four formal opaque-box design techniques:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARES Opaque-Box Methodology                     │
├────────────────────────┬───────────────────────────────────────────────┤
│ Category-Partition     │ Partition API inputs & domain states into     │
│ (CP)                   │ valid and invalid equivalence classes.        │
├────────────────────────┼───────────────────────────────────────────────┤
│ Boundary Value         │ Exercise values on, immediately below, and    │
│ Analysis (BVA)         │ immediately above domain invariant thresholds.│
├────────────────────────┼───────────────────────────────────────────────┤
│ Pairwise Combinatorial │ Test multi-feature interactions, state flows, │
│ Testing (PCT)          │ and fleet resource contention.                │
├────────────────────────┼───────────────────────────────────────────────┤
│ Real-World Application │ Multi-drone Golden Hour emergency rescue,     │
│ Scenarios (RWAS)       │ environmental stress, and mass casualties.    │
└────────────────────────┴───────────────────────────────────────────────┘
```

---

## 3. 4-Tier Test Suite Architecture

The test suite is partitioned into four hierarchical, progressive tiers located in `tests/e2e/`:

```
tests/e2e/
├── __init__.py
├── conftest.py                   # Isolated DB fixtures, HTTP client, auth helpers
├── test_tier1_features.py       # Tier 1: Feature Coverage (Features in isolation)
├── test_tier2_boundaries.py     # Tier 2: Boundary & Corner Cases (BVA, Invariants)
├── test_tier3_combinations.py   # Tier 3: Cross-Feature Combinations (Pairwise, Flows)
└── test_tier4_scenarios.py      # Tier 4: Real-World Application Scenarios (Missions)
```

### Tier 1 — Feature Coverage (`test_tier1_features.py`)
- **Objective**: Verify the primary "happy-path" behavior of every inventoried feature from `PROJECT.md § Feature Inventory` in isolation.
- **Coverage**:
  - Feature 1: Operator Authentication (`POST /api/v1/auth/login`)
  - Feature 2: Bearer Token Validation Dependency (Protected route authorization)
  - Feature 3: Mission Creation (`POST /api/v1/missions` with cargo calculation)
  - Feature 4: Mission Query (`GET /api/v1/missions/{id}`)
  - Feature 5: 3D Trajectory Calculation (`POST /api/v1/missions/{id}/route/calculate`)
  - Feature 6: Mission Dispatch (`POST /api/v1/missions/{id}/dispatch`)
  - Feature 7: Edge Telemetry Ingestion (`POST /api/v1/telemetry/ingest`)
  - Feature 8: Evasion Benchmark Simulation (`POST /api/v1/simulations/benchmark`)
  - Feature 9: Tactical Command Web Dashboard (`GET /`)
  - Feature 10: Health Check Endpoint (`GET /health`)
  - Feature 11: Swagger UI & OpenAPI Specification (`GET /docs`, `GET /openapi.json`)
  - Feature 12: SQLite PRAGMA Enforcement (`foreign_keys = ON`, `journal_mode = WAL`)
  - Feature 13: Tactical Catalogs & Default Fixtures (Roles, Statuses, Drones, Supplies)
  - Feature 14: 3D Discretized Waypoint Generation (Kinematic climb, cruise, descent)
  - Feature 15: Reactive 3D Evasion Engine (Analytical CPA within 15m safety bubble)

### Tier 2 — Boundary & Corner Cases (`test_tier2_boundaries.py`)
- **Objective**: Rigorously test critical domain thresholds, edge conditions, format validations, and adversarial inputs.
- **Coverage**:
  - Golden Hour SLA limit: Exact boundary $t \le 3600\text{s}$ (accepted) vs $t > 3600\text{s}$ (422 `GOLDEN_HOUR_EXCEEDED`).
  - Payload limit: Exact boundary $\le 90\%$ max payload (accepted) vs $> 90\%$ (409 `INSUFFICIENT_FLEET`).
  - Thermal decay limit: Flight time $\le \text{max\_transit\_minutes} \times 60$ (accepted) vs exceeding (422 `THERMAL_DECAY_EXCEEDED`).
  - Battery safety reserve: Energy consumption $\le 70\%$ (passes) vs $> 70\%$ (`BATTERY_RESERVE_VIOLATION`).
  - Telemetry alerts: Battery $< 10\%$ and Signal SNR $< 10\text{ dB}$ trigger `collision_alert = True`.
  - Geographic boundaries: Coordinates on boundaries $[-90, 90]$ and $[-180, 180]$ vs out-of-range inputs (422 Unprocessable).
  - Security corner cases: Malformed tokens, invalid signatures, expired tokens, missing Authorization headers (401 Unauthorized).
  - Inactive operator accounts: Disabled operator accounts rejected (403 `USER_DISABLED`).
  - Finite State Machine invariants: Invalid transitions (DRAFT $\to$ ACTIVE without route calculation, ACTIVE $\to$ ACTIVE re-dispatch) rejected (409 `INVALID_STATE`).
  - Supply catalog boundaries: Unknown supply IDs (400 `INVALID_SUPPLY`), zero/negative quantities (422).
  - Non-existent resource queries: Missing missions (404 `MISSION_NOT_FOUND`).
  - Kinematic evasion boundaries: Zero-velocity stationary obstacles, obstacles outside the 15m safety sphere.
  - Fleet capacity exhaustion: Requesting more drones than available in the IDLE fleet (409 `INSUFFICIENT_FLEET`).

### Tier 3 — Cross-Feature Combinations (`test_tier3_combinations.py`)
- **Objective**: Validate combinatorial workflows, multi-step business processes, and state consistency across modules.
- **Coverage**:
  - Full Mission Lifecycle: Authentication $\to$ Mission Order $\to$ Trajectory Calculation $\to$ Dispatch $\to$ Real-Time Telemetry Ingestion.
  - Multi-Mission Fleet Contention: Resource locking of IDLE drones across concurrent missions, verifying clean fleet depletion and recovery.
  - 3NF Relational Integrity & Cascades: Deep cascading deletion of missions, ensuring trajectories, waypoints, assignments, and telemetry are purged without orphan records.
  - Environmental Vector Interactions: Route calculation with headwind, tailwind, and crosswind vectors modifying ground speeds and flight durations.
  - Concurrent Telemetry & Tactical Queries: SQLite WAL concurrency under concurrent write loads without database locking (`SQLITE_BUSY`).
  - Multi-Category Cargo Composition: Combining thermosensitive blood/antidotes with non-perishable surgical supplies, validating aggregate weight and shortest thermal deadline constraints.

### Tier 4 — Real-World Application Scenarios (`test_tier4_scenarios.py`)
- **Objective**: Execute end-to-end tactical rescue operations simulating actual emergency scenarios in the field.
- **Coverage**:
  - Scenario 1: Golden Hour Mass Casualty Earthquake Response (Multi-drone dispatch carrying blood units and antivenom within strict 60-minute window).
  - Scenario 2: Coastal Gale Winds & No-Fly Zone Avoidance (Adverse weather compensation and obstacle clearance maintaining $\ge 30\%$ battery reserve).
  - Scenario 3: Mid-Flight Critical Telemetry Alert & Swarm Contingency (Telemetry ingestion detects low battery / SNR drop, triggering emergency telemetry alerts).
  - Scenario 4: Ultra-Perishable Antidote Rapid Deployment (15-minute thermal stability envelope validated against high-speed delivery flight profile).

---

## 4. Test Environment & Infrastructure

### 4.1. Isolation & Database Sandboxing
- Each test run operates against an isolated SQLite database file seeded with standard tactical fixtures via `seed_database()`.
- Connection parameters strictly enforce:
  - `PRAGMA foreign_keys = ON;`
  - `PRAGMA journal_mode = WAL;`
  - `timeout = 30.0;`
- FastAPI `app.dependency_overrides[get_db]` injects the isolated async SQLite connection per test context.

### 4.2. Invocation Command
```bash
pytest tests/e2e -v
```

All tests execute synchronously or asynchronously using `pytest-asyncio` with `httpx.AsyncClient` and ASGI transport.
