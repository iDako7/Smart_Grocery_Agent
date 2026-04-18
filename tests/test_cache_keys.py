"""Tests for src/ai/cache/keys.py — pure helper functions.

TDD: these tests were written before the implementation.
All tests must be failing (ImportError) before keys.py exists.
"""

from __future__ import annotations

import json
from typing import Optional

import pytest
from pydantic import BaseModel

from contracts.tool_schemas import (
    PCSVCategory,
    PCSVResult,
    RecipeSummary,
    RecipeDetail,
    Ingredient,
)


# ---------------------------------------------------------------------------
# canonical_json
# ---------------------------------------------------------------------------


def test_canonical_json_sorts_keys():
    from src.ai.cache.keys import canonical_json

    a = canonical_json({"b": 2, "a": 1})
    b = canonical_json({"a": 1, "b": 2})
    assert a == b
    # Verify it is valid UTF-8 bytes
    assert isinstance(a, bytes)
    a.decode("utf-8")


def test_canonical_json_unicode():
    from src.ai.cache.keys import canonical_json

    payload = {"ingredient": "豆腐", "note": "tofu"}
    result = canonical_json(payload)
    assert isinstance(result, bytes)
    text = result.decode("utf-8")
    # Chinese characters must NOT be escaped as \uXXXX
    assert "豆腐" in text
    assert r"\u" not in text
    # Round-trip check
    recovered = json.loads(text)
    assert recovered == payload


def test_canonical_json_nested_and_list():
    from src.ai.cache.keys import canonical_json

    payload = {"z": [3, 1, 2], "a": {"y": "yes", "n": "no"}}
    result = canonical_json(payload)
    assert isinstance(result, bytes)
    # Keys are sorted; list order is preserved (sort_keys only affects dicts)
    parsed = json.loads(result)
    assert parsed == payload


# ---------------------------------------------------------------------------
# compute_key
# ---------------------------------------------------------------------------


def test_compute_key_format():
    from src.ai.cache.keys import compute_key

    key = compute_key("analyze_pcsv", {"ingredients": ["chicken", "rice"]})
    assert key.startswith("sga:tool:analyze_pcsv:")
    suffix = key[len("sga:tool:analyze_pcsv:"):]
    assert len(suffix) == 64
    assert all(c in "0123456789abcdef" for c in suffix)


def test_compute_key_arg_order_invariance():
    from src.ai.cache.keys import compute_key

    key1 = compute_key("search_recipes", {"cuisine": "Chinese", "ingredients": ["tofu"]})
    key2 = compute_key("search_recipes", {"ingredients": ["tofu"], "cuisine": "Chinese"})
    assert key1 == key2


def test_compute_key_differs_by_tool_name():
    from src.ai.cache.keys import compute_key

    args = {"ingredients": ["chicken"]}
    key1 = compute_key("analyze_pcsv", args)
    key2 = compute_key("search_recipes", args)
    assert key1 != key2


def test_compute_key_differs_by_args():
    from src.ai.cache.keys import compute_key

    key1 = compute_key("analyze_pcsv", {"ingredients": ["chicken"]})
    key2 = compute_key("analyze_pcsv", {"ingredients": ["tofu"]})
    assert key1 != key2


# ---------------------------------------------------------------------------
# encode_value / decode_value
# ---------------------------------------------------------------------------


def _make_pcsv_result() -> PCSVResult:
    return PCSVResult(
        protein=PCSVCategory(status="ok", items=["chicken"]),
        carb=PCSVCategory(status="gap", items=[]),
        veggie=PCSVCategory(status="low", items=["spinach"]),
        sauce=PCSVCategory(status="ok", items=["soy sauce"]),
    )


def _make_recipe_summaries() -> list[RecipeSummary]:
    return [
        RecipeSummary(id="r001", name="Stir-Fried Tofu", cuisine="Chinese"),
        RecipeSummary(id="r002", name="Chicken Rice", cuisine="Singaporean"),
    ]


def test_encode_decode_model_roundtrip():
    from src.ai.cache.keys import encode_value, decode_value

    original = _make_pcsv_result()
    encoded = encode_value(original)
    assert isinstance(encoded, bytes)

    # Envelope check
    envelope = json.loads(encoded)
    assert envelope["kind"] == "model"
    assert "data" in envelope

    decoded = decode_value(encoded, PCSVResult)
    assert isinstance(decoded, PCSVResult)
    assert decoded == original


def test_encode_decode_list_roundtrip():
    from src.ai.cache.keys import encode_value, decode_value

    originals = _make_recipe_summaries()
    encoded = encode_value(originals)
    assert isinstance(encoded, bytes)

    envelope = json.loads(encoded)
    assert envelope["kind"] == "list"
    assert isinstance(envelope["data"], list)
    assert len(envelope["data"]) == 2

    decoded = decode_value(encoded, list[RecipeSummary])
    assert isinstance(decoded, list)
    assert len(decoded) == 2
    assert decoded[0] == originals[0]
    assert decoded[1] == originals[1]


def test_encode_decode_none():
    from src.ai.cache.keys import encode_value, decode_value

    encoded = encode_value(None)
    assert isinstance(encoded, bytes)

    envelope = json.loads(encoded)
    assert envelope["kind"] == "none"

    # Optional[PCSVResult] — typing.Optional form
    decoded_optional = decode_value(encoded, Optional[PCSVResult])
    assert decoded_optional is None

    # X | None union form
    decoded_union = decode_value(encoded, PCSVResult | None)
    assert decoded_union is None


def test_encode_decode_none_for_recipe_detail():
    from src.ai.cache.keys import encode_value, decode_value

    encoded = encode_value(None)
    decoded = decode_value(encoded, Optional[RecipeDetail])
    assert decoded is None


def test_encode_decode_dict_roundtrip():
    from src.ai.cache.keys import encode_value, decode_value

    payload = {"foo": "bar", "count": 42}
    encoded = encode_value(payload)
    assert isinstance(encoded, bytes)

    envelope = json.loads(encoded)
    assert envelope["kind"] == "dict"
    assert envelope["data"] == payload

    # decode_value with dict return_type
    decoded = decode_value(encoded, dict)
    assert decoded == payload


def test_encode_unsupported_raises_typeerror():
    from src.ai.cache.keys import encode_value

    with pytest.raises(TypeError, match="unsupported"):
        encode_value(42)

    with pytest.raises(TypeError, match="unsupported"):
        encode_value("raw string")

    with pytest.raises(TypeError, match="unsupported"):
        encode_value([1, 2, 3])  # list of non-BaseModel ints


def test_decode_kind_mismatch_raises():
    from src.ai.cache.keys import encode_value, decode_value

    # Encode a model, try to decode as list[RecipeSummary] → mismatch
    encoded = encode_value(_make_pcsv_result())
    with pytest.raises(ValueError, match="kind"):
        decode_value(encoded, list[RecipeSummary])


def test_decode_list_kind_mismatch_raises():
    from src.ai.cache.keys import encode_value, decode_value

    # Encode a list, try to decode as a single model → mismatch
    encoded = encode_value(_make_recipe_summaries())
    with pytest.raises(ValueError, match="kind"):
        decode_value(encoded, RecipeSummary)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_canonical_json_empty_dict():
    from src.ai.cache.keys import canonical_json

    result = canonical_json({})
    assert result == b"{}"


def test_canonical_json_empty_list():
    from src.ai.cache.keys import canonical_json

    result = canonical_json([])
    assert result == b"[]"


def test_canonical_json_none_value():
    from src.ai.cache.keys import canonical_json

    result = canonical_json(None)
    assert result == b"null"


def test_compute_key_empty_args():
    from src.ai.cache.keys import compute_key

    key = compute_key("analyze_pcsv", {})
    assert key.startswith("sga:tool:analyze_pcsv:")
    suffix = key[len("sga:tool:analyze_pcsv:"):]
    assert len(suffix) == 64


def test_encode_empty_list_of_models():
    from src.ai.cache.keys import encode_value, decode_value

    encoded = encode_value([])
    # Empty list — kind should still be "list"
    envelope = json.loads(encoded)
    assert envelope["kind"] == "list"
    assert envelope["data"] == []

    decoded = decode_value(encoded, list[RecipeSummary])
    assert decoded == []
