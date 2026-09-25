# ARES Tactical Swarm Command & Control (C2) - FastAPI Backend

Backend táctico de alto rendimiento para control geoespacial, visualización 3D y telemetría en tiempo real de enjambres de drones (UAVs) en entornos 100% offline.

---

## ⚡ Características Principales

1. **Streaming de Telemetría por WebSockets (10–30 Hz)**:
   - Endpoint: `ws://localhost:8000/ws/telemetry`
   - Ingesta y distribución continua de coordenadas cinemáticas WGS84, orientación 3D (Roll, Pitch, Yaw), velocidad y batería sin HTTP polling.

2. **Burbuja de Seguridad Táctica (15 m) y Evasión Reactiva (< 50 ms)**:
   - Algoritmo de detección de colisiones en espacio tridimensional.
   - Si la distancia entre dos agentes es inferior a 15 metros, el sistema calcula vectores de evasión divergentes en menos de **0.1 ms** (requisito del proyecto: < 50 ms) y emite alertas tácticas de alta prioridad.

3. **Máquina de Estados de la Flota (FSM)**:
   - Control estricto de transiciones: `IDLE` ➔ `TAKEOFF` ➔ `IN_FLIGHT` ➔ `ROUTING` ➔ `AVOIDING` ➔ `RTH` ➔ `LANDED`.

4. **Servidor de Mapas Geoespaciales Offline (.mbtiles)**:
   - Soporte local de capas ráster/vectoriales leyendo archivos `.mbtiles` SQLite en `data/offline_map.mbtiles`.
   - Endpoint: `/api/v1/tiles/{z}/{x}/{y}` y estilo autoconfigurado `/api/v1/tiles/style.json` para MapLibre GL JS / Leaflet sin necesidad de conexión a internet ni Mapbox/Google Maps.

5. **Empaquetado Estático para Frontend**:
   - Integración automática con builds de Vite (`dist/`) servidos mediante `StaticFiles` para distribución en un solo ejecutable/servicio en campo.

6. **HUD Táctico C2 Avanzado (Modo Noche & Modo Luz)**:
   - Interfaz web táctica de grado militar en `http://localhost:8000/hud` con selector de **Modo Noche (Night Ops OLED)** y **Modo Luz (Sunlight Field Ops)** con persistencia en `localStorage`.
   - Radar 2D de alta resolución con representación de heading, burbuja de 15m, vectores de evasión, polígonos de geocerca, trazas de barrido y objetivos de IA.

7. **Clustering Espacio-Temporal de Detecciones IA & Evidencias en Disco**:
   - Algoritmo de fusión que evita inundar el C2 con 20 FPS del mismo objetivo. Si una detección ocurre a < 8m de un objetivo existente, incrementa el conteo de avistamientos (`observation_count`), refina las coordenadas WGS84 por promedio ponderado y actualiza la certeza sin saturar con falsos despachos.
   - Guardado automático de imágenes en disco (`data/snapshots/`) y servicio de imágenes por `/api/v1/detections/{id}/snapshot`.
   - Script de prueba para el equipo de IA: `python scripts/mock_edge_ai.py`.

8. **Motor de Geocercas (No-Fly Zones & Keep-In Perimeters)**:
   - Validación punto-en-polígono en tiempo real (< 1 ms).
   - Generación automática de alertas de intrusión en zonas prohibidas (`KEEP_OUT`) o abandono del perímetro operacional (`KEEP_IN`).

9. **Generador de Patrones de Barrido Autónomo (Boustrophedon / Lawnmower)**:
   - Genera misiones de búsqueda y rescate (SAR) dividiendo el área en franjas paralelas no cruzadas para N drones.
   - Persistencia completa de misiones en SQLite (`data/ares_missions.db`).

10. **Caja Negra (Flight Data Recorder) & Replay Engine**:
    - Grabación continua de telemetría a archivos estructurados `.jsonl` en `data/flight_records/`.
    - Reproductor táctico con control de velocidad (0.5x, 1.0x, 2.0x, 5.0x) para revisiones After-Action Review (AAR).

11. **Ingesta de Telemetría Externa & Watchdog de Enlace**:
    - Endpoint `/api/v1/telemetry/ingest` para drones reales o simuladores SITL (MAVLink/ROS 2).
    - Watchdog de enlace: si un dron externo no envía telemetría por > 3.5s, conmuta a estado `EMERGENCY` y emite alerta de pérdida de enlace.

12. **Watchdog de Salud y Métricas del Motor de IA Edge**:
    - Endpoint `/api/v1/ai-engine/heartbeat` y `/api/v1/ai-engine/status`: monitorea en tiempo real los FPS del modelo YOLO, temperatura de GPU/CPU y uso de VRAM de la Jetson/Raspberry Pi.

13. **Matriz de Cobertura Geoespacial y Huella de Visión en Vivo**:
    - Endpoint `/api/v1/missions/coverage`: discretiza el terreno en celdas y calcula el porcentaje de área barrida por los conos de visión de los drones.

14. **Geocercas Dinámicas Reactivas ante Peligros (Fuego / Amenazas)**:
    - Si la IA detecta un `FIRE_HAZARD` con alta certeza, el backend autogenera una No-Fly Zone circular de exclusión (radio 28m) para evitar que los drones atraviesen la columna de humo o calor.

15. **Generador de Reportes After-Action Review (AAR) para Jueces**:
    - Endpoint `/api/v1/missions/{id}/aar-report/html` y `/aar-report` (JSON): reporte oficial imprimible con puntaje de misión (0-100 pts), tabla de KPIs, evidencias fotográficas y desglose para competencia.

16. **Exportador para QGroundControl y Autopilotos PX4/ArduPilot**:
    - Endpoint `/api/v1/missions/{id}/export/qgc`: exporta misiones en formato estándar `.waypoints` (QGC WPL 110).

17. **Gateway MAVLink v1/v2 UDP Nativo (Puerto 14550)**:
    - Escucha pasiva y activa en `udp:0.0.0.0:14550` usando `pymavlink`. Decodifica `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `SYS_STATUS` y mapea directamente a la telemetría del C2.
    - Endpoints: `/api/v1/telemetry/mavlink/status`, `/mavlink/start`, `/mavlink/simulate`.

18. **Enjambre Autocurativo (Self-Healing Swarm)**:
    - Si un dron experimenta falla de motor o pérdida de enlace, sus waypoints no explorados son redistribuidos automáticamente entre los drones operativos supervivientes en tiempo real.

19. **Relevo Autónomo por Batería Crítica (Battery Handover)**:
    - Bucle continuo de monitoreo: si un dron en inspección desciende a < 22% de batería, el C2 despacha automáticamente un dron con > 70% para relevarlo en el punto exacto y ordena RTH automático al dron agotado.

20. **Dossier Oficial de Misión en ZIP con Firma SHA256**:
    - Endpoint: `GET /api/v1/missions/{mission_id}/export/dossier`: empaqueta instantáneamente el reporte AAR HTML, JSON de métricas, fotos de evidencias capturadas, GeoJSON de objetivos, archivos QGC, registros de caja negra `.jsonl` y certificado de integridad con hashes SHA-256.

21. **Suite de Pruebas de Resiliencia y Chaos Engineering**:
    - Endpoints `/api/v1/chaos/inject-drone-failure`, `/inject-battery-drain`, `/inject-detection-burst`, `/restore-fleet` para demostraciones en vivo ante jueces y verificación de robustez.

22. **Gateway Militar ATAK / Cursor-on-Target (CoT - Puerto 4242 UDP)**:
    - Transmisión en tiempo real de eventos XML Cursor-on-Target (MIL-STD) para UAVs (`a-f-A-M-F-Q`) y víctimas (`b-m-p-s-p-loc`) a dispositivos Android Tactical Assault Kit (ATAK) y WinTAK.
    - Endpoints: `/api/v1/defense/cot/status`, `/api/v1/defense/cot/broadcast-now`.

23. **Estimador Aerodinámico de Viento y Punto de No Retorno (PNR) Dinámico**:
    - Estima velocidad y vector de viento en vuelo y calcula el umbral de batería exacto requerido para regresar a la base superando vientos en contra.
    - Endpoints: `/api/v1/defense/aerodynamics/wind`, `/api/v1/defense/aerodynamics/pnr-status`.

24. **Módulo Anti-Jamming y Detección de Suplantación GPS (Modo GPS-Denied / EW)**:
    - Detección cinemática de saltos anómalos de posición, ráfagas de aceleración espurias y pérdida de satélites. Conmuta a navegación inercial por Dead Reckoning (DR) ante interferencia electromagnética.
    - Endpoints: `/api/v1/defense/anti-jamming/status`, `/simulate-attack`, `/clear-attack`.

25. **Telemetría Binaria Ultracompacta para Radio RF / LoRa (433/868/915 MHz)**:
    - Compresión binaria estructurada (C-struct + CRC16) reduciendo el frame de 2,400 bytes a 73 bytes (**97.0% de ahorro de ancho de banda**).
    - Canal WebSocket `/ws/telemetry/binary` y simulador de balance de enlace de radio `/api/v1/defense/rf-link/budget` (RSSI, SNR y pérdida de paquetes).

26. **Generador de Teselas MGRS Topográficas Sintéticas & Visor Offline en HUD**:
    - Generación dinámica en memoria de teselas de alta resolución (256x256) con curvas de nivel y cuadrícula MGRS en `/api/v1/tiles/{z}/{x}/{y}`. Alternable fluidamente en el HUD entre radar sintético y mapa topográfico offline Leaflet.

27. **Consola TUI Táctica para Operadores en Terreno**:
    - Script autónomo en terminal (`python scripts/tactical_tui.py`) con tablero ANSI en tiempo real, radar 2D ASCII y comandos de teclado tácticos directos para laptops rugerizadas o terminales remotas por SSH.

---

## 🚀 Inicio Rápido

### 1. Iniciar el Servidor Backend (Despliegue Local o de Campo)
```bash
# Opción A: Script de campo directo
./scripts/start_field_c2.sh

# Opción B: uv directo
uv run uvicorn proyectocompe.main:app --host 0.0.0.0 --port 8000 --reload

# Opción C: Docker Compose
docker compose up --build
```

### 2. Acceder a las Interfaces
- **HUD Táctico Moderno**: [http://localhost:8000/hud](http://localhost:8000/hud)
- **Informe AAR Imprimible (Jueces)**: [http://localhost:8000/api/v1/missions/ARES-MISSION-01/aar-report/html](http://localhost:8000/api/v1/missions/ARES-MISSION-01/aar-report/html)
- **Documentación Swagger / OpenAPI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Endpoint WebSocket**: `ws://localhost:8000/ws/telemetry`

### 3. Ejecutar Pruebas
```bash
uv run python tests/test_tactical_advancements.py
uv run python tests/test_c2_extensions.py
uv run python tests/test_advanced_backend.py
uv run python tests/test_swarm.py
uv run python tests/test_detection.py
```

### 4. Lanzar Consola de Campo TUI (Terminal Rugged / SSH)
```bash
uv run python scripts/tactical_tui.py
```

### 5. Simular Ingesta del Motor de IA (Edge AI Companion)
```bash
uv run python scripts/mock_edge_ai.py
```

---

## 📡 Contrato de Telemetría WebSocket (Ejemplo de Frame a 20 Hz)

```json
{
  "frame_sequence": 1420,
  "timestamp": 1758037200.12,
  "frequency_hz": 20,
  "active_drones_count": 3,
  "drones": [
    {
      "drone_id": "ARES-01",
      "timestamp": 1758037200.12,
      "lat": -12.04635,
      "lon": -77.04278,
      "alt": 28.5,
      "velocity": { "x": 4.5, "y": 2.1, "z": 0.2 },
      "orientation": { "roll": 2.1, "pitch": -1.4, "yaw": 65.0 },
      "speed_ms": 6.5,
      "battery": 94.2,
      "fsm_state": "IN_FLIGHT",
      "in_safety_breach": false,
      "nearest_peer_id": "ARES-02",
      "nearest_distance_m": 42.1,
      "evasion_vector": null
    }
  ],
  "active_alerts": []
}
```
