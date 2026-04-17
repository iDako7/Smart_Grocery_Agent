"""Tests for get_substitutions tool against real SQLite KB."""

import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.tools.get_substitutions import get_substitutions

from contracts.tool_schemas import GetSubstitutionsInput


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


async def test_finds_substitutions(kb):
    result = await get_substitutions(kb, GetSubstitutionsInput(ingredient="gochujang"))
    assert len(result) > 0
    assert all(r.substitute for r in result)


async def test_reason_filter_sorts_matching_first(kb):
    result = await get_substitutions(kb, GetSubstitutionsInput(ingredient="fish sauce", reason="dietary"))
    assert all(hasattr(r, "match_quality") for r in result)


async def test_no_match_returns_empty(kb):
    result = await get_substitutions(kb, GetSubstitutionsInput(ingredient="xyznonexistent"))
    assert result == []


async def test_match_quality_values(kb):
    result = await get_substitutions(kb, GetSubstitutionsInput(ingredient="gochujang"))
    for r in result:
        assert r.match_quality in ("good", "fair", "poor")
