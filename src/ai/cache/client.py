"""Async Redis client singleton for the tool cache.

On first use the client is lazily created and pinged once. If the ping fails
(Redis unreachable), we log a warning and cache `None` so callers can degrade
gracefully without re-pinging on every call. Call `close_redis_client()` to
reset the singleton and force a fresh ping on the next `get_redis_client()`.
"""

from __future__ import annotations

import contextlib
import logging
import os
import time

import redis.asyncio as redis
from redis.exceptions import ConnectionError, TimeoutError

logger = logging.getLogger(__name__)

_DEFAULT_URL = "redis://localhost:6379/0"
_RETRY_COOLDOWN: int = 60  # seconds between re-ping attempts after a failed ping

# Module-level singleton state.
# Sentinel distinguishes "not yet initialized" from "initialized as None (unavailable)".
_UNSET: object = object()
_client: redis.Redis | None | object = _UNSET
_last_ping_failed_at: float | None = None


async def get_redis_client() -> redis.Redis | None:
    """Return the shared Redis client, or None if Redis is unreachable.

    After a failed ping the client stays None for ``_RETRY_COOLDOWN`` seconds
    to avoid hammering a down Redis on every request. Once the cooldown elapses
    the next call re-pings and reconnects if Redis has recovered.
    """
    global _client, _last_ping_failed_at

    # Fast path: client already available.
    if _client is not _UNSET and _client is not None:
        return _client  # type: ignore[return-value]

    # Previously unavailable — honour cooldown before re-pinging.
    if _client is None:
        now = time.monotonic()
        if _last_ping_failed_at is not None and (now - _last_ping_failed_at) < _RETRY_COOLDOWN:
            return None
        _client = _UNSET  # cooldown elapsed — fall through to ping attempt

    url = os.getenv("REDIS_URL", _DEFAULT_URL)
    client = redis.from_url(url, decode_responses=False)
    try:
        await client.ping()
    except (ConnectionError, TimeoutError, OSError) as exc:
        logger.warning("cache.client.unavailable url=%s error=%s", url, exc)
        with contextlib.suppress(Exception):
            await client.aclose()
        _client = None
        _last_ping_failed_at = time.monotonic()
        return None

    _client = client
    _last_ping_failed_at = None
    return client


async def close_redis_client() -> None:
    """Close the singleton (if open) and reset so the next call re-pings."""
    global _client, _last_ping_failed_at
    if _client is not _UNSET and _client is not None:
        with contextlib.suppress(Exception):
            await _client.aclose()  # type: ignore[union-attr]
    _client = _UNSET
    _last_ping_failed_at = None
