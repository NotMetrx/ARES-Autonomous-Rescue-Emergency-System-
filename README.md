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
* SQLite 3 con soporte WAL

## Ejecución del Servidor Táctico
```bash
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```
* **Dashboard Táctico:** `http://localhost:8000/`
* **Swagger UI / Documentación:** `http://localhost:8000/docs`

## Ejecución de la Suite de Pruebas
```bash
pytest
```
