"""Unit and integration tests for the orchestration layer.

Covers _dispatch_tool routing (8 cases) and run_agent loop behaviour
(7 cases): happy path, tool sequences, malformed JSON, iteration cap,
token accumulation, and default profile creation.

The OpenAI client is patched at the module level so no real network
calls are made.
"""

import json
from unittest.mock import MagicMock, patch

from prototype.orchestrator import MAX_ITERATIONS, _dispatch_tool, run_agent
from prototype.schema import UserProfile

# ---------------------------------------------------------------------------
# Mock response helpers
# ---------------------------------------------------------------------------


def _make_response(
    content,
    tool_calls_data,
    finish_reason,
    prompt_tokens,
    completion_tokens,
):
    """Build a MagicMock that mirrors the OpenAI SDK chat completion shape.

    Parameters
    ----------
    content:
        The assistant message text content (str or None).
    tool_calls_data:
        A list of (name, arguments_json_str) tuples, or None / empty list
        to produce a response with no tool calls.
    finish_reason:
        "stop" | "tool_calls"
    prompt_tokens, completion_tokens:
        Integers for usage tracking.
    """
    response = MagicMock()

    # Build tool call mocks from (name, arguments_json_str) tuples.
    if tool_calls_data:
        tc_mocks = []
        for name, arguments_json_str in tool_calls_data:
            tc = MagicMock()
            tc.function.name = name
            tc.function.arguments = arguments_json_str
            tc.id = f"call_{name}"
            tc_mocks.append(tc)
        tool_calls = tc_mocks
    else:
        tool_calls = None

    # Build the serialisable dict that message.model_dump() must return.
    # The orchestrator appends this directly to the messages list.
    if tool_calls:
        serialised_tool_calls = [
            {
                "id": f"call_{name}",
                "type": "function",
                "function": {"name": name, "arguments": args},
            }
            for name, args in tool_calls_data
        ]
    else:
        serialised_tool_calls = None

    message_dict = {
        "role": "assistant",
        "content": content,
        "tool_calls": serialised_tool_calls,
    }

    message = MagicMock()
    message.content = content
    message.tool_calls = tool_calls
    message.model_dump.return_value = message_dict

    choice = MagicMock()
    choice.message = message
    choice.finish_reason = finish_reason

    response.choices = [choice]
    response.usage.prompt_tokens = prompt_tokens
    response.usage.completion_tokens = completion_tokens

    return response


def _make_text_response(content, prompt_tokens=100, completion_tokens=50):
    """Shortcut: assistant finishes with a text reply and no tool calls."""
    return _make_response(
        content=content,
        tool_calls_data=None,
        finish_reason="stop",
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


def _make_tool_response(tool_calls_data, content=None, prompt_tokens=100, completion_tokens=50):
    """Shortcut: assistant issues one or more tool calls."""
    return _make_response(
        content=content,
        tool_calls_data=tool_calls_data,
        finish_reason="tool_calls",
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


# ---------------------------------------------------------------------------
# _dispatch_tool tests (8 cases) — no mocking needed, pure routing
# ---------------------------------------------------------------------------


def test_dispatch_analyze_pcsv(default_profile):
    """analyze_pcsv dispatch returns a result with a 'carb' key and a status."""
    result = _dispatch_tool("analyze_pcsv", {"ingredients": ["rice"]}, default_profile)

    assert "carb" in result
    assert "status" in result["carb"]


def test_dispatch_search_recipes(default_profile):
    """search_recipes dispatch returns a list."""
    result = _dispatch_tool("search_recipes", {"ingredients": ["pork belly"]}, default_profile)

    assert isinstance(result, list)


def test_dispatch_lookup_store_product(default_profile):
    """lookup_store_product dispatch returns a dict with a 'product_name' key."""
    result = _dispatch_tool("lookup_store_product", {"item_name": "chicken"}, default_profile)

    assert "product_name" in result


def test_dispatch_get_substitutions(default_profile):
    """get_substitutions dispatch returns a list."""
    result = _dispatch_tool("get_substitutions", {"ingredient": "gochujang"}, default_profile)

    assert isinstance(result, list)


def test_dispatch_get_recipe_detail(default_profile):
    """get_recipe_detail dispatch returns a dict whose 'id' matches the requested recipe."""
    result = _dispatch_tool("get_recipe_detail", {"recipe_id": "r001"}, default_profile)

    assert "id" in result
    assert result["id"] == "r001"


def test_dispatch_update_user_profile(default_profile):
    """update_user_profile dispatch sets the field on the live profile object."""
    result = _dispatch_tool(
        "update_user_profile",
        {"field": "household_size", "value": 4},
        default_profile,
    )

    assert result["updated"] is True
    assert default_profile.household_size == 4


def test_dispatch_translate_term(default_profile):
    """translate_term dispatch returns a dict with a 'translation' key."""
    result = _dispatch_tool("translate_term", {"term": "chicken wings"}, default_profile)

    assert "translation" in result


def test_dispatch_unknown_tool(default_profile):
    """An unrecognised tool name returns an error dict containing 'Unknown tool'."""
    result = _dispatch_tool("nonexistent_tool", {}, default_profile)

    assert "error" in result
    assert "Unknown tool" in result["error"]


# ---------------------------------------------------------------------------
# run_agent tests (7 cases) — patch OpenAI client
# ---------------------------------------------------------------------------


def test_simple_response_no_tools(mock_openai_env):
    """When the model replies directly with no tool calls the loop exits after
    one iteration and the response text is surfaced verbatim."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_text_response("Hello!")

        result = run_agent("hi")

    assert result.status == "complete"
    assert result.total_iterations == 1
    assert result.tool_calls == []
    assert result.response_text == "Hello!"


def test_single_tool_call_then_response(mock_openai_env):
    """One tool call followed by a text reply produces two iterations and one
    recorded ToolCall entry."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            _make_tool_response([("analyze_pcsv", json.dumps({"ingredients": ["rice"]}))]),
            _make_text_response("Done."),
        ]

        result = run_agent("What can I cook?")

    assert result.status == "complete"
    assert result.total_iterations == 2
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].name == "analyze_pcsv"


def test_multi_tool_sequence(mock_openai_env):
    """Two sequential tool calls followed by a final text reply produce three
    iterations and two ToolCall records in call order."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            _make_tool_response([("analyze_pcsv", json.dumps({"ingredients": ["rice"]}))]),
            _make_tool_response([("search_recipes", json.dumps({"ingredients": ["rice"]}))]),
            _make_text_response("Here are recipes."),
        ]

        result = run_agent("Plan my meals")

    assert result.total_iterations == 3
    assert len(result.tool_calls) == 2
    assert result.tool_calls[0].name == "analyze_pcsv"
    assert result.tool_calls[1].name == "search_recipes"


def test_malformed_json_arguments(mock_openai_env):
    """When a tool call carries unparseable JSON the error is captured in the
    ToolCall result under the 'error' key and contains 'Malformed'."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            _make_tool_response([("analyze_pcsv", "not valid json{{")]),
            _make_text_response("Recovered."),
        ]

        result = run_agent("What do I need?")

    assert result.status == "complete"
    assert len(result.tool_calls) == 1
    assert "error" in result.tool_calls[0].result
    assert "Malformed" in str(result.tool_calls[0].result["error"])


def test_iteration_cap_returns_partial(mock_openai_env):
    """When the model keeps calling tools without ever finishing the loop
    terminates at MAX_ITERATIONS and returns status='partial'."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        # Always return a tool call — never a stop response.
        mock_client.chat.completions.create.side_effect = [
            _make_tool_response([("analyze_pcsv", json.dumps({"ingredients": ["rice"]}))])
            for _ in range(MAX_ITERATIONS)
        ]

        result = run_agent("Keep going forever")

    assert result.status == "partial"
    assert result.total_iterations == MAX_ITERATIONS
    assert len(result.tool_calls) == MAX_ITERATIONS


def test_token_usage_accumulated(mock_openai_env):
    """Token counts from every LLM call are summed and surfaced in AgentResult."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            _make_tool_response(
                [("analyze_pcsv", json.dumps({"ingredients": ["rice"]}))],
                prompt_tokens=100,
                completion_tokens=50,
            ),
            _make_text_response("Done.", prompt_tokens=200, completion_tokens=80),
        ]

        result = run_agent("Track my tokens")

    assert result.input_tokens == 300
    assert result.output_tokens == 130


def test_default_profile_created(mock_openai_env):
    """Passing profile=None must not raise; the agent creates a default profile
    internally and returns a complete result."""
    with patch("prototype.orchestrator.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_text_response("Hi there!")

        result = run_agent("hello", profile=None)

    assert result.status == "complete"
