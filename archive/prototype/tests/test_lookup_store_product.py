"""Unit tests for lookup_store_product tool.

Covers: known product found, unknown product not-found sentinel, non-Costco
store placeholder response, and confidence score presence.
"""

from prototype.tools.lookup_store_product import lookup_store_product


def test_chicken_thighs_found():
    """'chicken thighs' should match a real Costco product in the KB.

    Result must include product_name, package_size, and department, and
    package_size must NOT be the not-found sentinel.
    """
    result = lookup_store_product("chicken thighs")

    assert "product_name" in result
    assert "package_size" in result
    assert "department" in result
    assert result["package_size"] != "not found"


def test_unknown_item_not_found():
    """A nonsense item name must return the not-found sentinel for package_size."""
    result = lookup_store_product("xyznotaproduct123")

    assert result["package_size"] == "not found"


def test_non_costco_store_placeholder():
    """Any store other than 'costco' must return a dict containing a 'note' key
    about community market data not being available in the prototype.
    """
    result = lookup_store_product("chicken", store="community_market")

    assert "note" in result
    assert "community market" in result["note"].lower()


def test_confidence_present():
    """A successful Costco product lookup must include a confidence key >= 0.60."""
    result = lookup_store_product("chicken thighs")

    assert "confidence" in result
    assert result["confidence"] >= 0.60
