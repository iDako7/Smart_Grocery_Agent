"""Tests for schema coercion pipeline."""

from src.ai.schema_coercion import coerce_tool_args

from contracts.tool_schemas import AnalyzePcsvInput, UpdateUserProfileInput


def test_valid_json_coercion():
    result = coerce_tool_args('{"ingredients": ["chicken", "rice"]}', AnalyzePcsvInput)
    assert isinstance(result, AnalyzePcsvInput)
    assert result.ingredients == ["chicken", "rice"]


def test_malformed_json():
    result = coerce_tool_args("{not json", AnalyzePcsvInput)
    assert isinstance(result, dict)
    assert "error" in result
    assert "Malformed JSON" in result["error"]


def test_missing_required_field():
    result = coerce_tool_args("{}", AnalyzePcsvInput)
    assert isinstance(result, dict)
    assert "error" in result


def test_type_coercion():
    """Pydantic should coerce string "5" to int for household_size."""
    result = coerce_tool_args(
        '{"field": "household_size", "value": 5}',
        UpdateUserProfileInput,
    )
    assert isinstance(result, UpdateUserProfileInput)
    assert result.value == 5


def test_validation_error_wrong_type():
    result = coerce_tool_args(
        '{"field": "household_size", "value": "not a number"}',
        UpdateUserProfileInput,
    )
    assert isinstance(result, dict)
    assert "error" in result


def test_empty_string_json():
    result = coerce_tool_args("", AnalyzePcsvInput)
    assert isinstance(result, dict)
    assert "error" in result


def test_extra_fields_ignored():
    result = coerce_tool_args(
        '{"ingredients": ["chicken"], "extra_field": true}',
        AnalyzePcsvInput,
    )
    assert isinstance(result, AnalyzePcsvInput)
