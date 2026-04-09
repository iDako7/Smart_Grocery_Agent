"""Tests for orchestrator — mock AsyncOpenAI, real tool handlers."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio

from src.ai.kb import get_kb
from src.ai.orchestrator import run_agent


@pytest_asyncio.fixture()
async def kb():
    db = await get_kb()
    yield db
    await db.close()


def _make_response(content=None, tool_calls=None, finish_reason="stop"):
    """Build a mock chat completion response."""
    message = MagicMock()
    message.content = content
    message.tool_calls = tool_calls or []
    message.model_dump = MagicMock(return_value={
        "role": "assistant",
        "content": content,
        "tool_calls": [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in (tool_calls or [])
        ] if tool_calls else None,
    })
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


async def test_simple_text_response(kb, seeded_user, db):
    """LLM returns text without tool calls."""
    mock_response = _make_response(content="Here's a suggestion!")
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        result = await run_agent("What should I cook?", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.response_text == "Here's a suggestion!"
    assert result.total_iterations == 1


async def test_tool_call_then_response(kb, seeded_user, db):
    """LLM calls analyze_pcsv, then responds."""
    tool_call = _make_tool_call("analyze_pcsv", {"ingredients": ["chicken", "rice"]})
    response_with_tool = _make_response(tool_calls=[tool_call], finish_reason="tool_calls")
    response_final = _make_response(content="Your protein is low!")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_tool, response_final]
    )

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        result = await run_agent("I have chicken and rice", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.total_iterations == 2
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].name == "analyze_pcsv"
    assert result.pcsv is not None


async def test_max_iterations_returns_partial(kb, seeded_user, db):
    """If LLM keeps calling tools, we stop at MAX_ITERATIONS."""
    tool_call = _make_tool_call("analyze_pcsv", {"ingredients": ["chicken"]})
    response_with_tool = _make_response(
        content="still thinking...", tool_calls=[tool_call], finish_reason="tool_calls"
    )

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=response_with_tool)

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        with patch("src.ai.orchestrator.MAX_ITERATIONS", 3):
            result = await run_agent("test", kb, db, seeded_user)

    assert result.status == "partial"
    assert result.total_iterations == 3


async def test_unknown_tool_returns_error(kb, seeded_user, db):
    """Unknown tool name returns error to LLM without crashing."""
    tool_call = _make_tool_call("nonexistent_tool", {})
    response_with_tool = _make_response(tool_calls=[tool_call], finish_reason="tool_calls")
    response_final = _make_response(content="I see there was an error.")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_tool, response_final]
    )

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        result = await run_agent("test", kb, db, seeded_user)

    assert result.status == "complete"
    assert any("error" in str(tc.result) for tc in result.tool_calls)


async def test_malformed_args_returns_error(kb, seeded_user, db):
    """Malformed JSON args returns error to LLM."""
    tc = MagicMock()
    tc.id = "call_1"
    tc.function = MagicMock()
    tc.function.name = "analyze_pcsv"
    tc.function.arguments = "{bad json"

    response_with_tool = _make_response(tool_calls=[tc], finish_reason="tool_calls")
    response_final = _make_response(content="Let me try again.")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_tool, response_final]
    )

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        result = await run_agent("test", kb, db, seeded_user)

    assert result.status == "complete"
    assert any("Malformed" in str(tc.result) for tc in result.tool_calls)


async def test_search_recipes_tool_call(kb, seeded_user, db):
    """LLM calls search_recipes and results are tracked."""
    tool_call = _make_tool_call("search_recipes", {"ingredients": ["chicken", "garlic"]})
    response_with_tool = _make_response(tool_calls=[tool_call], finish_reason="tool_calls")
    response_final = _make_response(content="Here are some recipes!")

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[response_with_tool, response_final]
    )

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        result = await run_agent("Find me chicken recipes", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.tool_calls[0].name == "search_recipes"


async def test_history_passed_to_llm(kb, seeded_user, db):
    """Previous conversation history is included in messages."""
    mock_response = _make_response(content="Got it!")
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    history = [
        {"role": "user", "content": "I have chicken"},
        {"role": "assistant", "content": "Let me analyze that."},
    ]

    with patch("src.ai.orchestrator.AsyncOpenAI", return_value=mock_client):
        result = await run_agent("What else?", kb, db, seeded_user, history=history)

    # Verify history was included in the call
    call_args = mock_client.chat.completions.create.call_args
    messages = call_args.kwargs["messages"]
    # system + 2 history + 1 user = 4 messages
    assert len(messages) == 4
    assert messages[1]["content"] == "I have chicken"
