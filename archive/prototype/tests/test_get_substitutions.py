"""Unit tests for get_substitutions tool.

Covers: known ingredient returns substitutes, reason sorting, unknown ingredient
returns empty list, and partial string matching.
"""

from prototype.tools.get_substitutions import get_substitutions


def test_gochujang_has_substitutes():
    """'gochujang' is in substitutions.json and must return at least one entry."""
    results = get_substitutions("gochujang")

    assert len(results) >= 1


def test_reason_dietary_sorts_first():
    """When reason='dietary', results with reason_match=True should come first.

    substitutions.json has a dietary substitute for 'pork belly'
    (chicken thigh, reason='dietary'), so the first result must have
    reason_match=True.
    """
    results = get_substitutions("pork belly", reason="dietary")

    assert len(results) >= 1
    assert results[0]["reason_match"] is True


def test_unknown_ingredient_empty():
    """An ingredient not in substitutions.json must return an empty list."""
    results = get_substitutions("xyznotfood")

    assert results == []


def test_partial_match_pork():
    """'pork' is a substring of 'pork belly' in the data — partial match must work."""
    results = get_substitutions("pork")

    assert len(results) >= 1
