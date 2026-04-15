"""Tests for orchestrator terminal recognition of emit_clarify_turn."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.orchestrator import run_agent


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


def _make_response(content=None, tool_calls=None, finish_reason="stop"):
    """Build a mock chat completion response."""
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


_CLARIFY_ARGS = {
    "explanation": "Let's make a weeknight Asian-fusion stir-fry with your chicken and vegetables.",
    "questions": [
        {
            "id": "cooking_setup",
            "text": "What's your cooking setup?",
            "selection_mode": "single",
            "options": [
                {"label": "Wok", "is_exclusive": False},
                {"label": "Pan", "is_exclusive": False},
            ],
        },
    ],
}


async def test_orchestrator_terminates_on_emit_clarify_turn(kb, seeded_user, db):
    """emit_clarify_turn causes the loop to terminate after exactly one LLM call."""
    tool_call = _make_tool_call("emit_clarify_turn", _CLARIFY_ARGS)
    response_with_tool = _make_response(tool_calls=[tool_call], finish_reason="tool_calls")

    # Second call should NEVER be made — but define it to detect if it is
    response_second = _make_response(
        tool_calls=[_make_tool_call("analyze_pcsv", {"ingredients": ["chicken"]}, call_id="call_2")],
        finish_reason="tool_calls",
    )

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_tool, response_second]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent("I have chicken and peppers, what should I make?", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.clarify_turn is not None
    assert result.clarify_turn.explanation == _CLARIFY_ARGS["explanation"]
    assert len(result.clarify_turn.questions) == 1
    # LLM called EXACTLY once — terminal, no follow-up iteration
    assert mock_client.chat.completions.create.call_count == 1


async def test_orchestrator_emit_clarify_turn_empty_questions(kb, seeded_user, db):
    """emit_clarify_turn with questions=[] still terminates correctly."""
    args_no_questions = {
        "explanation": "Let's focus on a quick chicken stir-fry for tonight.",
        "questions": [],
    }
    tool_call = _make_tool_call("emit_clarify_turn", args_no_questions)
    response_with_tool = _make_response(tool_calls=[tool_call], finish_reason="tool_calls")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=response_with_tool)

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent("Quick chicken dinner ideas", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.clarify_turn is not None
    assert result.clarify_turn.questions == []
    assert mock_client.chat.completions.create.call_count == 1


async def test_orchestrator_non_terminal_tools_still_loop(kb, seeded_user, db):
    """Regression guard: analyze_pcsv does NOT terminate the loop; clarify_turn stays None."""
    tool_call = _make_tool_call("analyze_pcsv", {"ingredients": ["chicken", "rice"]})
    response_with_tool = _make_response(tool_calls=[tool_call], finish_reason="tool_calls")
    response_final = _make_response(content="Here are my suggestions!")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_tool, response_final]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent("I have chicken and rice", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.clarify_turn is None
    # Both LLM calls were made (tool call + follow-up)
    assert mock_client.chat.completions.create.call_count == 2


# ---------------------------------------------------------------------------
# Clarify-screen enforcement tests (issue-46)
#
# Canonical decisions for the implementer:
#   - reason string for "retry also failed": "clarify_turn_enforcement_failed"
#   - The forced retry happens AFTER the main for-loop exits (post-loop check), NOT
#     inside the iteration loop
#   - Only ONE retry attempt — no retry-of-retry
#   - The forced retry uses the SAME message history built so far (including the
#     free-text assistant message that was the bad response)
#   - Forced retry passes: tool_choice={"type": "function", "function": {"name": "emit_clarify_turn"}}
# ---------------------------------------------------------------------------


async def test_clarify_screen_freetext_response_forces_retry_with_tool_choice(
    kb, seeded_user, db
):
    """When screen=clarify and LLM ends with free-text (no tool call), orchestrator
    must make ONE additional forced LLM call with tool_choice=emit_clarify_turn.
    If the retry succeeds, AgentResult has clarify_turn populated."""
    # First call: free-text response — no tool calls, finish_reason="stop"
    response_freetext = _make_response(
        content="Here are some meal ideas for you!", finish_reason="stop"
    )
    # Second call (forced retry): proper emit_clarify_turn tool call
    clarify_tool_call = _make_tool_call("emit_clarify_turn", _CLARIFY_ARGS, call_id="call_forced")
    response_clarify = _make_response(
        tool_calls=[clarify_tool_call], finish_reason="tool_calls"
    )

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_freetext, response_clarify]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "I have chicken and peppers, what should I make?",
            kb,
            db,
            seeded_user,
            screen="clarify",
        )

    # Exactly TWO LLM calls were made
    assert mock_client.chat.completions.create.call_count == 2

    # The second call must include tool_choice forcing emit_clarify_turn
    second_call_kwargs = mock_client.chat.completions.create.call_args_list[1].kwargs
    assert second_call_kwargs.get("tool_choice") == {
        "type": "function",
        "function": {"name": "emit_clarify_turn"},
    }

    # AgentResult reflects the forced tool call result
    assert result.status == "complete"
    assert result.clarify_turn is not None
    assert result.clarify_turn.explanation == _CLARIFY_ARGS["explanation"]
    assert len(result.clarify_turn.questions) == 1


async def test_clarify_screen_freetext_retry_also_fails_returns_error(
    kb, seeded_user, db
):
    """When screen=clarify and BOTH the normal call AND the forced retry return
    free-text (pathological model), orchestrator must return status='partial'
    with reason='clarify_turn_enforcement_failed' and clarify_turn=None."""
    # Both calls return free-text — forced retry also fails
    response_freetext_1 = _make_response(
        content="Here are some meal ideas!", finish_reason="stop"
    )
    response_freetext_2 = _make_response(
        content="Still just text, no tool call.", finish_reason="stop"
    )

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_freetext_1, response_freetext_2]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "I have chicken and peppers, what should I make?",
            kb,
            db,
            seeded_user,
            screen="clarify",
        )

    # status must signal failure — "partial" matches existing AgentResult convention
    assert result.status == "partial"
    # Canonical reason string the implementer must use
    assert result.reason == "clarify_turn_enforcement_failed"
    assert result.clarify_turn is None


async def test_non_clarify_screen_freetext_response_does_not_retry(
    kb, seeded_user, db
):
    """When screen != 'clarify', a free-text LLM response must NOT trigger a retry.
    Exactly ONE LLM call is made and response_text is returned as-is."""
    response_freetext = _make_response(
        content="Here are recipe suggestions!", finish_reason="stop"
    )
    # Define a second response to detect if a spurious second call is made
    response_second = _make_response(
        content="This should never be called.", finish_reason="stop"
    )

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_freetext, response_second]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "What recipes can I make with chicken?",
            kb,
            db,
            seeded_user,
            screen="recipes",
        )

    # Exactly ONE LLM call — no retry on non-clarify screen
    assert mock_client.chat.completions.create.call_count == 1
    assert result.status == "complete"
    assert result.response_text == "Here are recipe suggestions!"
    assert result.clarify_turn is None


async def test_clarify_screen_tool_calls_then_emit_clarify_turn_no_retry(
    kb, seeded_user, db
):
    """Regression guard for the clarify-screen happy path: when the LLM calls
    emit_clarify_turn organically (after other tool calls), the loop exits
    normally with no forced retry. Three LLM calls total — NOT four."""
    # Iteration 1: analyze_pcsv
    tc1 = _make_tool_call("analyze_pcsv", {"ingredients": ["chicken", "peppers"]}, call_id="call_1")
    response_1 = _make_response(tool_calls=[tc1], finish_reason="tool_calls")

    # Iteration 2: search_recipes
    tc2 = _make_tool_call(
        "search_recipes",
        {"ingredients": ["chicken", "peppers"], "max_results": 3},
        call_id="call_2",
    )
    response_2 = _make_response(tool_calls=[tc2], finish_reason="tool_calls")

    # Iteration 3: emit_clarify_turn — terminates loop
    tc3 = _make_tool_call("emit_clarify_turn", _CLARIFY_ARGS, call_id="call_3")
    response_3 = _make_response(tool_calls=[tc3], finish_reason="tool_calls")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_1, response_2, response_3]
    )

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent(
            "I have chicken and peppers, help me plan dinner",
            kb,
            db,
            seeded_user,
            screen="clarify",
        )

    # Exactly 3 LLM calls — no forced 4th retry
    assert mock_client.chat.completions.create.call_count == 3
    assert result.status == "complete"
    assert result.clarify_turn is not None
    assert result.clarify_turn.explanation == _CLARIFY_ARGS["explanation"]
