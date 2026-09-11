# ARES: Autonomous Rescue Emergency System (Edge Core)

Plataforma unificada en Python puro para la orquestación autónoma de enjambres de drones de rescate en misiones críticas dentro de la **Hora Dorada** (<60 min).

## Arquitectura del Sistema

```
ares/
├── specs/
│   └── spec.md              # Documento formal de requerimientos y DDL 3NF
├── src/
│   ├── database/            # SQLite en modo WAL, DDL y seeders de catálogo
│   │   ├── schema.sql
│   │   ├── db.py
│   │   └── seed.py
│   ├── core/                # Invariantes de dominio, FSMs y esquemas Pydantic
│   │   ├── fsm.py
│   │   ├── rules.py
│   │   └── models.py
│   ├── ai/                  # Trayectorias 3D y motor de evasión reactiva (<50ms)
│   │   ├── trajectory.py
│   │   ├── evasion.py
│   │   └── benchmark.py
│   └── api/                 # API REST FastAPI & JWT HS256
│       ├── auth.py
│       ├── routes.py
│       └── main.py
└── tests/                   # Suite de pruebas automatizadas (TDD)
    ├── test_auth.py         # TEST-AUTH-001 a 004
    ├── test_domain.py       # TEST-DOM-001 a 005
    ├── test_database.py     # TEST-DB-001 y 002
    └── test_ai.py           # TEST-AI-001 y 002
```

## Requisitos de Ejecución
* Python 3.10+
* SQLite 3 con soporte WAL (`libsqlite3-dev` en Linux)

### Instalación en Linux (Ubuntu / Debian / Raspberry Pi / Jetson)
```bash
# 1. Dependencias del sistema (apt)
sudo apt update && sudo apt install -y python3-dev build-essential sqlite3 libsqlite3-dev

# 2. Entorno virtual e instalación de dependencias
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-linux.txt

# Para instalación ligera de PyTorch solo CPU en Linux:
# pip install torch --index-url https://download.pytorch.org/whl/cpu
```

## Ejecución del Servidor Táctico
```bash
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```
* **Dashboard Táctico:** `http://localhost:8000/`
* **Swagger UI / Documentación:** `http://localhost:8000/docs`

## Demostración en Vivo del Pipeline D-FINE & Evasión 3D
```bash
python demo_test.py
```

## Ejecución de la Suite de Pruebas (85 Tests)
```bash
pytest -v
```
