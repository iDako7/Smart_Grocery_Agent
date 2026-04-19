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


def _normalize_for_asyncpg(url: str) -> tuple[str, dict]:
    """Coerce a postgres URL into the form `create_async_engine` wants.

    Returns (normalized_url, connect_args). Fly.io (and Heroku-style
    providers) inject `DATABASE_URL` as `postgres://…?sslmode=disable`.
    asyncpg does not honor libpq's `sslmode` — if we just strip it, asyncpg
    defaults to attempting TLS and Fly's internal Postgres reset the
    handshake. So we translate `sslmode` into a `connect_args={"ssl": …}`
    entry that asyncpg actually respects.
    """
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    parsed = urlparse(url)
    query_pairs = parse_qsl(parsed.query)
    sslmode = next((v for k, v in query_pairs if k == "sslmode"), None)
    remaining = [(k, v) for k, v in query_pairs if k != "sslmode"]
    connect_args: dict = {}
    if sslmode == "disable":
        connect_args["ssl"] = False
    elif sslmode in ("require", "verify-ca", "verify-full"):
        connect_args["ssl"] = True
    return urlunparse(parsed._replace(query=urlencode(remaining))), connect_args


def get_engine() -> AsyncEngine:
    """Return the singleton async engine, creating it on first call."""
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL", "")
        if not url:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        normalized_url, connect_args = _normalize_for_asyncpg(url)
        _engine = create_async_engine(
            normalized_url, pool_pre_ping=True, connect_args=connect_args
        )
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
