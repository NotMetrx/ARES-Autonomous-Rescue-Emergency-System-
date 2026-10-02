# Original User Request

## 2026-09-11T17:00:26Z

Construir y validar integralmente el sistema ARES (Autonomous Rescue Emergency System) en Python puro: una plataforma de computación en el borde (Edge Computing) para la gestión y orquestación autónoma de enjambres de drones de rescate médico durante la  Hora Dorada (<60 min), integrando FastAPI, SQLite en modo WAL, visión y detección de obstáculos mediante PyTorch y D-FINE (con plena libertad para integrar módulos, filtros y librerías complementarias adicionales), y evasión reactiva dinámica (<50ms).

Working directory: C:\Users\WinterOS\Desktop\ARES
Integrity mode: development

## Requirements

### R1. Centro de Comando Táctico y API REST (FastAPI)
Implementar y robustecer la API REST completa bajo /api/v1 con autenticación JWT (HS256) para operadores, gestión de órdenes de misiones médicas, cálculo de planes de vuelo, despacho de unidades y recepción continua de telemetría de drones, con panel táctico local accesible sin conexión a Internet.

### R2. Base de Datos Relacional 3NF (SQLite en modo WAL)
Garantizar persistencia local en estricta Tercera Forma Normal (3NF) con claves foráneas activas (PRAGMA foreign_keys = ON;) y modo Write-Ahead Logging (PRAGMA journal_mode = WAL;), soportando ingesta concurrente masiva sin bloqueos (SQLITE_BUSY) y eliminación en cascada íntegra.

### R3. Motor de IA: Detección con PyTorch / D-FINE y Libertad Modular para Evasión 3D
Emplear PyTorch y D-FINE como base principal para la detección visual y espacial de obstáculos/objetivos, manteniendo total libertad para integrar cualquier módulo, algoritmo o biblioteca complementaria (como OpenCV, SciPy, filtros de estimación cinemática como Kalman, heurísticas o modelos alternativos) que permita optimizar la precisión y velocidad. El sistema cinemático debe generar trayectorias con waypoints y vectores reactivos de evasión en menos de 50 ms ante amenazas dentro de la burbuja de protección de 15 metros, sosteniendo una tasa de éxito superior al 95% en benchmarks de 500 obstáculos dinámicos.

### R4. Lógica de Dominio e Invariantes Críticos
Imponer validación estricta y rechazo automático ante:
1. Violación del SLA de la Hora Dorada ({\text{plan}} + t_{\text{vuelo}} \le 3600\text{ s}$).
2. Sobrecarga de carga útil superior al 90% de la capacidad del dron portador (\%$ de reserva aerodinámica).
3. Violación del margen de seguridad de batería para retorno RTH (\%$ de reserva).
4. Caducidad térmica de insumos termosensibles ({\text{vuelo}} > \text{max\_transit\_minutes} \times 60$).
5. Transiciones inválidas en las máquinas de estados finitas (FSM) de misiones y drones.

## Verification Resources

- Especificación de referencia completa y DDL: specs/spec.md.
- Suite de pruebas automatizadas: tests/ (test_auth.py, test_domain.py, test_database.py, test_ai.py) — 13/13 tests passing.
- Módulo de benchmark de simulación: src/ai/benchmark.py.

## Acceptance Criteria

### Security & Contratos REST
- [x] Autenticación de operadores y emisión de JWT verificada (TEST-AUTH-001).
- [x] Rechazo de credenciales inválidas con error 401 INVALID_CREDENTIALS (TEST-AUTH-002).
- [x] Bloqueo de operadores inactivos con error 403 USER_DISABLED (TEST-AUTH-003).
- [x] Protección estricta de rutas con rechazo 401 ante tokens ausentes o alterados (TEST-AUTH-004).

### Dominio e Invariantes
- [x] Verificación exacta del cálculo de peso de insumos médicos en misiones (TEST-DOM-001).
- [x] Bloqueo con error 409 INSUFFICIENT_FLEET si la carga útil excede el 90% de la capacidad (TEST-DOM-002).
- [x] Rechazo con error 422 GOLDEN_HOUR_EXCEEDED ante trayectorias que superen 60 minutos (TEST-DOM-003).
- [x] Rechazo con error 422 THERMAL_DECAY_EXCEEDED si el vuelo supera la vida térmica del insumo (TEST-DOM-004).
- [x] Control estricto de FSM impidiendo redisparar misiones activas con error 409 INVALID_STATE (TEST-DOM-005).

### Persistencia y Concurrencia
- [x] Integridad referencial en cascada comprobada sin dejar registros huérfanos (TEST-DB-001).
- [x] Ingesta concurrente exitosa de 20 hilos simultáneos en SQLite WAL sin error SQLITE_BUSY (TEST-DB-002).

### IA, Visión D-FINE / PyTorch y Evasión
- [x] Benchmark con 500 obstáculos dinámicos inyectados con tasa de éxito >= 95.0% y <= 25 colisiones (TEST-AI-001).
- [x] Latencia de recálculo reactivo en el Edge estrictamente inferior a 50 ms (TEST-AI-002).
- [ ] Integración del pipeline de visión utilizando PyTorch y D-FINE como base principal, con libertad para incorporar módulos o librerías complementarias que enriquezcan la detección, estimación cinemática y evasión en tiempo real.
