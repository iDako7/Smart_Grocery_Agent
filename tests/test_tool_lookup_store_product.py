"""Tests for lookup_store_product tool against real SQLite KB."""

import pytest_asyncio

from contracts.tool_schemas import LookupStoreProductInput
from src.ai.kb import get_kb
from src.ai.tools.lookup_store_product import lookup_store_product


@pytest_asyncio.fixture()
async def kb():
    db = await get_kb()
    yield db
    await db.close()


async def test_finds_product(kb):
    result = await lookup_store_product(kb, LookupStoreProductInput(item_name="chicken"))
    assert result is not None
    assert result.name
    assert result.store == "costco"


async def test_returns_alternatives(kb):
    result = await lookup_store_product(kb, LookupStoreProductInput(item_name="chicken"))
    assert result is not None
    assert isinstance(result.alternatives, list)


async def test_no_match_returns_none(kb):
    result = await lookup_store_product(kb, LookupStoreProductInput(item_name="xyznonexistent"))
    assert result is None


async def test_store_filter(kb):
    result = await lookup_store_product(
        kb, LookupStoreProductInput(item_name="chicken", store="costco")
    )
    if result:
        assert result.store == "costco"


async def test_has_department(kb):
    result = await lookup_store_product(kb, LookupStoreProductInput(item_name="chicken"))
    if result:
        assert result.department
