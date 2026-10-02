import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

from src.database.db import init_db
from src.database.seed import seed_database
from src.api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize and seed local SQLite database on startup
    seed_database()
    yield


app = FastAPI(
    title="ARES - Autonomous Rescue Emergency System",
    version="1.0.0-MVP",
    description="Edge Swarm Orchestration & Mission Control API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail)}}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Error de validación en los parámetros de la solicitud",
                "details": exc.errors()
            }
        }
    )

app.include_router(router)

@app.get("/health")
async def health_check():
    return {"status": "HEALTHY", "system": "ARES Edge Core", "mode": "WAL"}

# Enhanced Tactical Command Dashboard with full JavaScript frontend integration
DASHBOARD_HTML = '''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>ARES - Centro de Comando Táctico</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --bg:#0b0f19;
            --card:#151d2f;
            --accent:#00ffcc;
            --text:#e0e8f0;
            --muted:#6a7a8c;
            --error:#ff5555;
            --success:#00ff88;
        }
        
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        
        h1 {
            color: var(--accent);
            text-shadow: 0 0 20px var(--accent);
            text-align: center;
            margin-bottom: 25px;
            font-size: 2.2rem;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        /* Auth Section */
        #auth-section {
            background: var(--card);
            border: 1px solid var(--accent);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 25px;
            text-align: center;
        }
        
        #auth-section.hidden {
            display: none;
        }
        
        #login-form {
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-width: 320px;
            margin: 0 auto;
        }
        
        .form-group {
            display: flex;
            flex-direction: column;
        }
        
        .form-group label {
            color: var(--muted);
            margin-bottom: 6px;
            font-size: 0.85rem;
        }
        
        .form-group input {
            background: var(--bg);
            color: var(--text);
            border: 1px solid var(--muted);
            border-radius: 6px;
            padding: 10px 14px;
            font-size: 1rem;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-top: 8px;
        }
        
        .btn-primary {
            background: var(--accent);
            color: var(--bg);
        }
        
        .btn-primary:hover {
            box-shadow: 0 0 20px rgba(0, 255, 204, 0.4);
            transform: translateY(-2px);
        }
        
        .btn-secondary {
            background: var(--bg);
            color: var(--accent);
            border: 1px solid var(--accent);
        }
        
        .btn-secondary:hover {
            background: var(--accent);
            color: var(--bg);
        }
        
        .btn-danger {
            background: var(--error);
            color: white;
        }
        
        .btn-danger:hover {
            box-shadow: 0 0 20px rgba(255, 85, 85, 0.4);
        }
        
        .btn-small {
            padding: 8px 16px;
            font-size: 0.75rem;
        }
        
        /* Status Cards Grid */
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .card {
            background: var(--card);
            border: 1px solid var(--muted);
            border-radius: 10px;
            padding: 20px;
            transition: all 0.3s ease;
        }
        
        .card:hover {
            border-color: var(--accent);
            box-shadow: 0 0 15px rgba(0, 255, 204, 0.15);
        }
        
        .card.bold {
            border-color: var(--accent);
            box-shadow: 0 0 20px rgba(0, 255, 204, 0.3);
        }
        
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .badge-online {
            background: var(--accent);
            color: var(--bg);
        }
        
        .badge-offline {
            background: var(--muted);
            color: var(--bg);
        }
        
        .badge-warning {
            background: #ffaa00;
            color: var(--bg);
        }
        
        /* Mission Form Section */
        #mission-section {
            background: var(--card);
            border: 1px solid var(--muted);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 25px;
        }
        
        #mission-section.hidden {
            display: none;
        }
        
        .section-title {
            color: var(--accent);
            margin-top: 0;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--muted);
        }
        
        /* Form Layouts */
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px 20px;
            margin-bottom: 15px;
        }
        
        .form-row-full {
            grid-template-columns: 1fr;
            gap: 15px;
            margin-bottom: 15px;
        }
        
        .form-section {
            margin-bottom: 20px;
        }
        
        .form-section h3 {
            color: var(--muted);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--muted);
        }
        
        /* Input styles for mission form */
        .mission-input {
            width: 100%;
            padding: 10px;
            background: var(--bg);
            color: var(--text);
            border: 1px solid var(--muted);
            border-radius: 6px;
            font-size: 0.9rem;
        }
        
        .mission-input:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
        }
        
        /* Table styles */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        
        th {
            background: var(--bg);
            color: var(--accent);
            padding: 10px;
            text-align: left;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        td {
            padding: 10px;
            border-bottom: 1px solid var(--muted);
        }
        
        tr:hover td {
            background: rgba(0, 255, 204, 0.05);
        }
        
        /* Route calculation table */
        .waypoints-table {
            margin-top: 15px;
        }
        
        .waypoints-table th {
            background: transparent;
        }
        
        .waypoints-table td {
            border-bottom: 1px solid var(--muted);
            font-size: 0.8rem;
        }
        
        /* Status indicators */
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
        }
        
        .status-idle { background: var(--success); }
        .status-routing { background: #ffaa00; }
        .status-inflight { background: #ff6b6b; }
        .status-returning { background: #ffd93d; }
        .status-maintenance { background: #888888; }
        
        /* Alert banner */
        .alert {
            padding: 12px 18px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 0.9rem;
        }
        
        .alert-error {
            background: rgba(255, 85, 85, 0.15);
            color: var(--error);
            border: 1px solid var(--error);
        }
        
        .alert-success {
            background: rgba(0, 255, 136, 0.15);
            color: var(--success);
            border: 1px solid var(--success);
        }
        
        .alert-info {
            background: rgba(0, 255, 204, 0.1);
            color: var(--accent);
            border: 1px solid var(--accent);
        }
        
        /* Loading spinner */
        .spinner {
            width: 20px;
            height: 20px;
            border: 3px solid var(--muted);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            display: none;
            margin: 20px auto;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        @media (prefers-reduced-motion: reduce) {
            .spinner {
                animation: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Authentication Section -->
        <div id="auth-section">
            <h1>ARES // TACTICAL COMMAND CENTER</h1>
            <div class="alert alert-info">
                <span class="badge">SYSTEM READY</span> Modo Edge Computing local activado. Base de Datos: SQLite en modo WAL. Ingrese sus credenciales para acceder al panel de control.
            </div>
            <form id="login-form">
                <div class="form-group">
                    <label>Nombre de usuario</label>
                    <input type="text" id="username" required>
                </div>
                <div class="form-group">
                    <label>Contraseña</label>
                    <input type="password" id="password" required>
                </div>
                <button type="submit" class="btn btn-primary">Iniciar Sesión</button>
            </form>
        </div>
        
        <!-- Main Application Section -->
        <div id="app-section" class="hidden">
            <!-- Status Cards -->
            <div class="cards-grid">
                <div id="card-system" class="card">
                    <div>
                        <span class="badge badge-online" id="status-indicator">SISTEMA ACTIVO</span>
                    </div>
                    <p><strong>Base de Datos:</strong> <span id="db-status">Cargando...</span></p>
                    <p><strong>Inferencia RL:</strong> <span id="inference-status">Cargando...</span></p>
                </div>
                
                <div id="card-missions" class="card">
                    <div>
                        <span class="badge" id="mission-count">0</span> misiones
                    </div>
                    <p><strong>Activas:</strong> <span id="active-missions">0</span></p>
                </div>
                
                <div id="card-fleet" class="card">
                    <div>
                        <span class="badge" id="fleet-size">12</span> drones
                    </div>
                    <p><strong>IDLE:</strong> <span id="idle-count">4</span></p>
                </div>
                
                <div id="card-alerts" class="card">
                    <div>
                        <span class="badge badge-warning" id="alerts-count">0</span> alertas
                    </div>
                </div>
            </div>
            
            <!-- Mission Planning Section -->
            <div id="mission-section">
                <h2 class="section-title">Planificación de Misión Médica</h2>
                
                <form id="mission-form">
                    <div class="form-section">
                        <h3>Ubicación y Destino</h3>
                        <div class="form-row">
                            <div>
                                <label>Origen - Latitud</label>
                                <input type="number" id="origin-lat" class="mission-input" step="0.000001" required>
                            </div>
                            <div>
                                <label>Origen - Longitud</label>
                                <input type="number" id="origin-lon" class="mission-input" step="0.000001" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div>
                                <label>Origen - Altura (m)</label>
                                <input type="number" id="origin-alt" class="mission-input" step="0.1" value="150" required>
                            </div>
                            <div>
                                <label>Destino - Latitud</label>
                                <input type="number" id="dest-lat" class="mission-input" step="0.000001" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div>
                                <label>Destino - Longitud</label>
                                <input type="number" id="dest-lon" class="mission-input" step="0.000001" required>
                            </div>
                            <div>
                                <label>Destino - Altura (m)</label>
                                <input type="number" id="dest-alt" class="mission-input" step="0.1" value="120" required>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3>Parámetros de Misión</h3>
                        <div class="form-row">
                            <div>
                                <label>Prioridad</label>
                                <select id="priority" class="mission-input" required>
                                    <option value="GOLDEN_HOUR_CRITICAL">GOLDEN_HOUR_CRITICAL (60 min)</option>
                                    <option value="HIGH">HIGH (120 min)</option>
                                    <option value="STANDARD">STANDARD (240 min)</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div>
                                <label>Tamaño enjambre</label>
                                <input type="number" id="swarm-size" class="mission-input" min="1" value="2" required>
                            </div>
                            <div>
                                <label>Simular obstáculos dinámicos</label>
                                <select id="obstacle-sim" class="mission-input" required>
                                    <option value="true">Simular (test)</option>
                                    <option value="false">No simular</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3>Carga Médica</h3>
                        <p>IDs de insumos médicos y cantidades</p>
                        <div id="supplies-list">
                            <div class="supply-row" data-index="0">
                                <input type="number" class="mission-input" placeholder="ID suministro" data-field="supply_id">
                                <input type="number" class="mission-input" placeholder="Cantidad" data-field="quantity" min="1" value="1">
                                <button type="button" class="btn btn-danger btn-small" onclick="removeSupplyRow(this)">Quitar</button>
                            </div>
                        </div>
                        <button type="button" class="btn btn-secondary btn-small" onclick="addSupplyRow()">Añadir insumo</button>
                    </div>
                    
                    <div class="form-row">
                        <div>
                            <label>Despegue programado</label>
                            <input type="datetime-local" id="scheduled-departure" class="mission-input" required>
                        </div>
                    </div>
                    
                    <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
                        Crear Misión
                    </button>
                </form>
            </div>
            
            <!-- Route Calculation Section -->
            <div id="route-section" class="hidden">
                <h2 class="section-title">Cálculo de Trayectoria 3D</h2>
                <p class="alert alert-info" id="route-status">Ingrese una misión y calcule la ruta</p>
                
                <div id="route-results" class="hidden">
                    <div class="cards-grid" id="routes-grid">
                        <!-- Routes will be populated here -->
                    </div>
                    
                    <div id="waypoints-section" class="hidden">
                        <h3>Waypoints de la Trayectoria</h3>
                        <table class="waypoints-table">
                            <thead>
                                <tr>
                                    <th>Seq</th>
                                    <th>Latitud</th>
                                    <th>Longitud</th>
                                    <th>Altura</th>
                                    <th>Velocidad</th>
                                    <th>Offset (ms)</th>
                                </tr>
                            </thead>
                            <tbody id="waypoints-body">
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <button onclick="window.location.reload()" class="btn btn-secondary">Nueva misión</button>
            </div>
            
            <!-- Dispatch Section -->
            <div id="dispatch-section" class="hidden">
                <h2 class="section-title">Despacho de Misión</h2>
                <p class="alert alert-info" id="dispatch-status">Calcule la ruta primero</p>
                
                <button id="dispatch-btn" class="btn btn-primary" disabled>
                    Confirmar Despacho
                </button>
            </div>
            
            <!-- Benchmark Section -->
            <div id="benchmark-section" class="hidden">
                <h2 class="section-title">Benchmark de Evasión Dinámica</h2>
                <p class="alert alert-info">Ejecuta la simulación con 500 obstáculos para certificar el criterio de charter (>95% éxito)</p>
                
                <form id="benchmark-form">
                    <input type="hidden" id="benchmark-mission-id">
                    <div class="form-row">
                        <div>
                            <label>Obstáculos a inyectar</label>
                            <input type="number" id="benchmark-obstacles" class="mission-input" min="1" value="500" required>
                        </div>
                        <div>
                            <label>Rango de velocidad (m/s)</label>
                            <input type="number" id="benchmark-speed" class="mission-input" min="0.1" value="12" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div>
                            <label>Radio obstáculos (m)</label>
                            <input type="number" id="benchmark-radius" class="mission-input" min="0.1" value="4" required>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
                        Ejecutar Benchmark
                    </button>
                </form>
                
                <div id="benchmark-results" class="hidden">
                    <div class="alert alert-success">
                        <strong>Éxito:</strong> Tasa de evasión <span id="success-rate">--</span>%, 
                        <span id="collisions">--</span> colisiones de <span id="total-obs">--</span> obstáculos
                    </div>
                    <div class="alert alert-info">
                        Latencia de recálculo: <span id="latency">--</span> ms
                    </div>
                </div>
            </div>
            
            <!-- Telemetry Ingestion Section -->
            <div id="telemetry-section" class="hidden">
                <h2 class="section-title">Ingesta de Telemetría</h2>
                <p class="alert alert-info">Ingrese datos de telemetría en tiempo real</p>
                
                <form id="telemetry-form">
                    <div class="form-row">
                        <div>
                            <label>ID Drone</label>
                            <input type="number" id="telemetry-drone" class="mission-input" min="1" required>
                        </div>
                        <div>
                            <label>ID Misión</label>
                            <input type="number" id="telemetry-mission" class="mission-input" min="1" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div>
                            <label>Latitud actual</label>
                            <input type="number" id="telemetry-lat" class="mission-input" step="0.000001" required>
                        </div>
                        <div>
                            <label>Longitud actual</label>
                            <input type="number" id="telemetry-lon" class="mission-input" step="0.000001" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div>
                            <label>Altura actual (m)</label>
                            <input type="number" id="telemetry-alt" class="mission-input" step="0.1" required>
                        </div>
                        <div>
                            <label>Velocidad actual (m/s)</label>
                            <input type="number" id="telemetry-speed" class="mission-input" step="0.1" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div>
                            <label>Batería (%)</label>
                            <input type="number" id="telemetry-battery" class="mission-input" min="0" max="100" required>
                        </div>
                        <div>
                            <label>SNR señal (dB)</label>
                            <input type="number" id="telemetry-snr" class="mission-input" required>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
                        Enviar Telemetría
                    </button>
                </form>
            </div>
        </div>
    </div>

    <script>
        // API Base URL
        const API_BASE = '/api/v1';
        
        // Authentication state
        let currentToken = null;
        let currentOperator = null;
        
        // DOM Elements
        const authSection = document.getElementById('auth-section');
        const appSection = document.getElementById('app-section');
        const loginForm = document.getElementById('login-form');
        const missionForm = document.getElementById('mission-form');
        const routeSection = document.getElementById('route-section');
        const dispatchSection = document.getElementById('dispatch-section');
        const benchmarkSection = document.getElementById('benchmark-section');
        const telemetrySection = document.getElementById('telemetry-section');
        
        // Status indicators
        const statusIndicator = document.getElementById('status-indicator');
        const dbStatus = document.getElementById('db-status');
        const inferenceStatus = document.getElementById('inference-status');
        const missionCount = document.getElementById('mission-count');
        const activeMissions = document.getElementById('active-missions');
        const fleetSize = document.getElementById('fleet-size');
        const idleCount = document.getElementById('idle-count');
        const alertsCount = document.getElementById('alerts-count');
        
        // Mission form elements
        const originLat = document.getElementById('origin-lat');
        const originLon = document.getElementById('origin-lon');
        const originAlt = document.getElementById('origin-alt');
        const destLat = document.getElementById('dest-lat');
        const destLon = document.getElementById('dest-lon');
        const destAlt = document.getElementById('dest-alt');
        const prioritySelect = document.getElementById('priority');
        const swarmSize = document.getElementById('swarm-size');
        const obstacleSim = document.getElementById('obstacle-sim');
        const suppliesList = document.getElementById('supplies-list');
        const scheduledDeparture = document.getElementById('scheduled-departure');
        
        // Route results elements
        const routesGrid = document.getElementById('routes-grid');
        const waypointsSection = document.getElementById('waypoints-section');
        const waypointsBody = document.getElementById('waypoints-body');
        
        // Dispatch elements
        const dispatchBtn = document.getElementById('dispatch-btn');
        const dispatchStatus = document.getElementById('dispatch-status');
        
        // Benchmark elements
        const benchmarkForm = document.getElementById('benchmark-form');
        const benchmarkMissionId = document.getElementById('benchmark-mission-id');
        const benchmarkObstacles = document.getElementById('benchmark-obstacles');
        const benchmarkSpeed = document.getElementById('benchmark-speed');
        const benchmarkRadius = document.getElementById('benchmark-radius');
        const successRate = document.getElementById('success-rate');
        const collisions = document.getElementById('collisions');
        const totalObs = document.getElementById('total-obs');
        const latency = document.getElementById('latency');
        
        // Telemetry elements
        const telemetryForm = document.getElementById('telemetry-form');
        const telemetryDrone = document.getElementById('telemetry-drone');
        const telemetryMission = document.getElementById('telemetry-mission');
        const telemetryLat = document.getElementById('telemetry-lat');
        const telemetryLon = document.getElementById('telemetry-lon');
        const telemetryAlt = document.getElementById('telemetry-alt');
        const telemetrySpeed = document.getElementById('telemetry-speed');
        const telemetryBattery = document.getElementById('telemetry-battery');
        const telemetrySnr = document.getElementById('telemetry-snr');
        
        // Spinner element
        const spinner = document.querySelector('.spinner');
        
        // Initialize: check for existing token
        document.addEventListener('DOMContentLoaded', () => {
            const token = localStorage.getItem('ares_token');
            if (token) {
                currentToken = token;
                currentOperator = JSON.parse(localStorage.getItem('ares_operator') || 'null');
                showApp();
                loadInitialData();
            }
        });
        
        // Show/hide sections
        function showApp() {
            authSection.classList.add('hidden');
            appSection.classList.remove('hidden');
        }
        
        function showSection(sectionId) {
            // Hide all sections
            ['mission-section', 'route-section', 'dispatch-section', 'benchmark-section', 'telemetry-section']
                .forEach(id => document.getElementById(id).classList.add('hidden'));
            // Show selected
            document.getElementById(sectionId).classList.remove('hidden');
        }
        
        // Auth API calls
        async function apiFetch(endpoint, options = {}) {
            const url = `${API_BASE}${endpoint}`;
            const defaults = {
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options
            };
            
            if (currentToken) {
                defaults.headers['Authorization'] = `Bearer ${currentToken}`;
            }
            
            const response = await fetch(url, defaults);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error en la petición');
            }
            
            return data;
        }
        
        async function apiFetchAuth(endpoint, options = {}) {
            const url = `${API_BASE}${endpoint}`;
            const defaults = {
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options
            };
            
            const response = await fetch(url, defaults);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error en la petición');
            }
            
            return data;
        }
        
        // Login
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementId('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const data = await apiFetchAuth('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username, password })
                });
                
                currentToken = data.token;
                currentOperator = data.operator;
                
                // Store in localStorage
                localStorage.setItem('ares_token', currentToken);
                localStorage.setItem('ares_operator', JSON.stringify(currentOperator));
                
                showApp();
                loadInitialData();
            } catch (error) {
                showAlert('auth-section', `Error: ${error.message}`, 'error');
            }
        });
        
        // Logout
        function logout() {
            currentToken = null;
            currentOperator = null;
            localStorage.removeItem('ares_token');
            localStorage.removeItem('ares_operator');
            showSection('auth');
            authSection.classList.remove('hidden');
            appSection.classList.add('hidden');
        }
        
        // Show alert
        function showAlert(sectionId, message, type = 'info') {
            const section = document.getElementById(sectionId);
            const alert = section.querySelector('.alert') || createAlert(section);
            alert.className = `alert alert-${type}`;
            alert.textContent = message;
            
            setTimeout(() => {
                alert.style.display = 'none';
            }, 5000);
        }
        
        function createAlert(section) {
            const alert = document.createElement('div');
            alert.className = 'alert alert-info';
            alert.style.marginTop = '10px';
            section.appendChild(alert);
            return alert;
        }
        
        // Load initial data
        async function loadInitialData() {
            try {
                // Load system status
                const sys = await apiFetch('/health');
                dbStatus.textContent = sys.status;
                inferenceStatus.textContent = 'Reactiva';
                
                // Load missions count
                const missions = await apiFetch('/missions');
                const missionCountVal = missions.length || 0;
                missionCount.textContent = missionCountVal;
                activeMissions.textContent = Math.max(0, missionCountVal - 2);
                
                // Load fleet info
                fleetSize.textContent = '12';
                idleCount.textContent = '4';
                
            } catch (error) {
                console.error('Error loading initial data:', error);
            }
        }
        
        // Add supply row
        function addSupplyRow() {
            const index = suppliesList.querySelectorAll('.supply-row').length;
            const row = document.createElement('div');
            row.className = 'supply-row';
            row.setAttribute('data-index', index);
            row.innerHTML = `
                <input type="number" class="mission-input" placeholder="ID suministro" data-field="supply_id">
                <input type="number" class="mission-input" placeholder="Cantidad" data-field="quantity" min="1" value="1">
                <button type="button" class="btn btn-danger btn-small" onclick="removeSupplyRow(this)">Quitar</button>
            `;
            suppliesList.appendChild(row);
        }
        
        // Remove supply row
        function removeSupplyRow(button) {
            const row = button.parentElement;
            row.parentElement.removeChild(row);
        }
        
        // Mission form submit
        missionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Collect supplies
            const supplies = [];
            document.querySelectorAll('.supply-row').forEach(row => {
                const supplyId = row.querySelector('[data-field="supply_id"]').value;
                const quantity = row.querySelector('[data-field="quantity"]').value;
                if (supplyId) {
                    supplies.push({ supply_id: parseInt(supplyId), quantity: parseInt(quantity) || 1 });
                }
            });
            
            const missionData = {
                origin: {
                    latitude: parseFloat(originLat.value),
                    longitude: parseFloat(originLon.value),
                    altitude_meters: parseFloat(originAlt.value)
                },
                destination: {
                    latitude: parseFloat(destLat.value),
                    longitude: parseFloat(destLon.value),
                    altitude_meters: parseFloat(destAlt.value)
                },
                priority_code: prioritySelect.value,
                scheduled_departure_time: scheduledDeparture.value,
                supplies: supplies,
                required_swarm_size: parseInt(swarmSize.value),
                dynamic_obstacle_simulation: obstacleSim.value === 'true'
            };
            
            try {
                showSpinner();
                const result = await apiFetch('/missions', {
                    method: 'POST',
                    body: JSON.stringify(missionData)
                });
                
                hideSpinner();
                showAlert('app-section', `Misión creada: ${result.mission_code} - Estado: ${result.status}`, 'success');
                
                // Switch to route calculation
                loadMissions();
            } catch (error) {
                hideSpinner();
                showAlert('app-section', `Error: ${error.message}`, 'error');
            }
        });
        
        // Load missions
        async function loadMissions() {
            try {
                const missions = await apiFetch('/missions');
                renderMissions(missions);
            } catch (error) {
                console.error('Error loading missions:', error);
            }
        }
        
        function renderMissions(missions) {
            if (missions && missions.length > 0) {
                const last = missions[missions.length - 1];
                showAlert('app-section', `Misión ${last.mission_code} cargada`, 'success');
                
                // Show route calculation section
                showSection('route-section');
                
                // Calculate route
                calculateRoute(last.mission_id);
            }
        }
        
        // Calculate route
        async function calculateRoute(missionId) {
            try {
                const result = await apiFetch(`/missions/${missionId}/route/calculate`, {
                    method: 'POST',
                    body: JSON.stringify({
                        required_swarm_size: parseInt(swarmSize.value),
                        dynamic_obstacle_simulation: obstacleSim.value === 'true',
                        environmental_factors: {
                            wind_vector_mps: [2.1, -1.0, 0.0],
                            no_fly_zones: []
                        }
                    })
                });
                
                renderRoutes(result);
            } catch (error) {
                showAlert('route-section', `Error: ${error.message}`, 'error');
            }
        }
        
        // Render routes
        function renderRoutes(result) {
            if (!result.routes || result.routes.length === 0) {
                showAlert('route-section', 'No hay drones disponibles para la misión', 'warning');
                return;
            }
            
            routesGrid.innerHTML = '';
            
            result.routes.forEach((route, idx) => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <h3>Dron ${route.drone_id} - ${route.swarm_role}</h3>
                    <p>Latencia: ${result.computation_latency_ms} ms</p>
                    <p>Distancia total: ${route.total_distance_meters.toFixed(1)} m</p>
                    <p>Tiempo estimado: ${route.estimated_flight_seconds} s</p>
                    <p>Waypoints generados: ${route.waypoints_generated}</p>
                `;
                routesGrid.appendChild(card);
            });
            
            // Show waypoints for first route
            if (result.routes[0] && result.routes[0].trajectory_id) {
                showSection('route-section');
                loadWaypoints(result.routes[0].trajectory_id);
            } else {
                showSection('route-section');
            }
        }
        
        // Load waypoints
        async function loadWaypoints(trajectoryId) {
            try {
                const waypoints = await apiFetch(`/trajectories/${trajectoryId}/waypoints`);
                
                waypointsBody.innerHTML = '';
                
                if (waypoints && waypoints.length > 0) {
                    waypoints.forEach((wp, idx) => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${idx + 1}</td>
                            <td>${wp.latitude.toFixed(6)}</td>
                            <td>${wp.longitude.toFixed(6)}</td>
                            <td>${wp.altitude_meters.toFixed(1)}</td>
                            <td>${wp.target_speed_mps.toFixed(2)}</td>
                            <td>${wp.expected_timestamp_offset_ms}</td>
                        `;
                        waypointsBody.appendChild(row);
                    });
                }
                
                waypointsSection.classList.remove('hidden');
                showSection('route-section');
            } catch (error) {
                console.error('Error loading waypoints:', error);
            }
        }
        
        // Dispatch mission
        dispatchBtn.addEventListener('click', async () => {
            if (!confirm('¿Confirmar despacho de la misión ACTIVE?')) return;
            
            try {
                showSpinner();
                const result = await apiFetch('/missions/dispatch', {
                    method: 'POST'
                });
                
                hideSpinner();
                showAlert('dispatch-section', `Misión despachada a ${result.status} a las ${result.dispatched_at}`, 'success');
                
                // Switch sections
                showSection('app-section');
                loadInitialData();
            } catch (error) {
                hideSpinner();
                showAlert('dispatch-section', `Error: ${error.message}`, 'error');
            }
        });
        
        // Benchmark form submit
        benchmarkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const missionId = benchmarkMissionId.value;
            
            try {
                showSpinner();
                const result = await apiFetch('/simulations/benchmark', {
                    method: 'POST',
                    body: JSON.stringify({
                        mission_id: parseInt(missionId),
                        total_obstacles_injected: parseInt(benchmarkObstacles.value),
                        obstacle_speed_range_mps: [2.0, parseFloat(benchmarkSpeed.value)],
                        obstacle_radius_meters: parseFloat(benchmarkRadius.value)
                    })
                });
                
                hideSpinner();
                successRate.textContent = result.success_rate_percentage.toFixed(1);
                collisions.textContent = result.collisions_count;
                totalObs.textContent = result.total_obstacles_injected;
                latency.textContent = result.avg_recalculation_latency_ms.toFixed(1);
                
                charterMet = result.charter_criterion_met;
                showSection('benchmark-section');
                benchmarkResults.classList.remove('hidden');
                
                if (charterMet) {
                    showAlert('benchmark-section', 'Criterio de charter cumplido (>95% éxito)', 'success');
                } else {
                    showAlert('benchmark-section', 'Criterio de charter NO cumplido', 'warning');
                }
            } catch (error) {
                hideSpinner();
                showAlert('benchmark-section', `Error: ${error.message}`, 'error');
            }
        });
        
        // Telemetry form submit
        telemetryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const telemetryData = {
                drone_id: parseInt(telemetryDrone.value),
                mission_id: parseInt(telemetryMission.value),
                current_latitude: parseFloat(telemetryLat.value),
                current_longitude: parseFloat(telemetryLon.value),
                current_altitude_meters: parseFloat(telemetryAlt.value),
                current_speed_mps: parseFloat(telemetrySpeed.value),
                battery_percentage: parseFloat(telemetryBattery.value),
                signal_snr_db: parseFloat(telemetrySnr.value),
                timestamp_utc: new Date().toISOString()
            };
            
            try {
                const result = await apiFetch('/telemetry/ingest', {
                    method: 'POST',
                    body: JSON.stringify(telemetryData)
                });
                
                showAlert('telemetry-section', `Telemetría ${result.status} - Alerta: ${result.collision_alert ? 'COLISIÓN' : 'Normal'}`, result.collision_alert ? 'error' : 'success');
            } catch (error) {
                showAlert('telemetry-section', `Error: ${error.message}`, 'error');
            }
        });
        
        // Spinner control
        function showSpinner() {
            spinner.style.display = 'block';
        }
        
        function hideSpinner() {
            spinner.style.display = 'none';
        }
    </script>
</body>
</html>'''


@app.get("/", response_class=HTMLResponse)
async def tactical_dashboard():
    return HTMLResponse(content=DASHBOARD_HTML)