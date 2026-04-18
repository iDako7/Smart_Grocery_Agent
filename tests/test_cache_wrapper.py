"""Tests for src/ai/cache/wrapper.py — cached_tool decorator.

TDD: tests written before implementation. All tests must fail (ImportError)
before wrapper.py exists.

Strategy: integration-weighted. Use fakeredis.aioredis.FakeRedis as the Redis
double, patched via `src.ai.cache.wrapper.get_redis_client`.
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import redis.exceptions
from fakeredis.aioredis import FakeRedis
from pydantic import BaseModel

from contracts.tool_schemas import RecipeSummary


# ---------------------------------------------------------------------------
# Shared tiny models and handler factory
# ---------------------------------------------------------------------------


class _Input(BaseModel):
    x: int


class _Output(BaseModel):
    value: int


class _MultiInput(BaseModel):
    a: int
    b: int


class _MultiOutput(BaseModel):
    total: int


def _make_fake_redis() -> FakeRedis:
    """Return a fresh in-process FakeRedis instance with decode_responses=False."""
    return FakeRedis(decode_responses=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _patch_client(fake_redis):
    """Context manager: patch get_redis_client in the wrapper module."""
    return patch(
        "src.ai.cache.wrapper.get_redis_client",
        new=AsyncMock(return_value=fake_redis),
    )


# ---------------------------------------------------------------------------
# Test 1: miss then hit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_miss_then_hit():
    """First call runs handler and stores result; second call is a cache hit."""
    from src.ai.cache.wrapper import cached_tool

    calls = {"n": 0}

    @cached_tool("fake_tool", ttl_seconds=48 * 3600, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        calls["n"] += 1
        return _Output(value=input.x * 2)

    fake_redis = _make_fake_redis()
    with _patch_client(fake_redis):
        result1 = await handler(None, _Input(x=5))
        result2 = await handler(None, _Input(x=5))

    assert calls["n"] == 1, "handler must only run once; second call should be a cache hit"
    assert result1.value == 10
    assert result2.value == 10


# ---------------------------------------------------------------------------
# Test 2: different args produce different cache entries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_different_args_different_cache():
    """Two calls with different inputs both miss and handler runs twice."""
    from src.ai.cache.wrapper import cached_tool

    calls = {"n": 0}

    @cached_tool("fake_tool", ttl_seconds=3600, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        calls["n"] += 1
        return _Output(value=input.x * 2)

    fake_redis = _make_fake_redis()
    with _patch_client(fake_redis):
        r1 = await handler(None, _Input(x=3))
        r2 = await handler(None, _Input(x=7))

    assert calls["n"] == 2
    assert r1.value == 6
    assert r2.value == 14


# ---------------------------------------------------------------------------
# Test 3: arg-order invariance end-to-end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_arg_order_invariance_end_to_end():
    """Two Pydantic instances with same field values (different kwarg order)
    must resolve to the same cache key, so the second call is a hit."""
    from src.ai.cache.wrapper import cached_tool

    calls = {"n": 0}

    @cached_tool("multi_tool", ttl_seconds=3600, return_type=_MultiOutput)
    async def handler(db, input: _MultiInput) -> _MultiOutput:
        calls["n"] += 1
        return _MultiOutput(total=input.a + input.b)

    fake_redis = _make_fake_redis()
    # Both produce the same canonical JSON because keys are sorted
    input1 = _MultiInput(a=1, b=2)
    input2 = _MultiInput.model_validate({"b": 2, "a": 1})

    with _patch_client(fake_redis):
        r1 = await handler(None, input1)
        r2 = await handler(None, input2)

    assert calls["n"] == 1, "second call must be a cache hit (same canonical key)"
    assert r1.total == 3
    assert r2.total == 3


# ---------------------------------------------------------------------------
# Test 4: TTL is passed to SET
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ttl_passed_to_setex():
    """Verify that the decorator passes ex=ttl_seconds to client.set."""
    from src.ai.cache.wrapper import cached_tool

    @cached_tool("fake_tool", ttl_seconds=172800, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        return _Output(value=input.x)

    # Use a real FakeRedis but spy on its .set method
    fake_redis = _make_fake_redis()
    original_set = fake_redis.set
    set_calls: list[dict] = []

    async def spy_set(*args, **kwargs):
        set_calls.append({"args": args, "kwargs": kwargs})
        return await original_set(*args, **kwargs)

    fake_redis.set = spy_set  # type: ignore[method-assign]

    with _patch_client(fake_redis):
        await handler(None, _Input(x=9))

    assert len(set_calls) == 1, "set must be called exactly once on a miss"
    assert set_calls[0]["kwargs"].get("ex") == 172800, (
        f"expected ex=172800, got {set_calls[0]['kwargs']}"
    )


# ---------------------------------------------------------------------------
# Test 5: Redis GET outage falls through to handler
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redis_outage_on_get_falls_through(caplog):
    """When client.get raises ConnectionError, handler still runs and WARN is logged."""
    from src.ai.cache.wrapper import cached_tool

    calls = {"n": 0}

    @cached_tool("fake_tool", ttl_seconds=3600, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        calls["n"] += 1
        return _Output(value=input.x * 3)

    bad_client = MagicMock()
    bad_client.get = AsyncMock(side_effect=redis.exceptions.ConnectionError("down"))
    bad_client.set = AsyncMock()

    with patch("src.ai.cache.wrapper.get_redis_client", new=AsyncMock(return_value=bad_client)):
        with caplog.at_level(logging.WARNING, logger="src.ai.cache.wrapper"):
            result = await handler(None, _Input(x=4))

    assert result.value == 12, "handler result must still be returned"
    assert calls["n"] == 1
    # WARN log with op=get must exist
    warn_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
    assert any("op=get" in m for m in warn_messages), (
        f"expected WARN with op=get, got: {warn_messages}"
    )
    # SET must NOT be attempted after GET failure
    bad_client.set.assert_not_called()


# ---------------------------------------------------------------------------
# Test 6: Redis SET outage still returns result
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redis_outage_on_set_returns_result(caplog):
    """When GET returns None (miss) but SET raises ConnectionError,
    handler result is still returned and WARN is logged."""
    from src.ai.cache.wrapper import cached_tool

    calls = {"n": 0}

    @cached_tool("fake_tool", ttl_seconds=3600, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        calls["n"] += 1
        return _Output(value=input.x + 1)

    bad_client = MagicMock()
    bad_client.get = AsyncMock(return_value=None)  # cache miss
    bad_client.set = AsyncMock(side_effect=redis.exceptions.ConnectionError("down on set"))

    with patch("src.ai.cache.wrapper.get_redis_client", new=AsyncMock(return_value=bad_client)):
        with caplog.at_level(logging.WARNING, logger="src.ai.cache.wrapper"):
            result = await handler(None, _Input(x=6))

    assert result.value == 7, "result must still be returned even when SET fails"
    assert calls["n"] == 1
    warn_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
    assert any("op=set" in m for m in warn_messages), (
        f"expected WARN with op=set, got: {warn_messages}"
    )


# ---------------------------------------------------------------------------
# Test 7: client=None skips cache entirely
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_none_skips_cache():
    """When get_redis_client returns None, handler is called every time
    with no exception raised."""
    from src.ai.cache.wrapper import cached_tool

    calls = {"n": 0}

    @cached_tool("fake_tool", ttl_seconds=3600, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        calls["n"] += 1
        return _Output(value=input.x)

    with patch("src.ai.cache.wrapper.get_redis_client", new=AsyncMock(return_value=None)):
        r1 = await handler(None, _Input(x=2))
        r2 = await handler(None, _Input(x=2))

    assert calls["n"] == 2, "handler must run on every call when Redis is unavailable"
    assert r1.value == 2
    assert r2.value == 2


# ---------------------------------------------------------------------------
# Test 8: list return type roundtrip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_return_type_roundtrip():
    """A handler returning list[RecipeSummary] is cached and deserialized correctly."""
    from src.ai.cache.wrapper import cached_tool

    class _ListInput(BaseModel):
        query: str

    calls = {"n": 0}

    @cached_tool("search_recipes", ttl_seconds=3600, return_type=list[RecipeSummary])
    async def handler(db, input: _ListInput) -> list[RecipeSummary]:
        calls["n"] += 1
        return [
            RecipeSummary(id="r001", name="Tofu Stir-fry", cuisine="Chinese"),
            RecipeSummary(id="r002", name="Salmon Bowl", cuisine="Japanese"),
        ]

    fake_redis = _make_fake_redis()

    with _patch_client(fake_redis):
        result1 = await handler(None, _ListInput(query="tofu"))
        result2 = await handler(None, _ListInput(query="tofu"))

    assert calls["n"] == 1, "second call must be a cache hit"
    assert isinstance(result2, list)
    assert len(result2) == 2
    assert isinstance(result2[0], RecipeSummary)
    assert result2[0].id == "r001"
    assert result2[1].name == "Salmon Bowl"


# ---------------------------------------------------------------------------
# Test 9: corrupt cache entry falls through to handler (M1 fix)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_corrupt_cache_entry_falls_through_to_handler(caplog):
    """Corrupt bytes in Redis must log WARN op=decode and fall through, not raise."""
    from src.ai.cache.wrapper import cached_tool
    from src.ai.cache.keys import compute_key

    calls = {"n": 0}

    @cached_tool("fake_tool", ttl_seconds=3600, return_type=_Output)
    async def handler(db, input: _Input) -> _Output:
        calls["n"] += 1
        return _Output(value=input.x * 2)

    fake_redis = _make_fake_redis()
    key = compute_key("fake_tool", _Input(x=5).model_dump(mode="json"))
    await fake_redis.set(key, b"not-valid-json!!!")  # inject corrupt entry

    with _patch_client(fake_redis):
        with caplog.at_level(logging.WARNING, logger="src.ai.cache.wrapper"):
            result = await handler(None, _Input(x=5))

    assert result.value == 10
    assert calls["n"] == 1, "handler must run after decode failure"
    warns = [r.message for r in caplog.records if r.levelno == logging.WARNING]
    assert any("op=decode" in m for m in warns), f"expected WARN with op=decode, got: {warns}"
