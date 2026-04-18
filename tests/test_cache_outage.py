"""Outage-resilience integration tests for Redis tool cache (issue #121, Task T6).

Strategy: real SQLite KB + monkeypatched Redis client that raises
redis.exceptions.ConnectionError on .get or .set. Proves the full
handler pipeline still returns correct output and that the WARN log
is emitted — no exception bubbles to the caller.

Complements test_cache_wrapper.py (unit, stub handler) and
test_cache_integration.py (happy path, all six tools, fakeredis).
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from redis.exceptions import ConnectionError as RedisConnectionError
from src.ai.cache import wrapper as cache_wrapper_mod
from src.ai.kb import get_kb
from src.ai.tools.analyze_pcsv import analyze_pcsv
from src.ai.tools.get_recipe_detail import get_recipe_detail
from src.ai.tools.search_recipes import search_recipes

from contracts.tool_schemas import (
    AnalyzePcsvInput,
    GetRecipeDetailInput,
    PCSVResult,
    RecipeDetail,
    RecipeSummary,
    SearchRecipesInput,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def kb():
    """Real aiosqlite connection to the KB."""
    async with get_kb() as db:
        yield db


@pytest.fixture()
def redis_down_on_get(monkeypatch):
    """Redis whose .get raises ConnectionError (simulates outage mid-request)."""
    mock_client = MagicMock()
    mock_client.get = AsyncMock(side_effect=RedisConnectionError("simulated outage"))
    mock_client.set = AsyncMock()  # should never be called — GET failed

    async def _get():
        return mock_client

    monkeypatch.setattr(cache_wrapper_mod, "get_redis_client", _get)
    return mock_client


@pytest.fixture()
def redis_down_on_set(monkeypatch):
    """Redis whose .get returns None (miss) and .set raises ConnectionError."""
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=None)
    mock_client.set = AsyncMock(side_effect=RedisConnectionError("simulated outage during SET"))

    async def _get():
        return mock_client

    monkeypatch.setattr(cache_wrapper_mod, "get_redis_client", _get)
    return mock_client


@pytest.fixture()
def redis_unavailable(monkeypatch):
    """Pings failed — get_redis_client returns None (singleton path)."""

    async def _get():
        return None

    monkeypatch.setattr(cache_wrapper_mod, "get_redis_client", _get)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _warn_msgs(caplog):
    return [r.message for r in caplog.records if r.levelname == "WARNING"]


# ---------------------------------------------------------------------------
# Tests 1–3: GET failure falls through for each representative tool type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_failure_falls_through_analyze_pcsv(kb, redis_down_on_get, caplog):
    """GET outage: analyze_pcsv still returns valid PCSVResult; SET never attempted."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken wings", "rice"]))

    assert isinstance(result, PCSVResult), "must return PCSVResult even under Redis outage"
    assert result.protein.status in ("low", "ok"), f"unexpected protein status: {result.protein.status}"
    assert "chicken wings" in result.protein.items, f"chicken wings not in protein: {result.protein.items}"
    redis_down_on_get.set.assert_not_called()

    warns = _warn_msgs(caplog)
    assert any("cache.error op=get tool=analyze_pcsv" in m for m in warns), (
        f"expected WARN with cache.error op=get tool=analyze_pcsv, got: {warns}"
    )


@pytest.mark.asyncio
async def test_get_failure_falls_through_search_recipes(kb, redis_down_on_get, caplog):
    """GET outage: search_recipes still returns a non-empty list of RecipeSummary."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"], max_results=3))

    assert isinstance(result, list), "must return list even under Redis outage"
    assert len(result) > 0, "expected at least one recipe result"
    assert all(isinstance(r, RecipeSummary) for r in result)
    redis_down_on_get.set.assert_not_called()

    warns = _warn_msgs(caplog)
    assert any("cache.error op=get tool=search_recipes" in m for m in warns), (
        f"expected WARN with cache.error op=get tool=search_recipes, got: {warns}"
    )


@pytest.mark.asyncio
async def test_get_failure_falls_through_get_recipe_detail(kb, redis_down_on_get, caplog):
    """GET outage: get_recipe_detail still returns handler output (RecipeDetail or None)."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    # Use a known-good ID; if the KB doesn't have r001 the test still passes (None is valid)
    result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id="r001"))

    # Either a valid RecipeDetail or None — both are correct handler outcomes
    assert result is None or isinstance(result, RecipeDetail), f"expected RecipeDetail or None, got {type(result)}"
    redis_down_on_get.set.assert_not_called()

    warns = _warn_msgs(caplog)
    assert any("cache.error op=get tool=get_recipe_detail" in m for m in warns), (
        f"expected WARN with cache.error op=get tool=get_recipe_detail, got: {warns}"
    )


# ---------------------------------------------------------------------------
# Tests 4–5: SET failure still returns correct result
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_failure_still_returns_result_analyze_pcsv(kb, redis_down_on_set, caplog):
    """SET outage: analyze_pcsv returns correct result; GET called (miss); SET called but swallowed."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken wings", "rice"]))

    assert isinstance(result, PCSVResult)
    assert "chicken wings" in result.protein.items

    redis_down_on_set.get.assert_called_once()
    redis_down_on_set.set.assert_called_once()  # called, raised, swallowed

    warns = _warn_msgs(caplog)
    assert any("cache.error op=set tool=analyze_pcsv" in m for m in warns), (
        f"expected WARN with cache.error op=set tool=analyze_pcsv, got: {warns}"
    )


@pytest.mark.asyncio
async def test_set_failure_still_returns_result_search_recipes(kb, redis_down_on_set, caplog):
    """SET outage: search_recipes returns correct result; SET called but swallowed."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"], max_results=3))

    assert isinstance(result, list)
    assert len(result) > 0
    assert all(isinstance(r, RecipeSummary) for r in result)

    redis_down_on_set.get.assert_called_once()
    redis_down_on_set.set.assert_called_once()

    warns = _warn_msgs(caplog)
    assert any("cache.error op=set tool=search_recipes" in m for m in warns), (
        f"expected WARN with cache.error op=set tool=search_recipes, got: {warns}"
    )


# ---------------------------------------------------------------------------
# Test 6: client=None path — two calls both succeed, no cache logs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_unavailable_bypasses_cache_end_to_end(kb, redis_unavailable, caplog):
    """When Redis is completely unavailable (None), both calls succeed with correct output."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    result1 = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken wings", "rice"]))
    result2 = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken wings", "rice"]))

    assert isinstance(result1, PCSVResult)
    assert isinstance(result2, PCSVResult)
    assert result1 == result2

    # No cache error, hit, or miss logs at WARNING level
    warns = _warn_msgs(caplog)
    cache_warns = [m for m in warns if "cache." in m]
    assert cache_warns == [], f"expected no cache WARN logs when client=None, got: {cache_warns}"


# ---------------------------------------------------------------------------
# Test 7: combo — all three tool types survive GET failure in sequence
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_multiple_tool_types_all_survive_get_failure(kb, redis_down_on_get, caplog):
    """Sanity combo: all three representative tool types return valid output under GET outage."""
    caplog.set_level(logging.WARNING, logger="src.ai.cache.wrapper")

    pcsv_result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken wings", "rice"]))
    search_result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken"], max_results=2))
    detail_result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id="r001"))

    # All handlers ran and returned type-correct output
    assert isinstance(pcsv_result, PCSVResult)
    assert isinstance(search_result, list)
    assert detail_result is None or isinstance(detail_result, RecipeDetail)

    # SET was never attempted for any of them
    redis_down_on_get.set.assert_not_called()

    # Each tool emitted its own WARN log
    warns = _warn_msgs(caplog)
    for tool_name in ("analyze_pcsv", "search_recipes", "get_recipe_detail"):
        assert any(f"cache.error op=get tool={tool_name}" in m for m in warns), (
            f"missing WARN for {tool_name}. all warns: {warns}"
        )
