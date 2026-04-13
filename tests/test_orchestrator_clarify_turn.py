"""Tests for orchestrator terminal recognition of emit_clarify_turn."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.orchestrator import run_agent
from contracts.tool_schemas import ClarifyTurnPayload


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
