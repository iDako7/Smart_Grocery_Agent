"""Tests for get_recipe_detail tool against real SQLite KB."""

import pytest_asyncio

from contracts.tool_schemas import GetRecipeDetailInput
from src.ai.kb import get_kb
from src.ai.tools.get_recipe_detail import get_recipe_detail


@pytest_asyncio.fixture()
async def kb():
    db = await get_kb()
    yield db
    await db.close()


async def test_valid_recipe_id(kb):
    result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id="r001"))
    assert result is not None
    assert result.id == "r001"
    assert result.name
    assert result.ingredients


async def test_recipe_has_instructions(kb):
    result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id="r001"))
    assert result is not None
    assert result.instructions


async def test_nonexistent_recipe(kb):
    result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id="r999"))
    assert result is None


async def test_ingredients_are_typed(kb):
    result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id="r001"))
    assert result is not None
    assert all(hasattr(ing, "name") and hasattr(ing, "amount") for ing in result.ingredients)
