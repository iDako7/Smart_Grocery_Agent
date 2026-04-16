"""Tests for search_recipes tool against real SQLite KB."""

import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.tools.search_recipes import _score_similarity, search_recipes

from contracts.tool_schemas import RecipeSummary, SearchRecipesInput


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


async def test_returns_results_for_common_ingredients(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"]))
    assert len(result) > 0
    assert all(r.ingredients_have for r in result)


async def test_results_sorted_by_match_score(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "garlic", "soy sauce"]))
    if len(result) >= 2:
        # Results should be sorted by match score (descending)
        for i in range(len(result) - 1):
            have_ratio_a = len(result[i].ingredients_have) / (
                len(result[i].ingredients_have) + len(result[i].ingredients_need)
            )
            have_ratio_b = len(result[i + 1].ingredients_have) / (
                len(result[i + 1].ingredients_have) + len(result[i + 1].ingredients_need)
            )
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


# ---------------------------------------------------------------------------
# Issue #56: include_alternatives tests
# ---------------------------------------------------------------------------


async def test_include_alternatives_false_unchanged(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"]))
    assert all(r.alternatives == [] for r in result)


async def test_alternatives_populated_when_requested(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"], include_alternatives=True))
    assert len(result) > 0
    primary_ids = {r.id for r in result}
    for r in result:
        assert len(r.alternatives) <= 2
        for alt in r.alternatives:
            assert alt.id not in primary_ids


async def test_alternatives_cross_primary_dedup(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"], include_alternatives=True))
    seen: set[str] = set()
    for r in result:
        for alt in r.alternatives:
            assert alt.id not in seen, f"alt {alt.id} appears under multiple primaries"
            seen.add(alt.id)


async def test_alternatives_nested_empty(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["chicken", "rice"], include_alternatives=True))
    for r in result:
        for alt in r.alternatives:
            assert alt.alternatives == []


async def test_alternatives_empty_when_no_candidates(kb):
    # Narrow filter that should yield very few rows; alternatives may be empty
    result = await search_recipes(
        kb,
        SearchRecipesInput(ingredients=["xyznonexistent"], include_alternatives=True),
    )
    # No primaries -> no exception, and no alternatives populated
    assert result == []


def _make_summary(
    rid: str,
    *,
    cuisine: str = "",
    method: str = "",
    proteins: list[str] | None = None,
    flavors: list[str] | None = None,
    effort: str = "medium",
) -> RecipeSummary:
    return RecipeSummary(
        id=rid,
        name=rid,
        cuisine=cuisine,
        cooking_method=method,
        effort_level=effort,  # type: ignore[arg-type]
        flavor_tags=flavors or [],
        pcsv_roles={"protein": proteins} if proteins else {},
    )


def test_score_similarity_cuisine_plus_method_beats_cuisine_alone():
    primary = _make_summary("p", cuisine="Korean", method="grill")
    cand_both = _make_summary("a", cuisine="Korean", method="grill")
    cand_cuisine_only = _make_summary("b", cuisine="Korean", method="bake")
    assert _score_similarity(primary, cand_both) > _score_similarity(primary, cand_cuisine_only)


def test_score_similarity_protein_match_dominates():
    primary = _make_summary("p", cuisine="Italian", method="bake", proteins=["chicken"])
    cand_chicken = _make_summary("a", cuisine="Italian", method="bake", proteins=["chicken"])
    cand_beef = _make_summary("b", cuisine="Italian", method="bake", proteins=["beef"])
    assert _score_similarity(primary, cand_chicken) > _score_similarity(primary, cand_beef)
