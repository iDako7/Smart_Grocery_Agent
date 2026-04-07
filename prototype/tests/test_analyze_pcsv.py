"""Unit tests for analyze_pcsv tool.

Covers eval matrix scenarios plus edge cases: empty input, exact match,
partial match, dual-role ingredients, and deduplication.
"""

from prototype.tools.analyze_pcsv import analyze_pcsv


def test_chicken_wings_and_rice():
    """Eval matrix case: chicken wings + rice.

    protein=low (1 item), carb=low (1 item), veggie=gap, sauce=gap.
    Note: _status(1) returns "low", not "ok" — the eval doc is wrong.
    """
    result = analyze_pcsv(["chicken wings", "rice"])

    assert result["protein"]["status"] == "low"
    assert "chicken wings" in result["protein"]["items"]

    assert result["carb"]["status"] == "low"
    assert "rice" in result["carb"]["items"]

    assert result["veggie"]["status"] == "gap"
    assert result["veggie"]["items"] == []

    assert result["sauce"]["status"] == "gap"
    assert result["sauce"]["items"] == []


def test_tofu_bok_choy_soy_sauce():
    """Eval matrix case: tofu + bok choy + soy sauce.

    protein=low, carb=gap, veggie=low, sauce=low.
    """
    result = analyze_pcsv(["tofu", "bok choy", "soy sauce"])

    assert result["protein"]["status"] == "low"
    assert "tofu" in result["protein"]["items"]

    assert result["carb"]["status"] == "gap"
    assert result["carb"]["items"] == []

    assert result["veggie"]["status"] == "low"
    assert "bok choy" in result["veggie"]["items"]

    assert result["sauce"]["status"] == "low"
    assert "soy sauce" in result["sauce"]["items"]


def test_empty_list():
    """Empty ingredient list: all four categories must be gap with no items."""
    result = analyze_pcsv([])

    for category in ("protein", "carb", "veggie", "sauce"):
        assert result[category]["status"] == "gap"
        assert result[category]["items"] == []


def test_partial_match_chicken():
    """'chicken' is an exact key in pcsv_mappings.json and maps to protein."""
    result = analyze_pcsv(["chicken"])

    assert result["protein"]["status"] == "low"
    assert "chicken" in result["protein"]["items"]


def test_true_partial_match():
    """'wing' is not a key itself but should partial-match 'chicken wings'.

    The implementation searches for key-in-query or query-in-key.
    'wing' is in 'chicken wings', so protein role should be assigned.
    """
    result = analyze_pcsv(["wing"])

    # Partial match must place the ingredient in protein
    assert result["protein"]["status"] == "low"
    assert len(result["protein"]["items"]) == 1


def test_multi_role_ingredient():
    """'chickpeas' maps to both protein and carb roles in pcsv_mappings.json."""
    result = analyze_pcsv(["chickpeas"])

    assert result["protein"]["status"] == "low"
    assert "chickpeas" in result["protein"]["items"]

    assert result["carb"]["status"] == "low"
    assert "chickpeas" in result["carb"]["items"]


def test_duplicate_not_double_counted():
    """Passing 'chicken' twice must not create two entries in protein items."""
    result = analyze_pcsv(["chicken", "chicken"])

    assert len(result["protein"]["items"]) == 1
    assert result["protein"]["items"] == ["chicken"]
