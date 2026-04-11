"""Tests for search_recipes tool against real SQLite KB."""

import pytest_asyncio

from contracts.tool_schemas import SearchRecipesInput
from src.ai.kb import get_kb
from src.ai.tools.search_recipes import search_recipes


@pytest_asyncio.fixture()
async def kb():
    db = await get_kb()
    yield db
    await db.close()


async def test_returns_results_for_common_ingredients(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"]))
    assert len(result) > 0
    assert all(r.ingredients_have for r in result)


async def test_results_sorted_by_match_score(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "garlic", "soy sauce"]))
    if len(result) >= 2:
        # Results should be sorted by match score (descending)
        for i in range(len(result) - 1):
            have_ratio_a = len(result[i].ingredients_have) / (len(result[i].ingredients_have) + len(result[i].ingredients_need))
            have_ratio_b = len(result[i + 1].ingredients_have) / (len(result[i + 1].ingredients_have) + len(result[i + 1].ingredients_need))
            assert have_ratio_a >= have_ratio_b


async def test_max_10_results(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["salt", "oil", "garlic"]))
    assert len(result) <= 10


async def test_cuisine_filter(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken"], cuisine="Korean"))
    for r in result:
        assert r.cuisine.lower() == "korean"


async def test_no_match_returns_empty(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["xyznonexistent"]))
    assert result == []


async def test_effort_level_filter(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken"], effort_level="quick"))
    for r in result:
        assert r.effort_level == "quick"


async def test_result_has_ingredients_have_and_need(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken"]))
    if result:
        assert result[0].ingredients_have
        # ingredients_need should exist (may be empty if user has everything)
        assert isinstance(result[0].ingredients_need, list)
