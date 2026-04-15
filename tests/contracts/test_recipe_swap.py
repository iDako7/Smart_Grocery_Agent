"""Contract tests for R2 Recipe Swap (issue #56) — Phase 1 additive schema changes.

Covers:
- RecipeSummary nested-alternatives roundtrip
- RecipeSummary default-empty alternatives
- SearchRecipesInput backward-compat (include_alternatives defaults to False)
"""

from contracts.tool_schemas import TOOLS, RecipeSummary, SearchRecipesInput


def test_recipe_summary_alternatives_roundtrip():
    nested = RecipeSummary(id="r002", name="Alt Recipe")
    parent = RecipeSummary(id="r001", name="Main Recipe", alternatives=[nested])

    dumped = parent.model_dump()
    restored = RecipeSummary.model_validate(dumped)

    assert restored == parent
    assert len(restored.alternatives) == 1
    assert restored.alternatives[0].id == "r002"
    assert restored.alternatives[0].alternatives == []


def test_recipe_summary_default_empty_alternatives():
    summary = RecipeSummary.model_validate({"id": "r001", "name": "No Alts"})
    assert summary.alternatives == []


def test_search_recipes_input_include_alternatives_defaults_false():
    parsed = SearchRecipesInput.model_validate({"ingredients": ["chicken", "rice"]})
    assert parsed.include_alternatives is False


def test_search_recipes_input_include_alternatives_explicit_true():
    parsed = SearchRecipesInput.model_validate(
        {"ingredients": ["chicken"], "include_alternatives": True}
    )
    assert parsed.include_alternatives is True


def test_search_recipes_tools_entry_documents_include_alternatives():
    search = next(
        t for t in TOOLS if t["function"]["name"] == "search_recipes"
    )
    props = search["function"]["parameters"]["properties"]
    assert "include_alternatives" in props
    assert props["include_alternatives"]["type"] == "boolean"
