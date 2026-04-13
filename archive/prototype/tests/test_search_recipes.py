"""Unit tests for search_recipes tool.

Covers: ranking, cuisine filter, max_time filter, zero-overlap empty return,
and match_score ratio correctness.
"""

from prototype.tools.search_recipes import search_recipes


def test_pork_belly_gochujang_ranks_r001_first():
    """r001 (Korean BBQ Pork Belly) should rank first for its two title ingredients."""
    results = search_recipes(["pork belly", "gochujang"])

    assert len(results) >= 1
    assert results[0]["id"] == "r001"


def test_cuisine_filter_excludes_non_korean():
    """Passing cuisine='Korean' must return only Korean-tagged recipes."""
    results = search_recipes(["pork belly", "gochujang"], cuisine="Korean")

    assert len(results) >= 1
    for recipe in results:
        assert recipe["cuisine"].lower() == "korean"


def test_max_time_filter():
    """max_time=20 must exclude any recipe whose time_minutes exceeds 20."""
    results = search_recipes(["chicken wings", "soy sauce"], max_time=20)

    for recipe in results:
        assert recipe["time_minutes"] <= 20


def test_zero_overlap_returns_empty():
    """A nonsense ingredient that appears in no recipe must yield an empty list."""
    results = search_recipes(["xyznotfood"])

    assert results == []


def test_match_score_is_ratio():
    """match_score must equal len(ingredients_have) / total recipe ingredients.

    Verifies the formula for the first result of a known search to avoid
    flakiness from recipe ordering changes.
    """
    results = search_recipes(["pork belly", "gochujang"])

    assert len(results) >= 1
    top = results[0]

    total_ingredients = len(top["ingredients_have"]) + len(top["ingredients_need"])
    expected_score = round(len(top["ingredients_have"]) / total_ingredients, 2)

    assert top["match_score"] == expected_score
