import os
import tempfile
import pytest
from httpx import AsyncClient, ASGITransport
import aiosqlite

from src.database.db import get_db, init_db
from src.database.seed import seed_database
from src.api.main import app

@pytest.fixture(scope="session")
def test_db_path():
    fd, path = tempfile.mkstemp(suffix="_test_ares.db")
    os.close(fd)
    seed_database(path)
    yield path
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass

@pytest.fixture
async def async_client(test_db_path):
    async def override_get_db():
        async with aiosqlite.connect(test_db_path, timeout=30.0) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys = ON;")
            await db.execute("PRAGMA journal_mode = WAL;")
            yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
