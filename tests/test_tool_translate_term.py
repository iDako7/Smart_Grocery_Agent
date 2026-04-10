"""Tests for translate_term tool against real SQLite KB."""

import pytest_asyncio

from contracts.tool_schemas import TranslateTermInput
from src.ai.kb import get_kb
from src.ai.tools.translate_term import translate_term


@pytest_asyncio.fixture()
async def kb():
    db = await get_kb()
    yield db
    await db.close()


async def test_en_to_zh_exact(kb):
    result = await translate_term(kb, TranslateTermInput(term="tofu"))
    assert result.match_type == "exact"
    assert result.direction == "en_to_zh"
    assert result.translation  # Should have a Chinese translation


async def test_zh_to_en_auto_detect(kb):
    result = await translate_term(kb, TranslateTermInput(term="豆腐"))
    assert result.direction == "zh_to_en"
    assert result.match_type in ("exact", "partial")
    assert result.translation  # Should have an English translation


async def test_explicit_direction(kb):
    result = await translate_term(kb, TranslateTermInput(term="tofu", direction="en_to_zh"))
    assert result.direction == "en_to_zh"


async def test_no_match(kb):
    result = await translate_term(kb, TranslateTermInput(term="xyznonexistent"))
    assert result.match_type == "none"
    assert result.translation == ""


async def test_partial_match(kb):
    result = await translate_term(kb, TranslateTermInput(term="soy"))
    assert result.match_type in ("exact", "partial")
