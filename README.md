# ARES: Autonomous Rescue Emergency System (Edge Core & Tactical Swarm C2)

Plataforma unificada para la orquestación autónoma de enjambres de drones de rescate (UAVs) en misiones críticas dentro de la **Hora Dorada** (<60 min) con percepción neuronal D-FINE (RT-DETR), evasión reactiva 3D (<50ms), C2 geoespacial en tiempo real y frontend táctico 3D.

---

## ⚡ Arquitectura General del Sistema

```
ares/
├── weights/                 # Pesos neuronales entrenados D-FINE (.pth) y métricas
├── data/                    # SQLite WAL, grabaciones de vuelo .jsonl y snapshots
├── src/
│   ├── ai/                  # D-FINE (RT-DETR), calibración, evasión 3D (<50ms), Kalman
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

## ⚡ Características Principales

1. **Percepción Neuronal D-FINE (RT-DETR) con Ponderación de Incertidumbre FDR**:
   - Modelos entrenados en `weights/dfine_best.pth` y `weights/dfine_multiclass_best.pth`.
   - Calibración de probabilidad (Platt / Temperature Scaling) para optimización en rescates.
   - Micro-filtro espectral y textural anti-falsos positivos (follaje, sombras y asfalto).
   - Fusión horizontal de cajas delimitadoras adyacentes (HAQF).

2. **Burbuja de Seguridad Táctica (15 m) y Evasión Reactiva (< 50 ms)**:
   - Algoritmo cinemático 3D en `src/ai/evasion.py` y `src/proyectocompe/services/collision_service.py`.
   - Respuestas divergentes en menos de 0.1 ms ante riesgos inminentes de colisión en el enjambre.

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

7. **Reportes After-Action Review (AAR) y Dossier ZIP Firmado (SHA-256)**:
   - Generación de reportes imprimibles oficiales para evaluación de jurados.
   - Exportación de misiones en formato QGroundControl (`.waypoints`) y Dossier con integridad criptográfica.

8. **Interoperabilidad Militar ATAK CoT y MAVLink**:
   - Gateway Cursor-on-Target (UDP 4242) para integración con Android Tactical Assault Kit.
   - Gateway MAVLink v1/v2 nativo (UDP 14550) para autopilotos PX4/ArduPilot.

---

## 🚀 Inicio Rápido

### 1. Iniciar el Servidor Backend Unificado
```bash
# Opción A: Script de campo directo
./scripts/start_field_c2.sh

# Opción B: Ejecución directa con uvicorn
uvicorn proyectocompe.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Acceder a las Interfaces
- **HUD Táctico C2**: [http://localhost:8000/hud](http://localhost:8000/hud)
- **Frontend React 3D**: [http://localhost:8000/](http://localhost:8000/)
- **Documentación Swagger / OpenAPI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Informe AAR Imprimible (Jueces)**: [http://localhost:8000/api/v1/missions/ARES-MISSION-01/aar-report/html](http://localhost:8000/api/v1/missions/ARES-MISSION-01/aar-report/html)

### 3. Desarrollo Frontend (Vite)
```bash
cd frontend
npm install
npm run dev
```

### 4. Ejecución de Pruebas
```bash
pytest -v
```
