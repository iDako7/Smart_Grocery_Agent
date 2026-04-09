"""Async database engine and session factory."""

import os
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    create_async_engine,
)

_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    """Return the singleton async engine, creating it on first call."""
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL", "")
        if not url:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        _engine = create_async_engine(url, pool_pre_ping=True)
    return _engine


async def get_db() -> AsyncIterator[AsyncConnection]:
    """FastAPI dependency that yields an async connection."""
    engine = get_engine()
    async with engine.connect() as conn:
        yield conn


def reset_engine() -> None:
    """Reset the global engine (for testing)."""
    global _engine
    _engine = None
