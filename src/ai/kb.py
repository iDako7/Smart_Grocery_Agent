"""SQLite KB connection manager for read-only knowledge base access."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

_DEFAULT_KB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "kb.sqlite"


def _kb_path() -> str:
    return os.environ.get("KB_SQLITE_PATH", str(_DEFAULT_KB_PATH))


@asynccontextmanager
async def get_kb():
    """Open a read-only connection to the KB SQLite database.

    Use as an async context manager — the connection is automatically closed
    on exit, even if an exception is raised::

        async with get_kb() as db:
            cursor = await db.execute("SELECT 1")
    """
    db = await aiosqlite.connect(f"file:{_kb_path()}?mode=ro", uri=True)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
