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

@app.get("/", response_class=HTMLResponse)
async def tactical_dashboard():
    return """
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>ARES - Centro de Comando Táctico</title>
        <style>
            body { background-color: #0b0f19; color: #00ffcc; font-family: 'Consolas', monospace; padding: 20px; }
            h1 { color: #00ffcc; text-shadow: 0 0 10px #00ffcc; }
            .card { background: #151d2f; border: 1px solid #00ffcc; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 0 15px rgba(0,255,204,0.2); }
            .badge { background: #00ffcc; color: #0b0f19; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
            a { color: #00ffcc; text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>ARES // TACTICAL COMMAND CENTER</h1>
        <div class="card">
            <p><span class="badge">SYSTEM READY</span> Modo Edge Computing local activado.</p>
            <p><strong>Base de Datos:</strong> SQLite en modo WAL (In-Memory / Local Disk)</p>
            <p><strong>Inferencia RL:</strong> Reactiva (< 50 ms SLA)</p>
            <p><strong>Documentación de API interactiva:</strong> <a href="/docs" target="_blank">/docs (Swagger UI)</a></p>
        </div>
    </body>
    </html>
    """
