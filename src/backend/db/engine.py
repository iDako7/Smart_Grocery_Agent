"""Async database engine and session factory."""

import os
from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    create_async_engine,
)

_engine: AsyncEngine | None = None


def _normalize_for_asyncpg(url: str) -> str:
    """Coerce a postgres URL into the form `create_async_engine` wants.

    Fly.io (and Heroku-style providers) inject `DATABASE_URL` as
    `postgres://…?sslmode=disable`. SQLAlchemy's async engine needs the
    explicit `postgresql+asyncpg://` driver prefix and does not recognize
    the libpq `sslmode` query parameter (asyncpg uses `ssl=` instead).
    """
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    parsed = urlparse(url)
    params = [(k, v) for k, v in parse_qsl(parsed.query) if k != "sslmode"]
    return urlunparse(parsed._replace(query=urlencode(params)))


def get_engine() -> AsyncEngine:
    """Return the singleton async engine, creating it on first call."""
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL", "")
        if not url:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        _engine = create_async_engine(_normalize_for_asyncpg(url), pool_pre_ping=True)
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
