"""Unit tests for translate_term tool.

Covers: EN-to-ZH exact match, ZH-to-EN exact match (auto direction),
unknown term no-match, 'chicken' as its own exact glossary entry, and
gochujang Chinese translation.
"""

from prototype.tools.translate_term import translate_term


def test_chicken_wings_en_to_zh():
    """'chicken wings' must translate to '鸡翅' with exact match type."""
    result = translate_term("chicken wings")

    assert result["translation"] == "鸡翅"
    assert result["match_type"] == "exact"


def test_chicken_wings_zh_to_en():
    """'鸡翅' with direction='auto' must auto-detect ZH and return 'chicken wings'."""
    result = translate_term("鸡翅", direction="auto")

    assert result["translation"] == "chicken wings"
    assert result["match_type"] == "exact"


def test_unknown_term_none():
    """A term absent from the glossary must return match_type='none'."""
    result = translate_term("xyznotfood")

    assert result["match_type"] == "none"


def test_partial_match_chicken():
    """'chicken' is its own exact entry in glossary.json (maps to '鸡肉').

    The exact-match pass must find it before the partial-match pass fires,
    so match_type must be 'exact', not 'partial'.
    """
    result = translate_term("chicken")

    assert result["match_type"] == "exact"
    assert result["translation"] == "鸡肉"


def test_gochujang_has_chinese():
    """'gochujang' must translate to '韩国辣椒酱' with exact match."""
    result = translate_term("gochujang")

    assert result["translation"] == "韩国辣椒酱"
    assert result["match_type"] == "exact"
