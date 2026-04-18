"""Tests for lookup_store_product tool against real SQLite KB."""

import pytest
import pytest_asyncio
from contracts.tool_schemas import LookupStoreProductInput
from src.ai.kb import get_kb
from src.ai.tools.lookup_store_product import lookup_store_product, score_products


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


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
    result = await lookup_store_product(kb, LookupStoreProductInput(item_name="chicken", store="costco"))
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
    # Default threshold is 82; chicken vs Chicken Breast/Thighs scores 90 via WRatio
    results = score_products(_SAMPLE_ROWS, "chicken")
    assert len(results) > 0
    for score, _product in results:
        assert score >= 82


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


# ---------------------------------------------------------------------------
# Empirical pin tests — pollution regression (issue #72 part B)
# These encode the corrected WRatio + threshold=82 behaviour.
# ---------------------------------------------------------------------------

_POLLUTED_ROWS = [
    # Rows that previously caused false matches with token_sort_ratio @ 60.
    # Categories reflect actual KB values so unit tests mirror real query behaviour.
    ("Yellow Sweet Corn", "900g", "Fresh Vegetables", "Sweet Corn", "costco"),
    ("Pointed Peppers", "500g", "Fresh Vegetables", "Other Chili Peppers", "costco"),
    ("Shallot", "300g", "Fresh Vegetables", "Shallots", "costco"),
    # Rows that must still match correctly
    ("Roma Tomatoes", "1 kg", "Fresh Vegetables", "Roma Tomatoes", "costco"),
    ("Garlic Cloves", "400g", "Fresh Vegetables", "White Garlic", "costco"),
    ("Large Eggs", "24 ct", "Dairy", "Whole Eggs", "costco"),
]


@pytest.mark.parametrize(
    "query,product_name",
    [
        ("cornstarch", "Yellow Sweet Corn"),
        ("white pepper", "Pointed Peppers"),
        ("scallions", "Shallot"),
    ],
)
def test_pollution_pairs_rejected(query, product_name):
    """Polluted matches from issue #72 must NOT appear at default threshold."""
    row = next(r for r in _POLLUTED_ROWS if r[0] == product_name)
    results = score_products([row], query)
    matched_names = [p["name"] for _, p in results]
    assert product_name not in matched_names, f"{query!r} should not match {product_name!r} at default threshold"


@pytest.mark.parametrize(
    "query,product_name",
    [
        ("tomatoes", "Roma Tomatoes"),
        ("garlic", "Garlic Cloves"),
        ("eggs", "Large Eggs"),
    ],
)
def test_correct_pairs_accepted(query, product_name):
    """Common ingredient queries must still resolve to the correct product."""
    row = next(r for r in _POLLUTED_ROWS if r[0] == product_name)
    results = score_products([row], query)
    matched_names = [p["name"] for _, p in results]
    assert product_name in matched_names, f"{query!r} should match {product_name!r} at default threshold"


# ---------------------------------------------------------------------------
# Name-over-category regression tests (issue #112 — vinegar → Mazola Corn Oil)
# ---------------------------------------------------------------------------


def test_name_match_outranks_category_only_match():
    """Regression for UAT bug #112: 'vinegar' must not return 'Mazola - Corn Oil'.

    Both products share the category 'Oils & Vinegars' (fuzz WRatio 90 against
    'vinegar'), but only the second has 'vinegar' in its name. The name match
    must dominate the ranking regardless of shorter-name tiebreak.
    """
    rows = [
        ("Mazola - Corn Oil", "1 L", "pantry", "Oils & Vinegars", "community_market"),
        ("Allen's - Pure White Vinegar", "1 L", "pantry", "Oils & Vinegars", "community_market"),
        ("Marukan - Rice Vinegar", "500 ml", "pantry", "Oils & Vinegars", "community_market"),
    ]
    results = score_products(rows, "vinegar")
    assert results, "expected at least one match"
    top_name = results[0][1]["name"].lower()
    assert "vinegar" in top_name, f"top match should have 'vinegar' in name, got {top_name!r}"


def test_corn_prefers_name_over_popcorn_category():
    """Similar shape: 'corn' must not resolve to a Popcorn-category product
    when a product with 'corn' in its name is available."""
    rows = [
        ("Kirkland Microwave Butter Popcorn", "300 g", "snacks", "Popcorn", "costco"),
        ("Yellow Sweet Corn", "1 kg", "produce", "Corn", "saveonfoods"),
    ]
    results = score_products(rows, "corn")
    assert results, "expected at least one match"
    assert "sweet corn" in results[0][1]["name"].lower()


def test_category_only_match_still_returned_when_no_name_match():
    """Category rescue is preserved when no name-match product is available —
    it's just never allowed to outrank one."""
    rows = [
        ("Mazola - Corn Oil", "1 L", "pantry", "Oils & Vinegars", "community_market"),
    ]
    results = score_products(rows, "vinegar")
    assert len(results) == 1
    assert results[0][1]["name"] == "Mazola - Corn Oil"
