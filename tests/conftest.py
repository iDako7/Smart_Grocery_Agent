"""Shared test fixtures — transaction-rollback PostgreSQL connection."""

import os
import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.pool import NullPool
from src.backend.db.tables import metadata

_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://sga:sga_dev@localhost:5432/sga",
)

_engine = create_async_engine(_TEST_DB_URL, poolclass=NullPool)
_tables_created = False


async def _ensure_tables() -> None:
    global _tables_created
    if not _tables_created:
        async with _engine.begin() as conn:
            await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))
            await conn.run_sync(metadata.create_all)
        _tables_created = True


@pytest_asyncio.fixture()
async def db() -> AsyncIterator[AsyncConnection]:
    """Per-test connection wrapped in a transaction that always rolls back.

    For unit tests that don't call commit(). API tests use their own
    truncation-based cleanup (see test_api_*.py).
    """
    await _ensure_tables()
    conn = await _engine.connect()
    txn = await conn.begin()
    try:
        yield conn
    finally:
        await txn.rollback()
        await conn.close()


@pytest_asyncio.fixture(autouse=True)
async def _fake_redis():
    """Replace the Redis singleton with a per-test fakeredis instance.

    Prevents two classes of test failures:
    - Cross-event-loop errors: real Redis connection attached to loop N reused
      in loop N+1 (pytest-asyncio creates a new loop per test).
    - CI failures when no Redis is available (localhost:6379 unreachable).
    """
    fake = fakeredis.aioredis.FakeRedis(decode_responses=False)
    with patch("src.ai.cache.wrapper.get_redis_client", new=AsyncMock(return_value=fake)):
        yield
    await fake.aclose()


@pytest.fixture()
def dev_user_id() -> uuid.UUID:
    return uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture()
async def seeded_user(db: AsyncConnection, dev_user_id: uuid.UUID) -> uuid.UUID:
    # Use INSERT ... ON CONFLICT to be idempotent (safe if API tests left data)
    await db.execute(
        text("INSERT INTO users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"),
        {"id": dev_user_id, "email": "dev@test.local"},
    )
    await db.execute(
        text("INSERT INTO user_profiles (user_id) VALUES (:uid) ON CONFLICT (user_id) DO NOTHING"), {"uid": dev_user_id}
    )
    return dev_user_id
