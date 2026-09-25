# Multi-stage Dockerfile for ARES Tactical C2 Backend + React 3D Frontend (Offline Deployment)
# Stage 1: Build Modern React 19 + TypeScript + Three.js Frontend
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python 3.12 Tactical C2 Backend
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, deterministic dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project specification files
COPY pyproject.toml uv.lock ./

# Install dependencies into virtual environment
RUN uv sync --frozen --no-install-project

# Copy project source code and static assets
COPY src/ ./src/
COPY static/ ./static/
COPY scripts/ ./scripts/
COPY README.md ./

# Copy compiled React 3D SPA from frontend builder
COPY --from=frontend-builder /app/dist ./dist

# Install the project itself
RUN uv sync --frozen

# Ensure data directories exist
RUN mkdir -p data/snapshots data/flight_records

EXPOSE 8000 14550/udp 4242/udp

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["uv", "run", "uvicorn", "proyectocompe.main:app", "--host", "0.0.0.0", "--port", "8000"]
