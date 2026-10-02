import os
import tempfile
import pytest
from httpx import AsyncClient, ASGITransport
import aiosqlite

from src.database.db import get_db
from src.database.seed import seed_database
from src.api.main import app

@pytest.fixture
def e2e_db_path():
    fd, path = tempfile.mkstemp(suffix="_e2e_ares.db")
    os.close(fd)
    seed_database(path)
    yield path
    for ext in ["", "-wal", "-shm"]:
        target = path + ext
        if os.path.exists(target):
            try:
                os.remove(target)
            except Exception:
                pass

@pytest.fixture
async def e2e_client(e2e_db_path):
    async def override_get_db():
        async with aiosqlite.connect(e2e_db_path, timeout=30.0) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys = ON;")
            await db.execute("PRAGMA journal_mode = WAL;")
            yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()

@pytest.fixture
async def auth_headers(e2e_client):
    res = await e2e_client.post("/api/v1/auth/login", json={
        "username": "operador_tactico",
        "password": "PasswordSeguro2026!"
    })
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def auth_token(auth_headers):
    return auth_headers["Authorization"].split(" ")[1]
