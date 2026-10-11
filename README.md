# ARES: Autonomous Rescue Emergency System (Edge Core & Tactical Swarm C2)

ARES es un prototipo en Python para planificar misiones de drones de rescate y entrega de suministros médicos. Integra una API FastAPI, un dashboard táctico local, persistencia SQLite y módulos de percepción, seguimiento y evasión 3D. Las reglas de dominio validan la Hora Dorada, la carga útil, la sensibilidad térmica y la reserva de batería.

El repositorio incluye dos aplicaciones FastAPI: **Edge Core** (`src.api.main:app`), descrita en las secciones siguientes, y **Tactical Swarm C2** (`proyectocompe.main:app`), con frontend React y telemetría WebSocket. Sus endpoints, autenticación y configuración son independientes. Ejecuta una a la vez en el puerto 8000 o asigna puertos distintos.

## Inicio rápido: Edge Core

Requisitos: Python 3.10+, SQLite con soporte WAL y un entorno virtual. Ejecuta los comandos desde la raíz del repositorio, `ARES-Autonomous-Rescue-Emergency-System-`.

En Ubuntu/Debian, instala las herramientas del sistema:

```bash
sudo apt update
sudo apt install -y python3-venv python3-dev build-essential sqlite3 libsqlite3-dev
```

Crea el entorno e instala las dependencias Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-linux.txt
```

Para otros sistemas, usa `requirements.txt`. En Linux con CPU puedes instalar primero la variante de PyTorch para CPU:

```bash
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
```

En Jetson, la instalación de PyTorch debe corresponder a la versión de JetPack del equipo.

Configura la clave JWT y arranca el servidor local:

```bash
export ARES_JWT_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Al arrancar, la aplicación crea el esquema SQLite y carga los catálogos, la flota y los operadores de ejemplo con `INSERT OR IGNORE`. Por defecto guarda la base en `ares.db` en la raíz del repositorio.

- Dashboard táctico: <http://127.0.0.1:8000/>
- Swagger UI: <http://127.0.0.1:8000/docs>
- Salud: <http://127.0.0.1:8000/health>

La cuenta de demostración creada por el seeder es `operador_tactico`, con contraseña `PasswordSeguro2026!`. Estas credenciales y la clave JWT predeterminada del código son para desarrollo local; sustituye las credenciales antes de exponer el servicio. La clave generada arriba cambia en cada ejecución del comando y los tokens anteriores dejan de ser válidos.

## Configuración

Define las variables antes de iniciar el proceso. El código las lee directamente del entorno; no carga un archivo `.env` automáticamente.

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `ARES_DB_PATH` | Ruta del archivo SQLite; el directorio padre debe existir. | `ares.db` en la raíz del repositorio. |
| `ARES_JWT_SECRET` | Firma de tokens JWT HS256, con duración de 8 horas. | Clave fija de desarrollo definida en `src/api/auth.py`. |
| `ARES_VISION_WEIGHTS` | Checkpoint utilizado al construir el detector sin una ruta explícita. | `weights/dfine_multiclass_best.pth` en la raíz del repositorio. |

Los pesos no son necesarios para abrir el dashboard ni para planificar misiones con la API. Sí son necesarios para el detector predeterminado y la demostración del pipeline de visión.

## Uso del dashboard y la API

Inicia sesión, crea una misión con origen, destino y suministros, y revisa la ruta calculada automáticamente. El despacho se habilita después de obtener una ruta válida. Desde el panel también puedes consultar la flota, enviar telemetría y ejecutar el benchmark de simulación para la misión actual.

El dashboard sirve HTML, CSS y JavaScript locales sin recursos de CDN. Los datos operativos requieren JWT. Los indicadores se actualizan al entrar o después de operaciones del panel; no hay actualización continua por polling ni streaming. Al recargar la página se conserva la sesión, pero se pierde la selección de misión de la pantalla.

| Método y ruta | Función |
| --- | --- |
| `POST /api/v1/auth/login` | Autenticar al operador y obtener el token. |
| `POST /api/v1/missions` | Crear una misión. |
| `GET /api/v1/missions` | Listar misiones. |
| `GET /api/v1/missions/{mission_id}` | Consultar una misión y sus asignaciones. |
| `POST /api/v1/missions/{mission_id}/route/calculate` | Calcular la ruta y asignar drones. |
| `GET /api/v1/trajectories/{trajectory_id}/waypoints` | Consultar puntos de una trayectoria. |
| `POST /api/v1/missions/{mission_id}/dispatch` | Despachar la misión. |
| `GET /api/v1/fleet/status` | Consultar totales de flota y alertas. |
| `POST /api/v1/telemetry/ingest` | Registrar telemetría. |
| `POST /api/v1/simulations/benchmark` | Ejecutar el benchmark de evasión. |

Salvo el login, las rutas de esta tabla requieren `Authorization: Bearer <token>`. Consulta los esquemas de solicitudes y respuestas en `/docs` y el [flujo del frontend](docs/frontend-correcciones.md) para conocer los detalles y límites del panel.

`/health` devuelve un estado estático; no comprueba la inferencia de IA ni ejecuta una verificación de SQLite. Las alertas de flota representan batería, señal o estado de emergencia, no una colisión visual confirmada.

## Visión y evasión 3D

El pipeline combina detección 2D, proyección espacial, seguimiento Kalman y evasión reactiva mediante el punto de mayor aproximación (CPA). El detector es una implementación local ligera con refinamiento FDR simplificado, distinta de la implementación oficial de D-FINE. Los YAML existentes no constituyen un flujo de entrenamiento ejecutable: no hay un entrenador local que los consuma.

Los checkpoints están ignorados por Git y deben proporcionarse por separado. Coloca un checkpoint compatible en `weights/dfine_multiclass_best.pth` o define su ruta:

```bash
export ARES_VISION_WEIGHTS="/ruta/al/checkpoint-compatible.pth"
python demo_test.py
```

La demostración usa fotogramas sintéticos. Sus mensajes de éxito no certifican precisión sobre imágenes reales ni aptitud para vuelo. La carga de pesos es estricta: un archivo ausente o incompatible produce un error. `allow_untrained=True` se reserva para pruebas sintéticas.

La latencia inferior a 50 ms es un objetivo que debe medirse con el pipeline completo en el equipo de destino. La precisión también requiere evaluación con datos reales; las métricas históricas de los checkpoints no sustituyen una evaluación reproducida.

Para evaluar un checkpoint con imágenes y anotaciones COCO propias:

```bash
python -m pip install -r requirements-vision-eval.txt
python -m scripts.evaluate_vision \
  --weights weights/dfine_multiclass_best.pth \
  --annotations data/annotations/val.json --images data/images \
  --category-map '{"SURVIVOR": 1, "DEBRIS": 2}' \
  --mode standard --output reports/vision-standard.json
```

El ejemplo requiere esos archivos de datos y que el mapeo de categorías coincida con sus anotaciones y las clases del modelo. Consulta la [guía de visión y evaluación](docs/vision-improvement.md) para interpretar AP/AR, comparar modos de posprocesado y preparar el siguiente entrenamiento.

## Comandos y validación

Con el entorno virtual activo, desde la raíz del repositorio:

| Comando | Propósito |
| --- | --- |
| `python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload` | Servidor local de desarrollo. |
| `python -m src.database.seed` | Crear el esquema y cargar datos de ejemplo sin arrancar la API. |
| `python -m pytest` | Suite Python, incluidas pruebas de dominio, API, visión y E2E. |
| `python -m pytest tests/e2e/test_dashboard_api.py tests/e2e/test_tier1_features.py` | Pruebas de API y dashboard. |
| `python -m unittest discover -s tests -p test_detector_regressions.py -v` | Regresiones del detector con dependencias de visión, sin pytest ni FastAPI. |
| `node --test --test-isolation=none tests/frontend/dashboard.test.cjs` | Regresiones del JavaScript del dashboard; requiere Node.js 24, sin dependencias npm. |
| `python demo_test.py` | Demostración sintética del pipeline; requiere pesos compatibles. |

Las pruebas de API utilizan SQLite temporal mediante fixtures. Las pruebas sintéticas de visión verifican comportamiento del software; no acreditan precisión ni seguridad operativa. Las pruebas JavaScript usan un DOM mínimo y no sustituyen la revisión visual en navegador.

## Arquitectura

```text
src/
├── api/          # FastAPI, JWT, endpoints y dashboard embebido
├── core/         # Esquemas Pydantic, reglas de dominio y máquinas de estados
├── database/     # Esquema SQLite, conexiones sync/async y seeders
└── ai/           # Trayectorias, detector, proyección, Kalman, evasión y benchmark
scripts/          # Evaluación COCO del detector
configs/          # YAML de modelos y datos
specs/            # Especificación del sistema
tests/           # Pruebas Python, E2E y frontend
docs/            # Guías de frontend y visión
```

La API aplica las reglas de dominio antes de persistir misiones, trayectorias y asignaciones. SQLite utiliza WAL y claves foráneas en las conexiones síncronas y asíncronas. El pipeline de visión se puede construir por separado de la API.

## Documentación y contribuciones

- [Especificación del sistema](specs/spec.md): requisitos y contratos previstos.
- [Plan del proyecto](PROJECT.md): contexto de arquitectura e hitos.
- [Infraestructura de pruebas](TEST_INFRA.md) y [registro de preparación](TEST_READY.md): contexto histórico de validación; contrasta sus cifras con la suite actual.
- [Frontend](docs/frontend-correcciones.md): flujo de misión, endpoints y validación.
- [Visión](docs/vision-improvement.md): checkpoints, límites y evaluación reproducible.

Para contribuir, acompaña los cambios de comportamiento con pruebas pertinentes y actualiza la documentación afectada. Separa los resultados de simulación de las mediciones con datos y hardware reales, e indica las condiciones de cualquier cifra de precisión o latencia.

## Tactical Swarm C2

Esta aplicación incorpora simulación de enjambre, radar 2D, visor Three.js, telemetría WebSocket, reportes AAR y gateways ATAK CoT/MAVLink. Los objetivos de frecuencia, latencia y evasión requieren medición; la simulación no certifica operación en vuelo.

Con las dependencias Python instaladas, construye el frontend y arranca C2 desde la raíz del repositorio:

```bash
cd frontend
npm ci
npm run build
cd ..
python -m uvicorn proyectocompe.main:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

El frontend compilado se sirve en `/`; el HUD está en `/hud`, las cámaras en `/mobile-cam` y `/broadcast`, Swagger en `/docs`, y la telemetría en `/ws/telemetry` y `/ws/telemetry/binary`. Sin `dist/`, la raíz devuelve información del backend en JSON. El informe AAR de ejemplo está en `/api/v1/missions/ARES-MISSION-01/aar-report/html` y requiere el contexto de misión correspondiente.

Para desarrollar la interfaz, ejecuta `npm run dev` desde `frontend/`. El script `scripts/start_field_c2.sh` también automatiza el arranque; requiere que `proyectocompe` sea importable (por ejemplo, con `PYTHONPATH=src`) y ejecuta npm si falta el build. Esa primera instalación puede requerir Internet.

### Estructura de Tactical Swarm C2

```
ares/
├── weights/                 # Pesos neuronales entrenados D-FINE (.pth) y métricas
├── data/                    # SQLite WAL, grabaciones de vuelo .jsonl y snapshots
├── src/
│   ├── ai/                  # D-FINE (RT-DETR), calibración, evasión 3D, Kalman
│   │   ├── dfine.py
│   │   ├── pipeline.py
│   │   ├── evasion.py
│   │   ├── trajectory.py
│   │   └── benchmark.py
│   ├── database/            # SQLite en modo WAL, DDL y seeders de catálogo
│   │   ├── schema.sql
│   │   ├── db.py
│   │   └── seed.py
│   ├── core/                # Invariantes de dominio, FSMs y esquemas Pydantic
│   │   ├── fsm.py
│   │   ├── rules.py
│   │   └── models.py
│   ├── api/                 # API REST FastAPI Edge Core & JWT HS256
│   │   ├── auth.py
│   │   ├── routes.py
│   │   └── main.py
│   └── proyectocompe/       # C2 Táctico de Enjambre, WebSockets, Simulación y Telemetría
│       ├── main.py          # Entrypoint unificado FastAPI C2
│       ├── api/v1/          # Endpoints REST (Drones, Misiones, IA, Geofences, Cámaras, etc.)
│       ├── services/        # Swarm simulator, AAR, clustering D-FINE, MAVLink, ATAK CoT
│       └── websockets/      # Canales WebSocket de telemetría a 20 Hz y binario
├── frontend/                # Aplicación React + Vite + Three.js + Tailwind CSS
│   ├── src/
│   │   ├── components/      # Viewport3D, TacticalRadar2D, CameraView, Copilot, etc.
│   │   ├── hooks/           # useSwarmWebSocket
│   │   └── store/           # Zustand state store
├── dist/                    # Build estático optimizado servido por FastAPI
├── scripts/                 # Live demo para jueces, streaming D-FINE, TUI táctica
└── tests/                   # Suite de pruebas automatizadas E2E y unitarias
```

---

### Funciones de Tactical Swarm C2

1. **Percepción Neuronal D-FINE (RT-DETR) con Ponderación de Incertidumbre FDR**:
   - Modelos entrenados en `weights/dfine_best.pth` y `weights/dfine_multiclass_best.pth`.
   - Calibración de probabilidad (Platt / Temperature Scaling) para optimización en rescates.
   - Micro-filtro espectral y textural anti-falsos positivos (follaje, sombras y asfalto).
   - Fusión horizontal de cajas delimitadoras adyacentes (HAQF).

2. **Burbuja de Seguridad Táctica (15 m) y Evasión Reactiva**:
   - Algoritmo cinemático 3D en `src/ai/evasion.py` y `src/proyectocompe/services/collision_service.py`.
   - Respuestas ante riesgos de colisión en el enjambre; medir la latencia en el hardware de destino.

3. **Streaming de Telemetría por WebSockets (10–30 Hz)**:
   - Canal JSON estándar en `ws://localhost:8000/ws/telemetry` y canal binario comprimido (LoRa/RF) en `/ws/telemetry/binary`.
   - Ingesta y distribución continua de coordenadas WGS84, orientación 3D (Roll, Pitch, Yaw), velocidad y batería.

4. **HUD Táctico 3D y Radar 2D**:
   - Visualizador 3D en Three.js con raycasting interactivo, cámara de persecución y hologramas de detección.
   - Radar táctico 2D con vector de rumbo, geocercas y burbujas de proximidad.
   - Selector de temas tácticos (Night Ops OLED, Sunlight Field Ops, NVG Monocromo, Amber Tactical).

5. **Copiloto Táctico de Voz con IA y Audio Sintético**:
   - Asistente de voz interactivo para control manos libres del enjambre.
   - Sintetizador de audio procedimental Web Audio API para alertas sonoras militares.

6. **Enjambre Autocurativo (Self-Healing Swarm) y Relevo por Batería**:
   - Redistribución dinámica de waypoints si un UAV sufre avería o pérdida de enlace.
   - Handover automático de inspección si la batería desciende de umbrales seguros (< 22%).

7. **Reportes After-Action Review (AAR) y Dossier ZIP con hashes SHA-256**:
   - Generación de reportes imprimibles oficiales para evaluación de jurados.
   - Exportación de misiones en formato QGroundControl (`.waypoints`) y Dossier con integridad criptográfica.

8. **Interoperabilidad Militar ATAK CoT y MAVLink**:
   - Gateway Cursor-on-Target (UDP 4242) para integración con Android Tactical Assault Kit.
   - Gateway MAVLink v1/v2 nativo (UDP 14550) para autopilotos PX4/ArduPilot.

---

