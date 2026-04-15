"""Tests for analyze_pcsv tool against real SQLite KB."""

import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.tools.analyze_pcsv import analyze_pcsv

from contracts.tool_schemas import AnalyzePcsvInput


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


async def test_chicken_wings_and_rice(kb):
    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken wings", "rice"]))
    assert result.protein.status == "low"
    assert "chicken wings" in result.protein.items
    assert result.carb.status == "low"
    assert "rice" in result.carb.items
    assert result.veggie.status == "gap"
    assert result.sauce.status == "gap"


async def test_tofu_bok_choy_soy_sauce(kb):
    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["tofu", "bok choy", "soy sauce"]))
    assert result.protein.status == "low"
    assert "tofu" in result.protein.items
    assert result.carb.status == "gap"
    assert result.veggie.status == "low"
    assert "bok choy" in result.veggie.items
    assert result.sauce.status == "low"


async def test_empty_list(kb):
    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=[]))
    for cat in [result.protein, result.carb, result.veggie, result.sauce]:
        assert cat.status == "gap"
        assert cat.items == []


async def test_partial_match(kb):
    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["wing"]))
    assert result.protein.status == "low"


async def test_multi_role_ingredient(kb):
    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chickpeas"]))
    assert "chickpeas" in result.protein.items
    assert "chickpeas" in result.carb.items


async def test_duplicate_not_double_counted(kb):
    result = await analyze_pcsv(kb, AnalyzePcsvInput(ingredients=["chicken", "chicken"]))
    assert len(result.protein.items) == 1
