"""Tests for lookup_store_product tool against real SQLite KB."""

import pytest_asyncio

from contracts.tool_schemas import LookupStoreProductInput
from src.ai.kb import get_kb
from src.ai.tools.lookup_store_product import lookup_store_product, score_products


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


# ---------------------------------------------------------------------------
# score_products — unit tests (no DB, uses pre-fetched rows)
# ---------------------------------------------------------------------------

# Row format: (name, size, department, category, store)
_SAMPLE_ROWS = [
    ("Chicken Breast", "2 kg", "Meat", "poultry", "costco"),
    ("Chicken Thighs", "1.5 kg", "Meat", "poultry", "costco"),
    ("Jasmine Rice", "5 kg", "Grains", "rice", "costco"),
    ("Bok Choy", "500g", "Produce", "vegetables", "community_market"),
]


def test_score_products_returns_matches_above_threshold():
    results = score_products(_SAMPLE_ROWS, "chicken")
    assert len(results) > 0
    for score, product in results:
        assert score >= 60


def test_score_products_no_match_returns_empty():
    results = score_products(_SAMPLE_ROWS, "xyznonexistent")
    assert results == []


def test_score_products_sorted_descending():
    results = score_products(_SAMPLE_ROWS, "chicken breast")
    scores = [r[0] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_score_products_result_has_expected_keys():
    results = score_products(_SAMPLE_ROWS, "chicken")
    assert len(results) > 0
    _, product = results[0]
    assert set(product.keys()) == {"name", "size", "department", "store"}


def test_score_products_empty_rows_returns_empty():
    results = score_products([], "chicken")
    assert results == []


def test_score_products_empty_query():
    # Empty query: fuzz scores against "" will vary — we just verify no crash
    results = score_products(_SAMPLE_ROWS, "")
    assert isinstance(results, list)


def test_score_products_custom_threshold():
    # With threshold=0, all rows should be returned
    results = score_products(_SAMPLE_ROWS, "chicken", threshold=0)
    assert len(results) == len(_SAMPLE_ROWS)


def test_score_products_category_match():
    # "poultry" matches via category column, not name
    results = score_products(_SAMPLE_ROWS, "poultry", threshold=60)
    assert len(results) > 0
    names = [p["name"] for _, p in results]
    assert any("Chicken" in name for name in names)


def test_score_products_fallback_store_when_none():
    rows_no_store = [("Salt", "1 kg", "Condiments", "seasoning", None)]
    results = score_products(rows_no_store, "salt", threshold=0)
    assert len(results) == 1
    assert results[0][1]["store"] == "costco"
