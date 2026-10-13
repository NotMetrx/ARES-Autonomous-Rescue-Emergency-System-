# BIOSCAOUT — Bio-Autonomous Swarm Command & Control

**BIOSCAOUT** es un prototipo en Python + React para coordinar enjambres de drones de búsqueda y rescate (SAR) y entrega de suministros médicos. Combina una API FastAPI, un centro de mando táctico 3D, telemetría WebSocket en tiempo real, percepción neuronal D-FINE (RT-DETR), seguimiento Kalman y evasión reactiva 3D, con persistencia SQLite en modo WAL.

> [!NOTE]
> BIOSCAOUT es el nuevo nombre del proyecto antes conocido como **ARES (Autonomous Rescue Emergency System)**. Algunos identificadores internos conservan el nombre anterior: el paquete Python `proyectocompe`, los IDs de dron (`ARES-01`, `ARES-02`, `ARES-03`), la misión de ejemplo `ARES-MISSION-01`, los contenedores Docker y la URL del repositorio.

El repositorio contiene dos aplicaciones FastAPI independientes, cada una con sus propios endpoints, autenticación y configuración. Ejecuta una a la vez en el puerto 8000 o asígnales puertos distintos.

| Aplicación | Entrypoint | Propósito |
| --- | --- | --- |
| **Tactical Swarm C2** | `proyectocompe.main:app` (`--app-dir src`) | Centro de mando del enjambre: frontend React/Three.js, telemetría WebSocket, cámaras, defensa EW, AAR, ATAK CoT y MAVLink. |
| **Edge Core** | `src.api.main:app` | API de planificación de misiones con JWT, reglas de dominio (Hora Dorada, carga útil, batería) y dashboard HTML embebido. |

---

## Requisitos

- Python **3.12** (ver `.python-version` y `pyproject.toml`).
- Node.js 22+ y npm para compilar el frontend (opcional si usas el build incluido en `dist/`).
- SQLite con soporte WAL.
- Gestor recomendado: [`uv`](https://docs.astral.sh/uv/). También funciona `pip` con `requirements.txt` / `requirements-linux.txt`.

## Inicio rápido: Tactical Swarm C2

Desde la raíz del repositorio:

```bash
# 1. Dependencias Python
uv sync                      # o: python -m pip install -r requirements.txt

# 2. Frontend (opcional: dist/ ya incluye un build)
cd frontend
npm ci
npm run build
cd ..

# 3. Servidor C2
uv run uvicorn proyectocompe.main:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

| Ruta | Contenido |
| --- | --- |
| `/` | Frontend React compilado (si no existe `dist/`, devuelve información del backend en JSON). |
| `/hud` | HUD táctico HTML autónomo (`static/tactical_hud.html`). |
| `/mobile-cam`, `/broadcast` | Cámara móvil para transmitir vídeo al C2. |
| `/docs` | Swagger UI. |
| `/health` | Estado del servicio. |
| `/ws/telemetry` | Telemetría JSON del enjambre (20 Hz por defecto). |
| `/ws/telemetry/binary` | Telemetría binaria compacta (enlaces LoRa/RF). |
| `/ws/camera/{drone_id}/ingest` | Ingesta de vídeo por WebSocket. |

Para desarrollar la interfaz con recarga en caliente, ejecuta `npm run dev` dentro de `frontend/`. El script `scripts/start_field_c2.sh` automatiza el arranque en campo; requiere que `proyectocompe` sea importable (por ejemplo, `PYTHONPATH=src`) y ejecuta npm si falta el build, por lo que la primera vez puede necesitar Internet.

### Docker

```bash
docker compose up --build
```

El `Dockerfile` multi-etapa compila el frontend con Node 22, instala el backend con `uv sync --frozen` sobre Python 3.12 y expone `8000/tcp`, `14550/udp` (MAVLink) y `4242/udp` (ATAK CoT). `docker-compose.yml` usa `network_mode: host` y monta `./data` para persistir misiones, snapshots y grabaciones de vuelo.

### API REST de Tactical Swarm C2 (`/api/v1`)

| Prefijo | Funciones principales |
| --- | --- |
| `/drones` | Estado de la flota, comandos individuales y globales, transiciones FSM, `goto` y formaciones. |
| `/missions` | Misiones, rejilla de búsqueda SAR (boustrophedon), cobertura, abortar, informe AAR (JSON/HTML), exportación QGroundControl (`.waypoints`) y dossier ZIP. |
| `/detections` | Ingesta de detecciones IA, snapshots, asignación a drones, exportación GeoJSON y simulación. |
| `/geofences` | Geocercas y zonas de exclusión (NFZ), exportación GeoJSON. |
| `/camera` | Stream MJPEG por dron, frames, gimbal, presets, snapshots, analítica y conexión a streams externos (p. ej. DroidCam). |
| `/telemetry` | Ingesta de telemetría externa y gateway MAVLink (estado, inicio, simulación). |
| `/defense` | Anti-jamming GPS, viento y punto de no retorno (PNR), ATAK CoT y presupuesto de enlace RF. |
| `/recorder` | Caja negra: grabación, sesiones y replay con velocidad ajustable. |
| `/chaos` | Ingeniería del caos: fallo de dron, drenaje de batería, ráfaga de detecciones y restauración. |
| `/ai-engine` | Heartbeat y watchdog del motor de IA. |
| `/tiles` | Teselas MBTiles offline, metadatos y `style.json`. |

Consulta los esquemas completos en `/docs`.

### Funciones destacadas

1. **Percepción D-FINE (RT-DETR)** con refinamiento FDR, filtro anti-falsos positivos (follaje, sombras, asfalto), conteo de supervivientes en vista en tiempo real y seguimiento de objetivo único.
2. **Burbuja de seguridad de 15 m y evasión reactiva 3D** (`src/ai/evasion.py`, `services/collision_service.py`) basada en el punto de mayor aproximación (CPA).
3. **Telemetría WebSocket a 10–30 Hz** con posición WGS84, actitud (roll, pitch, yaw), velocidad y batería, en JSON y binario.
4. **Visor 3D Three.js y radar táctico 2D** con geocercas, burbujas de proximidad, mapa offline (Leaflet) y temas tácticos.
5. **Copiloto táctico por voz** y alertas sonoras procedimentales con Web Audio API.
6. **Enjambre autocurativo**: redistribución de waypoints ante fallos o pérdida de enlace y relevo automático por batería baja.
7. **AAR y dossier ZIP** con hashes SHA-256 y exportación a QGroundControl.
8. **Interoperabilidad**: gateway ATAK Cursor-on-Target (UDP 4242) y MAVLink v1/v2 (UDP 14550) para PX4/ArduPilot.

> [!IMPORTANT]
> Los objetivos de frecuencia, latencia (< 50 ms) y tasa de evasión deben medirse en el hardware de destino. La simulación del enjambre no certifica operación en vuelo real.

---

## Edge Core

API de planificación con reglas de dominio y dashboard HTML embebido sin dependencias de CDN.

```bash
export ARES_JWT_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Al arrancar crea el esquema SQLite y carga catálogos, flota y operadores de ejemplo (`INSERT OR IGNORE`). También puedes inicializar la base sin la API con `python -m src.database.seed`.

- Dashboard: <http://127.0.0.1:8000/>
- Swagger UI: <http://127.0.0.1:8000/docs>
- Salud: <http://127.0.0.1:8000/health>

Cuenta de demostración: `operador_tactico` / `PasswordSeguro2026!`. Estas credenciales y la clave JWT predeterminada son solo para desarrollo local; cámbialas antes de exponer el servicio.

| Método y ruta | Función |
| --- | --- |
| `POST /api/v1/auth/login` | Autenticar al operador y obtener el token JWT (HS256, 8 h). |
| `POST /api/v1/missions` | Crear una misión. |
| `GET /api/v1/missions/{mission_id}` | Consultar una misión y sus asignaciones. |
| `POST /api/v1/missions/{mission_id}/route/calculate` | Calcular la ruta y asignar drones. |
| `POST /api/v1/missions/{mission_id}/dispatch` | Despachar la misión. |
| `POST /api/v1/telemetry/ingest` | Registrar telemetría. |
| `POST /api/v1/simulations/benchmark` | Ejecutar el benchmark de evasión. |

Salvo el login, todas las rutas requieren `Authorization: Bearer <token>`.

## Configuración

Las variables se leen directamente del entorno; no se carga un archivo `.env` automáticamente.

| Variable | Aplicación | Uso | Predeterminado |
| --- | --- | --- | --- |
| `ARES_DB_PATH` | Edge Core | Ruta del archivo SQLite (el directorio padre debe existir). | `ares.db` en la raíz. |
| `ARES_JWT_SECRET` | Edge Core | Clave de firma JWT. | Clave fija de desarrollo en `src/api/auth.py`. |
| `MBTILES_PATH` | C2 | Teselas offline. | `data/offline_map.mbtiles` |
| `FRONTEND_DIST_DIR` | C2 | Carpeta del build de Vite. | `dist` |

`TELEMETRY_HZ` (20) y `SAFETY_BUBBLE_METERS` (15.0) están definidos en `src/proyectocompe/core/config.py`.

## Visión y pesos

El pipeline (`src/ai/pipeline.py`) encadena detección 2D D-FINE, proyección espacial, seguimiento Kalman multi-obstáculo y evasión reactiva. El servicio de cámara del C2 carga `weights/dfine_best.pth`; también se incluyen `dfine_multiclass_best.pth` y sus historiales de entrenamiento (`training_*history.csv`). Los YAML de `configs/dfine/` y `configs/data/` describen modelos y datasets.

```bash
python demo_test.py
```

La demostración usa fotogramas sintéticos: verifica el comportamiento del software, no la precisión sobre imágenes reales ni la aptitud para vuelo.

## Scripts

| Script | Propósito |
| --- | --- |
| `scripts/judge_live_demo.py` | Demostración coreografiada para jueces (despegue, rejilla SAR, detecciones, AAR). |
| `scripts/dfine_companion_streamer.py` | Simula un computador de a bordo (Jetson / Raspberry Pi) que envía vídeo y telemetría. |
| `scripts/mock_edge_ai.py` | Cliente simulado de ingesta de detecciones Edge AI. |
| `scripts/tactical_tui.py` | Interfaz de terminal ligera para portátiles de campo o sesiones SSH. |
| `scripts/start_field_c2.sh` | Arranque automatizado del C2 en campo. |

## Pruebas

```bash
uv run pytest                 # o: python -m pytest
uv run pytest tests/e2e       # escenarios E2E por niveles (tier 1–4)
```

La suite cubre dominio, autenticación, base de datos, IA, visión (incluidas pruebas de estrés), detección, enjambre, colisiones adversariales, cámaras y extensiones C2. Las pruebas usan SQLite temporal mediante fixtures.

## Arquitectura

```text
├── src/
│   ├── ai/              # D-FINE, visión, Kalman, evasión 3D, trayectorias, benchmark, pipeline
│   ├── api/             # Edge Core: FastAPI, JWT y dashboard embebido
│   ├── core/            # Modelos Pydantic, reglas de dominio y FSM
│   ├── database/        # Esquema SQLite (WAL), conexiones y seeders
│   └── proyectocompe/   # Tactical Swarm C2
│       ├── main.py      # Entrypoint FastAPI
│       ├── api/v1/      # Endpoints REST
│       ├── core/        # Configuración
│       ├── services/    # Simulador de enjambre, colisiones, AAR, CoT, MAVLink, cámaras, etc.
│       └── websockets/  # Telemetría JSON/binaria e ingesta de cámara
├── frontend/            # React 19 + Vite + TypeScript + Three.js + Tailwind + Zustand
├── dist/                # Build estático servido por FastAPI
├── static/              # HUD táctico y cámara móvil (HTML autónomo)
├── weights/             # Checkpoints D-FINE y métricas de entrenamiento
├── configs/             # YAML de modelos y datos
├── scripts/             # Demos, simuladores y TUI
├── specs/               # Especificación del sistema
└── tests/               # Pruebas unitarias y E2E
```

## Documentación

- [Especificación del sistema](specs/spec.md)
- [Plan del proyecto](PROJECT.md)
- [Infraestructura de pruebas](TEST_INFRA.md) y [registro de preparación](TEST_READY.md) (contexto histórico; contrasta sus cifras con la suite actual)

## Contribuir

Acompaña los cambios de comportamiento con pruebas y actualiza la documentación afectada. Separa los resultados de simulación de las mediciones con datos y hardware reales, e indica las condiciones de cualquier cifra de precisión o latencia.
