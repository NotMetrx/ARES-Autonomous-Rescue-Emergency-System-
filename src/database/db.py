import os
import sqlite3
from pathlib import Path
from typing import AsyncGenerator
import aiosqlite

DEFAULT_DB_PATH = os.getenv("ARES_DB_PATH", str(Path(__file__).parent.parent.parent / "ares.db"))
SCHEMA_FILE_PATH = Path(__file__).parent / "schema.sql"

def get_sync_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """Returns a synchronous SQLite connection with WAL mode and foreign keys enabled."""
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn

async def get_db(db_path: str = DEFAULT_DB_PATH) -> AsyncGenerator[aiosqlite.Connection, None]:
    """FastAPI dependency for obtaining an asynchronous SQLite connection."""
    async with aiosqlite.connect(db_path, timeout=30.0) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON;")
        await db.execute("PRAGMA journal_mode = WAL;")
        await db.execute("PRAGMA synchronous = NORMAL;")
        yield db

def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """Initializes the database schema using the DDL from schema.sql."""
    with get_sync_connection(db_path) as conn:
        with open(SCHEMA_FILE_PATH, "r", encoding="utf-8") as f:
            ddl_script = f.read()
        conn.executescript(ddl_script)
        conn.commit()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DEFAULT_DB_PATH)
