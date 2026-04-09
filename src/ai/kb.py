"""SQLite KB connection manager for read-only knowledge base access."""

import os
from pathlib import Path

import aiosqlite

_DEFAULT_KB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "kb.sqlite"


def _kb_path() -> str:
    return os.environ.get("KB_SQLITE_PATH", str(_DEFAULT_KB_PATH))


async def get_kb() -> aiosqlite.Connection:
    """Open a read-only connection to the KB SQLite database."""
    db = await aiosqlite.connect(f"file:{_kb_path()}?mode=ro", uri=True)
    db.row_factory = aiosqlite.Row
    return db
