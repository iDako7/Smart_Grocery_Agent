"""Tests for search_recipes tool against real SQLite KB."""

import pytest
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
    user = ["chicken", "garlic", "soy sauce"]
    result = await search_recipes(kb, SearchRecipesInput(ingredients=user))
    if len(result) >= 2:
        # Primary sort: pantry coverage (len(have) / len(user_ingredients)).
        # Secondary: recipe coverage. Variety dedupe by cooking_method may
        # interleave a lower-coverage different-method recipe ahead of a
        # duplicate-method higher one, so we check pairwise non-increasing
        # after we account for dedupe.
        def pantry_cov(r):
            return len(r.ingredients_have) / len(user)
        for i in range(len(result) - 1):
            assert pantry_cov(result[i]) >= pantry_cov(result[i + 1]) or (
                result[i].cooking_method and result[i].cooking_method != result[i + 1].cooking_method
            ), f"pantry-cov order or variety-dedupe expected at index {i}"


async def test_max_10_results(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["salt", "oil", "garlic"]))
    assert len(result) <= 10


async def test_cuisine_filter(kb):
    # Use ingredients+cuisine combo that yields non-empty. Filter relaxation
    # (issue #87) falls back to unfiltered when the combo yields zero — covered
    # by test_filter_relaxation_when_cuisine_yields_empty.
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["rice"], cuisine="Korean"))
    assert len(result) > 0
    for r in result:
        assert r.cuisine.lower() == "korean"


async def test_no_match_returns_empty(kb):
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["xyznonexistent"]))
    assert result == []


async def test_effort_level_filter(kb):
    # Use ingredients+effort combo that yields non-empty. Filter relaxation
    # (issue #87) falls back to unfiltered when the combo yields zero — covered
    # by test_filter_relaxation_when_effort_level_yields_empty.
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["rice"], effort_level="quick"))
    assert len(result) > 0
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


@pytest.mark.parametrize("max_results", [3, 5, 10])
async def test_search_recipes_honors_max_results(kb, max_results):
    """search_recipes must cap results to at most max_results."""
    result = await search_recipes(
        kb, SearchRecipesInput(ingredients=["salt", "oil", "garlic"], max_results=max_results)
    )
    assert len(result) <= max_results


# ---------------------------------------------------------------------------
# Issue #87: filter relaxation fallback
# ---------------------------------------------------------------------------


async def test_filter_relaxation_when_effort_level_yields_empty(kb):
    """If the effort_level filter eliminates all matches, fall back to
    unfiltered ingredient search rather than returning empty.

    Regression scenario: model passes effort_level='quick' for chicken+broccoli
    (all KB matches are 'medium'), previously returning 0 → user sees empty panel.
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "broccoli"],
            effort_level="quick",
            max_results=3,
        ),
    )
    assert len(result) > 0, (
        "filter relaxation should fall back to unfiltered search when effort_level filter returns nothing"
    )


async def test_filter_relaxation_when_cuisine_yields_empty(kb):
    """cuisine filter that matches no KB rows for the given ingredients
    triggers fallback to unfiltered search.
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice", "mixed vegetables"],
            cuisine="BBQ",
            max_results=3,
        ),
    )
    assert len(result) > 0, "filter relaxation should fall back when cuisine filter returns nothing"


async def test_filter_relaxation_when_combined_filters_yield_empty(kb):
    """All three filters set, none matching → fallback to unfiltered."""
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice"],
            cuisine="BBQ",
            cooking_method="grill",
            effort_level="quick",
            max_results=3,
        ),
    )
    assert len(result) > 0


async def test_no_fallback_when_ingredients_unmatched(kb):
    """Relaxation only fires for filter-emptied results. Ingredients that
    don't exist in the KB at all still return empty — don't invent recipes.
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["xyznonexistent_ingredient_qwerty"],
            effort_level="quick",
        ),
    )
    assert result == []


async def test_no_fallback_when_filters_absent(kb):
    """When no restrictive filters are passed and ingredients don't match,
    result is empty (not a fallback case)."""
    result = await search_recipes(kb, SearchRecipesInput(ingredients=["xyznonexistent_qwerty"]))
    assert result == []


# ---------------------------------------------------------------------------
# Issue #124: pantry-coverage scoring, primary-protein filter, dietary filter
# ---------------------------------------------------------------------------

_HALAL_BAD_WORDS = {"pork", "bacon", "ham", "lard", "guanciale", "prosciutto", "pancetta", "chorizo", "pepperoni", "salami", "sausage", "wine", "beer", "sake", "mirin", "gelatin"}
_VEGETARIAN_BAD_WORDS = {"chicken", "beef", "pork", "lamb", "turkey", "duck", "bacon", "ham", "sausage", "salmon", "tuna", "shrimp", "prawn", "fish", "anchovy"}


def _contains_bad_word(text: str, bad_words: set[str]) -> str | None:
    """Token-based check — prevents 'ham' matching 'muhammara'."""
    import re as _re
    tokens = set(_re.findall(r"\w+", text.lower()))
    for bad in bad_words:
        if bad in tokens:
            return bad
    return None


async def test_dietary_halal_filters_pork_from_primaries(kb):
    """User with halal restriction: no primary result may contain pork/bacon/etc."""
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice", "broccoli"],
            dietary_restrictions=["halal"],
            include_alternatives=True,
            max_results=5,
        ),
    )
    assert len(result) > 0, "halal chicken+rice should still yield primaries"
    for r in result:
        joined = " ".join(r.ingredients_have + r.ingredients_need)
        bad = _contains_bad_word(joined, _HALAL_BAD_WORDS)
        assert bad is None, f"halal violation: primary {r.id} contains '{bad}' in '{joined}'"


async def test_dietary_halal_filters_alternatives(kb):
    """Alternatives must respect the dietary filter too (issue #124 root cause)."""
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice", "broccoli"],
            dietary_restrictions=["halal"],
            include_alternatives=True,
            max_results=5,
        ),
    )
    for r in result:
        for alt in r.alternatives:
            joined = " ".join(alt.ingredients_have + alt.ingredients_need)
            bad = _contains_bad_word(joined, _HALAL_BAD_WORDS)
            assert bad is None, f"halal violation in alternative {alt.id}: '{bad}'"


async def test_dietary_vegetarian_filters_meat(kb):
    """Vegetarian user: no primary or alternative may contain meat/poultry/fish."""
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["tofu", "mushrooms"],
            dietary_restrictions=["vegetarian"],
            include_alternatives=True,
            max_results=3,
        ),
    )
    assert len(result) > 0
    for r in result:
        all_names = r.ingredients_have + r.ingredients_need
        for alt in r.alternatives:
            all_names += alt.ingredients_have + alt.ingredients_need
        joined = " ".join(all_names)
        bad = _contains_bad_word(joined, _VEGETARIAN_BAD_WORDS)
        assert bad is None, f"vegetarian violation: '{bad}' in {joined}"


async def test_primary_protein_soft_rank_chicken(kb):
    """User says chicken → top-scored primaries share chicken.

    Iter 2 softened this from hard filter to soft +2.0 score bonus. We still
    expect the TOP primary to share the user's protein when the KB has
    qualifying recipes, but we tolerate lower-ranked primaries that don't
    (keeps B2 beef+egg from collapsing to 1 recipe).
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(ingredients=["chicken", "broccoli"], max_results=5),
    )
    assert len(result) > 0
    top_proteins = " ".join(result[0].pcsv_roles.get("protein", [])).lower()
    assert "chicken" in top_proteins, (
        f"top primary {result[0].id} has proteins {result[0].pcsv_roles.get('protein')} — "
        f"expected chicken to rank first via soft protein bonus"
    )


async def test_primary_protein_soft_rank_beef_egg(kb):
    """User says beef+egg+rice → at least one top primary shares beef OR egg.

    Soft-rank version (iter 2): we don't require every result to share a
    named protein (that was the iter 1 over-filter). We DO require the top
    primary to share one, and that we return >=2 recipes (B2 regression
    sentinel — iter 1 returned 1).
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(ingredients=["beef", "egg", "rice"], max_results=5),
    )
    assert len(result) >= 2, f"expected >=2 primaries for beef+egg+rice (iter 1 regression), got {len(result)}"
    top_proteins = " ".join(result[0].pcsv_roles.get("protein", [])).lower()
    assert "beef" in top_proteins or "egg" in top_proteins, (
        f"top primary {result[0].id} has proteins {result[0].pcsv_roles.get('protein')} — "
        f"expected beef or egg to rank first via soft protein bonus"
    )


async def test_rice_does_not_match_rice_vinegar(kb):
    """Token-boundary staple exclusion: user 'rice' shouldn't count 'rice vinegar' as a match."""
    from src.ai.tools.search_recipes import _ingredient_matches
    assert _ingredient_matches("rice", "rice vinegar") is False
    assert _ingredient_matches("rice", "rice wine") is False
    assert _ingredient_matches("rice", "rice noodles") is False
    # Still allows real rice matches
    assert _ingredient_matches("rice", "jasmine rice") is True
    assert _ingredient_matches("rice", "white rice") is True


async def test_variety_dedupe_by_cuisine_and_method(kb):
    """Top-N primaries should not repeat the same (cuisine, cooking_method) combo.

    Iter 2: dedupe key is (cuisine, method) — catches A2's "two Korean rice
    bowls" and C1's "two Chinese stir-fries" which slipped through
    method-alone dedupe.
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(ingredients=["tofu", "mushrooms"], max_results=3),
    )
    combos = [(r.cuisine.lower(), r.cooking_method.lower()) for r in result if r.cuisine and r.cooking_method]
    if len(combos) >= 2:
        assert len(set(combos)) == len(combos), (
            f"(cuisine, method) dedupe failed — duplicates in top-{len(result)}: {combos}"
        )


async def test_dietary_preserved_across_filter_relaxation(kb):
    """Relaxation fallback must NOT drop dietary_restrictions (issue #124)."""
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice"],
            cuisine="BBQ",  # unlikely to match → triggers relaxation
            dietary_restrictions=["halal"],
            max_results=5,
        ),
    )
    assert len(result) > 0, "expected relaxation fallback to return results"
    for r in result:
        joined = " ".join(r.ingredients_have + r.ingredients_need)
        bad = _contains_bad_word(joined, _HALAL_BAD_WORDS)
        assert bad is None, f"relaxation dropped halal filter: '{bad}' in {r.id}"
