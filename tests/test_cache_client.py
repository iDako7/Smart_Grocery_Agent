"""Tests for cooldown retry logic in src/ai/cache/client.py (M2 fix)."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import redis.asyncio as aioredis
from redis.exceptions import ConnectionError as RedisConnectionError
from src.ai.cache.client import close_redis_client, get_redis_client


def _reset_client() -> None:
    """Reset module-level singleton state between tests."""
    import src.ai.cache.client as mod

    mod._client = mod._UNSET
    mod._last_ping_failed_at = None


@pytest.mark.asyncio
async def test_client_returns_none_during_cooldown():
    """After a failed ping, get_redis_client returns None without re-pinging
    until the cooldown elapses."""
    _reset_client()
    mock_redis = MagicMock()
    mock_redis.ping = AsyncMock(side_effect=RedisConnectionError("down"))
    mock_redis.aclose = AsyncMock()

    with patch("src.ai.cache.client.redis.from_url", return_value=mock_redis):
        result1 = await get_redis_client()  # pings, fails, records timestamp
        result2 = await get_redis_client()  # still in cooldown — must NOT re-ping

    assert result1 is None
    assert result2 is None
    assert mock_redis.ping.call_count == 1, "must not re-ping during cooldown"


@pytest.mark.asyncio
async def test_client_retries_after_cooldown():
    """After cooldown elapses, get_redis_client re-pings and returns a live client."""
    _reset_client()

    fail_mock = MagicMock()
    fail_mock.ping = AsyncMock(side_effect=RedisConnectionError("down"))
    fail_mock.aclose = AsyncMock()

    success_mock = MagicMock(spec=aioredis.Redis)
    success_mock.ping = AsyncMock(return_value=True)

    call_count = {"n": 0}

    def _from_url(*a, **kw):
        call_count["n"] += 1
        return fail_mock if call_count["n"] == 1 else success_mock

    with patch("src.ai.cache.client.redis.from_url", side_effect=_from_url):
        await get_redis_client()  # first call — ping fails

        # Fast-forward past cooldown
        import src.ai.cache.client as mod

        mod._last_ping_failed_at = time.monotonic() - mod._RETRY_COOLDOWN - 1

        result = await get_redis_client()  # should re-ping and succeed

    assert result is success_mock, "must return live client after cooldown"


@pytest.mark.asyncio
async def test_close_redis_client_resets_failure_timestamp():
    """close_redis_client must clear both _client and _last_ping_failed_at."""
    import src.ai.cache.client as mod

    _reset_client()
    mod._last_ping_failed_at = time.monotonic()
    mod._client = None

    await close_redis_client()

    assert mod._client is mod._UNSET
    assert mod._last_ping_failed_at is None
