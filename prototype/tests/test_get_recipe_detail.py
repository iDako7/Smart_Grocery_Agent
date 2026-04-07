"""Unit tests for get_recipe_detail tool.

Covers: known recipe returns full structured dict, invalid ID returns error key.
"""

from prototype.tools.get_recipe_detail import get_recipe_detail


def test_r001_returns_full_recipe():
    """r001 must return a complete recipe dict with required structural keys."""
    result = get_recipe_detail("r001")

    # Required keys must all be present
    for key in ("id", "name", "instructions", "ingredients", "source"):
        assert key in result, f"Missing key: {key}"

    assert result["id"] == "r001"
    assert result["name"] == "Korean BBQ Pork Belly"

    # Instructions must be non-empty
    assert isinstance(result["instructions"], str)
    assert len(result["instructions"]) > 0

    # Ingredients must be a non-empty list
    assert isinstance(result["ingredients"], list)
    assert len(result["ingredients"]) > 0


def test_invalid_id_returns_error():
    """A recipe ID that does not exist must return a dict with an 'error' key."""
    result = get_recipe_detail("r999")

    assert "error" in result
