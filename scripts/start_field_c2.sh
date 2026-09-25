#!/usr/bin/env bash
# ==============================================================================
# ARES Tactical Swarm C2 - Field Launch Script (100% Offline)
# ==============================================================================
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "=================================================================="
echo "🚁 ARES Tactical Swarm Command & Control (C2) - Field Launch"
echo "=================================================================="

# 1. Verify Local Data Folders
mkdir -p data/snapshots data/flight_records

# 2. Check offline map
if [ -f "data/offline_map.mbtiles" ]; then
    echo "🗺️ [MAPS] Offline MBTiles map detected (data/offline_map.mbtiles)."
else
    echo "ℹ️ [MAPS] No offline MBTiles found; running synthetic radar coordinate grid."
fi

# 3. Check and build React 3D frontend if not built yet
if [ ! -f "dist/index.html" ]; then
    echo "📦 [FRONTEND] Compiling React 19 + Three.js 3D Frontend..."
    cd frontend && npm install && npm run build && cd ..
    echo "✅ [FRONTEND] Frontend compiled successfully to dist/."
fi

# 4. Check virtual environment or uv
if command -v uv &> /dev/null; then
    echo "⚡ [RUNTIME] Launching via uv on http://0.0.0.0:8000 ..."
    echo "🚀 3D Tactical SPA: http://localhost:8000/"
    echo "📡 Tactical HUD:    http://localhost:8000/hud"
    echo "📋 AAR Report:      http://localhost:8000/api/v1/missions/ARES-MISSION-01/aar-report/html"
    echo "📖 OpenAPI Docs:    http://localhost:8000/docs"
    echo "=================================================================="
    exec uv run uvicorn proyectocompe.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "⚠️ [RUNTIME] uv not found, falling back to system python3 ..."
    exec python3 -m uvicorn proyectocompe.main:app --host 0.0.0.0 --port 8000
fi
