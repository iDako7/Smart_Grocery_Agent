"""Async Redis client singleton for the tool cache.

On first use the client is lazily created and pinged once. If the ping fails
(Redis unreachable), we log a warning and cache `None` so callers can degrade
gracefully without re-pinging on every call. Call `close_redis_client()` to
reset the singleton and force a fresh ping on the next `get_redis_client()`.
"""
from __future__ import annotations

import logging
import os

import redis.asyncio as redis
from redis.exceptions import ConnectionError, TimeoutError

logger = logging.getLogger(__name__)

_DEFAULT_URL = "redis://localhost:6379/0"

# Module-level singleton state.
# Sentinel distinguishes "not yet initialized" from "initialized as None (unavailable)".
_UNSET: object = object()
_client: redis.Redis | None | object = _UNSET


async def get_redis_client() -> redis.Redis | None:
    """Return the shared Redis client, or None if Redis is unreachable."""
    global _client
    if _client is not _UNSET:
        return _client  # type: ignore[return-value]

    url = os.getenv("REDIS_URL", _DEFAULT_URL)
    client = redis.from_url(url, decode_responses=False)
    try:
        await client.ping()
    except (ConnectionError, TimeoutError, OSError) as exc:
        logger.warning("cache.client.unavailable url=%s error=%s", url, exc)
        try:
            await client.aclose()
        except Exception:  # noqa: BLE001 — best-effort cleanup
            pass
        _client = None
        return None

    _client = client
    return client


async def close_redis_client() -> None:
    """Close the singleton (if open) and reset so the next call re-pings."""
    global _client
    if _client is not _UNSET and _client is not None:
        try:
            await _client.aclose()  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001 — best-effort cleanup
            pass
    _client = _UNSET
