"""Regression tests for issue #87 — dish-count inconsistency.

Covers the narrative-vs-presentation bug (H2) and the orchestrator
recipe_results accumulation landmine (fix shape #5 in the diagnosis
doc, `docs/02-notes/issue-87-dish-count-root-cause.md`).
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.orchestrator import accumulate_recipe_results, run_agent

from contracts.tool_schemas import RecipeSummary


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


def _recipe(id_: str, name: str = "Test Recipe") -> RecipeSummary:
    return RecipeSummary(
        id=id_,
        name=name,
        name_zh="",
        cuisine="",
        cooking_method="",
        effort_level="medium",
        flavor_tags=[],
        serves=2,
        pcsv_roles={},
        ingredients_have=[],
        ingredients_need=[],
    )


def _recipe_dict(id_: str, name: str = "Test Recipe") -> dict:
    return {
        "id": id_,
        "name": name,
        "name_zh": "",
        "cuisine": "",
        "cooking_method": "",
        "effort_level": "medium",
        "flavor_tags": [],
        "serves": 2,
        "pcsv_roles": {},
        "ingredients_have": [],
        "ingredients_need": [],
    }


def _make_response(content=None, tool_calls=None, finish_reason="stop"):
    message = MagicMock()
    message.content = content
    message.tool_calls = tool_calls or []
    message.model_dump = MagicMock(
        return_value={
            "role": "assistant",
            "content": content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in (tool_calls or [])
            ]
            if tool_calls
            else None,
        }
    )
    choice = MagicMock()
    choice.message = message
    choice.finish_reason = finish_reason
    response = MagicMock()
    response.choices = [choice]
    return response


def _make_tool_call(name, args_dict, call_id="call_1"):
    tc = MagicMock()
    tc.id = call_id
    tc.function = MagicMock()
    tc.function.name = name
    tc.function.arguments = json.dumps(args_dict)
    return tc


# ---------------------------------------------------------------------------
# Unit tests — accumulate_recipe_results
# ---------------------------------------------------------------------------


def test_accumulate_preserves_existing_when_new_is_empty():
    """Landmine fix: a later zero-result search MUST NOT wipe prior recipes."""
    existing = [_recipe("r1"), _recipe("r2")]
    result = accumulate_recipe_results(existing, [])
    assert [r.id for r in result] == ["r1", "r2"]


def test_accumulate_replaces_when_new_is_non_empty():
    """Non-empty new result replaces existing (newest narrowing wins)."""
    existing = [_recipe("r1")]
    new_raw = [_recipe_dict("r2"), _recipe_dict("r3")]
    result = accumulate_recipe_results(existing, new_raw)
    assert [r.id for r in result] == ["r2", "r3"]


def test_accumulate_validates_raw_dicts_to_recipe_summary():
    """Raw dicts from tool output coerce into RecipeSummary."""
    result = accumulate_recipe_results([], [_recipe_dict("r1", name="Soup")])
    assert len(result) == 1
    assert isinstance(result[0], RecipeSummary)
    assert result[0].id == "r1"
    assert result[0].name == "Soup"


def test_accumulate_preserves_when_both_empty():
    """Empty existing + empty new stays empty (no crash)."""
    assert accumulate_recipe_results([], []) == []


# ---------------------------------------------------------------------------
# Integration tests — run_agent orchestration invariant (issue #87)
# ---------------------------------------------------------------------------


async def test_recipes_surface_even_when_terminal_narrative_omits_them(kb, seeded_user, db):
    """H2 regression: when search_recipes returns non-empty but the model's
    terminal text narrates a PCSV gap instead of presenting recipes,
    AgentResult.recipes MUST still carry the retrieved recipes.

    This is the exact shape of the A1/A3/A4 failure documented in
    docs/02-notes/issue-87-dish-count-root-cause.md §3.
    """
    search_call = _make_tool_call(
        "search_recipes",
        {"ingredients": ["chicken", "broccoli"], "max_results": 3},
    )
    response_with_search = _make_response(
        tool_calls=[search_call], finish_reason="tool_calls"
    )
    terminal_narrative = _make_response(
        content=(
            "A good direction is a quick chicken and broccoli dinner with "
            "a carb and simple sauce added."
        )
    )

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_search, terminal_narrative]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "I have chicken and broccoli. Dinner for two.",
            kb,
            db,
            seeded_user,
            screen="home",
        )

    assert result.status == "complete"
    assert len(result.recipes) >= 1, (
        "search_recipes returned recipes; they MUST surface on AgentResult.recipes "
        "regardless of whether the terminal narrative mentions them."
    )


async def test_recipes_preserved_when_second_search_returns_empty(kb, seeded_user, db):
    """Landmine regression: two search_recipes calls — first returns recipes,
    second (with tighter filters) returns empty. AgentResult.recipes must
    retain the first call's results.
    """
    search1 = _make_tool_call(
        "search_recipes",
        {"ingredients": ["chicken"], "max_results": 3},
        call_id="call_search_1",
    )
    response_search1 = _make_response(
        tool_calls=[search1], finish_reason="tool_calls"
    )

    search2 = _make_tool_call(
        "search_recipes",
        {
            "ingredients": ["chicken", "rare_spice_that_matches_nothing_xyz123"],
            "max_results": 3,
        },
        call_id="call_search_2",
    )
    response_search2 = _make_response(
        tool_calls=[search2], finish_reason="tool_calls"
    )

    terminal = _make_response(content="Here are some chicken recipes.")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_search1, response_search2, terminal]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "I have chicken", kb, db, seeded_user, screen="home"
        )

    assert result.status == "complete"
    assert len(result.recipes) >= 1, (
        "first search returned recipes; second search's empty result must "
        "NOT wipe them (orchestrator.py:281 landmine)."
    )


async def test_recipes_replaced_when_second_search_returns_non_empty(kb, seeded_user, db):
    """Two successful searches: newest narrowing wins. Accumulator uses
    replace-on-non-empty semantics to avoid duplicate cards across calls.
    """
    # First call: broad chicken search
    search1 = _make_tool_call(
        "search_recipes",
        {"ingredients": ["chicken"], "max_results": 5},
        call_id="call_search_1",
    )
    # Second call: narrowed with cuisine filter — still returns hits
    search2 = _make_tool_call(
        "search_recipes",
        {"ingredients": ["chicken"], "cuisine": "Chinese", "max_results": 3},
        call_id="call_search_2",
    )
    terminal = _make_response(content="Narrowed to Chinese chicken dishes.")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[
            _make_response(tool_calls=[search1], finish_reason="tool_calls"),
            _make_response(tool_calls=[search2], finish_reason="tool_calls"),
            terminal,
        ]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "I have chicken", kb, db, seeded_user, screen="home"
        )

    assert result.status == "complete"
    # Check no duplicate recipe IDs in result (replace semantics, not union)
    ids = [r.id for r in result.recipes]
    assert len(ids) == len(set(ids)), (
        f"duplicate recipe IDs in result: {ids} — accumulator should replace, not union"
    )
