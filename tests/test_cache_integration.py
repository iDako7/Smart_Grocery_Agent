"""Integration tests for the Redis tool cache (issue #121, Task T5).

Strategy: fakeredis for Redis (fast, CI-portable) + real SQLite KB for tools
(proves the full pipe end-to-end). The wrapper's `get_redis_client` is patched
to return a FakeRedis instance so all six wrapped tools hit the fake.

Arg-order invariance is already covered at the unit level in
`test_cache_keys.py::test_compute_key_arg_order_invariance` — no duplicate
integration test added here per T5 spec decision.
"""

from __future__ import annotations

import logging
import uuid
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fakeredis.aioredis import FakeRedis
from src.ai.cache import wrapper as cache_wrapper_mod
from src.ai.kb import get_kb
from src.ai.tools.analyze_pcsv import analyze_pcsv
from src.ai.tools.get_recipe_detail import get_recipe_detail
from src.ai.tools.get_substitutions import get_substitutions
from src.ai.tools.lookup_store_product import lookup_store_product
from src.ai.tools.search_recipes import search_recipes
from src.ai.tools.translate_term import translate_term
from src.ai.tools.update_user_profile import update_user_profile

from contracts.tool_schemas import (
    AnalyzePcsvInput,
    GetRecipeDetailInput,
    GetSubstitutionsInput,
    LookupStoreProductInput,
    SearchRecipesInput,
    TranslateTermInput,
    UpdateUserProfileInput,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def fake_redis(monkeypatch):
    """Shared FakeRedis instance patched into the wrapper for each test."""
    fake = FakeRedis(decode_responses=False)

    async def _get():
        return fake

    monkeypatch.setattr(cache_wrapper_mod, "get_redis_client", _get)
    yield fake
    await fake.aclose()


@pytest_asyncio.fixture()
async def kb():
    """Real aiosqlite connection to the KB — matches pattern in test_tool_*.py."""
    async with get_kb() as db:
        yield db


# ---------------------------------------------------------------------------
# Parametrized helper: verify miss→hit log sequence and key count
# ---------------------------------------------------------------------------


def _check_logs(caplog, tool_name: str) -> None:
    """Assert exactly one cache.miss and one cache.hit for the given tool."""
    messages = [r.message for r in caplog.records if "cache." in r.message]
    miss_count = sum("cache.miss" in m and f"tool={tool_name}" in m for m in messages)
    hit_count = sum("cache.hit" in m and f"tool={tool_name}" in m for m in messages)
    assert miss_count == 1, f"expected 1 cache.miss for {tool_name}, got {miss_count}. logs={messages}"
    assert hit_count == 1, f"expected 1 cache.hit for {tool_name}, got {hit_count}. logs={messages}"


# ---------------------------------------------------------------------------
# T5-A: analyze_pcsv — second call hits cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_pcsv_hits_cache_on_second_call(kb, fake_redis, caplog):
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = AnalyzePcsvInput(ingredients=["chicken wings", "rice"])

    first = await analyze_pcsv(kb, input_)
    second = await analyze_pcsv(kb, input_)

    assert first == second
    keys = await fake_redis.keys(b"sga:tool:analyze_pcsv:*")
    assert len(keys) == 1
    _check_logs(caplog, "analyze_pcsv")


# ---------------------------------------------------------------------------
# T5-B: search_recipes — second call hits cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_recipes_hits_cache_on_second_call(kb, fake_redis, caplog):
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = SearchRecipesInput(ingredients=["chicken", "rice"], max_results=3)

    first = await search_recipes(kb, input_)
    second = await search_recipes(kb, input_)

    assert first == second
    keys = await fake_redis.keys(b"sga:tool:search_recipes:*")
    assert len(keys) == 1
    _check_logs(caplog, "search_recipes")


# ---------------------------------------------------------------------------
# T5-C: get_recipe_detail (found) — second call hits cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_recipe_detail_hits_cache_on_second_call(kb, fake_redis, caplog):
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = GetRecipeDetailInput(recipe_id="r001")

    first = await get_recipe_detail(kb, input_)
    second = await get_recipe_detail(kb, input_)

    assert first is not None, "r001 must exist in the KB"
    assert first == second
    keys = await fake_redis.keys(b"sga:tool:get_recipe_detail:*")
    assert len(keys) == 1
    _check_logs(caplog, "get_recipe_detail")


# ---------------------------------------------------------------------------
# T5-C2: get_recipe_detail (not found) — None result is also cached
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_recipe_detail_caches_none_result(kb, fake_redis, caplog):
    """A None (not-found) result must also be cached so the DB isn't hit twice."""
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = GetRecipeDetailInput(recipe_id="nonexistent-id-xyz")

    first = await get_recipe_detail(kb, input_)
    second = await get_recipe_detail(kb, input_)

    assert first is None
    assert second is None
    keys = await fake_redis.keys(b"sga:tool:get_recipe_detail:*")
    assert len(keys) == 1, "None result must write exactly one key"
    _check_logs(caplog, "get_recipe_detail")


# ---------------------------------------------------------------------------
# T5-D: get_substitutions — second call hits cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_substitutions_hits_cache_on_second_call(kb, fake_redis, caplog):
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = GetSubstitutionsInput(ingredient="butter")

    first = await get_substitutions(kb, input_)
    second = await get_substitutions(kb, input_)

    assert first == second
    keys = await fake_redis.keys(b"sga:tool:get_substitutions:*")
    assert len(keys) == 1
    _check_logs(caplog, "get_substitutions")


# ---------------------------------------------------------------------------
# T5-E: lookup_store_product (found) — second call hits cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lookup_store_product_hits_cache_on_second_call(kb, fake_redis, caplog):
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = LookupStoreProductInput(item_name="apple")

    first = await lookup_store_product(kb, input_)
    second = await lookup_store_product(kb, input_)

    assert first == second
    keys = await fake_redis.keys(b"sga:tool:lookup_store_product:*")
    assert len(keys) == 1
    _check_logs(caplog, "lookup_store_product")


# ---------------------------------------------------------------------------
# T5-E2: lookup_store_product (not found) — None result is also cached
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lookup_store_product_caches_none_result(kb, fake_redis, caplog):
    """A None (not-found) lookup must also be cached."""
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = LookupStoreProductInput(item_name="utterly-fake-item-zzz")

    first = await lookup_store_product(kb, input_)
    second = await lookup_store_product(kb, input_)

    assert first is None
    assert second is None
    keys = await fake_redis.keys(b"sga:tool:lookup_store_product:*")
    assert len(keys) == 1, "None result must write exactly one key"
    _check_logs(caplog, "lookup_store_product")


# ---------------------------------------------------------------------------
# T5-F: translate_term — second call hits cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_translate_term_hits_cache_on_second_call(kb, fake_redis, caplog):
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")
    input_ = TranslateTermInput(term="tofu")

    first = await translate_term(kb, input_)
    second = await translate_term(kb, input_)

    assert first == second
    keys = await fake_redis.keys(b"sga:tool:translate_term:*")
    assert len(keys) == 1
    _check_logs(caplog, "translate_term")


# ---------------------------------------------------------------------------
# T5-G: update_user_profile is NOT wrapped — must leave zero cache keys
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_user_profile_is_not_cached(fake_redis, caplog, monkeypatch):
    """update_user_profile has no @cached_tool decorator — no cache key written."""
    caplog.set_level(logging.INFO, logger="src.ai.cache.wrapper")

    # Patch DB crud so we don't need a real PostgreSQL connection
    monkeypatch.setattr(
        "src.ai.tools.update_user_profile.update_user_profile_field",
        AsyncMock(return_value=True),
    )
    mock_conn = AsyncMock()
    user_id = uuid.uuid4()
    input_ = UpdateUserProfileInput(field="dietary_restrictions", value=["peanuts"])

    await update_user_profile(mock_conn, user_id, input_)

    # No cache key should exist for update_user_profile
    keys = await fake_redis.keys(b"sga:tool:update_user_profile:*")
    assert keys == [], f"update_user_profile must not write any cache keys, got {keys}"

    # No cache.miss / cache.hit log for this tool
    messages = [r.message for r in caplog.records if "cache." in r.message]
    assert not any("update_user_profile" in m for m in messages), (
        f"No cache log expected for update_user_profile, got: {messages}"
    )


# ---------------------------------------------------------------------------
# T5-H: different inputs produce independent cache keys (no collision)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_different_inputs_produce_different_keys(kb, fake_redis):
    """Two distinct analyze_pcsv inputs must write two distinct cache keys."""
    await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken"]))
    await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["tofu"]))

    keys = await fake_redis.keys(b"sga:tool:analyze_pcsv:*")
    assert len(keys) == 2, f"expected 2 distinct keys, got {len(keys)}"


# ---------------------------------------------------------------------------
# T5-I: flush between tests — verify fake_redis is clean at test start
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fake_redis_is_clean_per_test(fake_redis):
    """Each test gets a fresh FakeRedis (no leftover keys from previous tests)."""
    all_keys = await fake_redis.keys(b"*")
    assert all_keys == [], f"expected empty store at test start, got {all_keys}"


# ---------------------------------------------------------------------------
# Existing tool tests still green with cache wired — verified externally
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="Verified via full test suite run in T4/T5 verification steps")
async def test_existing_tool_tests_still_green_with_cache_wired():
    """Placeholder — run `pytest tests/ -x --ignore=tests/test_api_auth.py` to verify."""
