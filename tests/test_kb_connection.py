"""Tests for get_kb() async context manager behavior.

get_kb() must work as an async context manager so callers cannot forget
to close the connection — the connection is automatically closed on exit.
"""

import os
import tempfile
from unittest.mock import patch

import pytest
from src.ai.kb import get_kb


def _make_tmp_sqlite() -> str:
    """Create a temporary SQLite file and return its path."""
    import asyncio

    import aiosqlite

    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        tmp_path = f.name

    async def _init():
        async with aiosqlite.connect(tmp_path) as db:
            await db.commit()

    asyncio.get_event_loop().run_until_complete(_init())
    return tmp_path


# ---------------------------------------------------------------------------
# Context manager interface
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_kb_is_async_context_manager():
    """get_kb() must be usable with `async with` and yield a working connection."""
    import aiosqlite

    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        tmp_path = f.name

    async with aiosqlite.connect(tmp_path) as setup_db:
        await setup_db.commit()

    with patch.dict(os.environ, {"KB_SQLITE_PATH": tmp_path}):
        async with get_kb() as db:
            cursor = await db.execute("SELECT 1")
            row = await cursor.fetchone()
            assert row is not None
            assert row[0] == 1


@pytest.mark.asyncio
async def test_get_kb_closes_connection_on_normal_exit():
    """Connection is closed even when the body completes normally."""
    import aiosqlite

    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        tmp_path = f.name

    async with aiosqlite.connect(tmp_path) as setup_db:
        await setup_db.commit()

    closed_connections: list[bool] = []
    original_connect = aiosqlite.connect

    async def patched_connect(*args, **kwargs):
        real_conn = await original_connect(tmp_path)

        class TrackingConn:
            row_factory = None

            async def execute(self, *a, **kw):
                return await real_conn.execute(*a, **kw)

            async def close(self):
                closed_connections.append(True)
                await real_conn.close()

        return TrackingConn()

    with patch("src.ai.kb.aiosqlite.connect", side_effect=patched_connect):
        with patch.dict(os.environ, {"KB_SQLITE_PATH": tmp_path}):
            async with get_kb() as _db:
                pass  # normal exit

    assert len(closed_connections) == 1, "Connection must be closed on normal exit"


@pytest.mark.asyncio
async def test_get_kb_closes_connection_on_exception():
    """Connection is closed even when the body raises an exception."""
    import aiosqlite

    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        tmp_path = f.name

    async with aiosqlite.connect(tmp_path) as setup_db:
        await setup_db.commit()

    closed_connections: list[bool] = []
    original_connect = aiosqlite.connect

    async def patched_connect(*args, **kwargs):
        real_conn = await original_connect(tmp_path)

        class TrackingConn:
            row_factory = None

            async def execute(self, *a, **kw):
                return await real_conn.execute(*a, **kw)

            async def close(self):
                closed_connections.append(True)
                await real_conn.close()

        return TrackingConn()

    with patch("src.ai.kb.aiosqlite.connect", side_effect=patched_connect):
        with patch.dict(os.environ, {"KB_SQLITE_PATH": tmp_path}):
            with pytest.raises(ValueError, match="test error"):
                async with get_kb() as _db:
                    raise ValueError("test error")

    assert len(closed_connections) == 1, "Connection must be closed even when exception raised"


@pytest.mark.asyncio
async def test_get_kb_sets_row_factory():
    """get_kb() must set row_factory = aiosqlite.Row on the connection."""
    import aiosqlite

    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        tmp_path = f.name

    async with aiosqlite.connect(tmp_path) as setup_db:
        await setup_db.commit()

    with patch.dict(os.environ, {"KB_SQLITE_PATH": tmp_path}):
        async with get_kb() as db:
            assert db.row_factory is aiosqlite.Row
