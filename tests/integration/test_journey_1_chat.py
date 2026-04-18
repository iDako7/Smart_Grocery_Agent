"""Integration tests — multi-turn /chat journey.

These tests exercise the real orchestrator (run_agent) through the HTTP layer,
mocking only the LLM client (_get_client). All DB I/O is real PostgreSQL.

Issue coverage:
- #98  clarify_turn context preservation (response_text = to_context_text())
- R7   natural-language history preserved across 3 turns
- Profile mutations persist across /chat calls via get_user_profile
"""

from tests.integration.conftest import (
    make_response,
    make_tool_call,
    parse_sse_events,
)

# Reuse the exact _CLARIFY_ARGS shape from test_orchestrator_clarify_turn.py
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

# The expected context text produced by ClarifyTurnPayload.to_context_text()
_EXPECTED_CONTEXT_TEXT_FRAGMENT = "[Clarify turn]"
_EXPECTED_EXPLANATION = _CLARIFY_ARGS["explanation"]


async def _create_session(client) -> str:
    """Helper: POST /session and return session_id string."""
    resp = await client.post("/session")
    assert resp.status_code == 201, f"create session failed: {resp.text}"
    return resp.json()["session_id"]


async def _chat(client, session_id: str, message: str, screen: str):
    """Helper: POST /session/{sid}/chat and return the response."""
    resp = await client.post(
        f"/session/{session_id}/chat",
        json={"message": message, "screen": screen},
    )
    assert resp.status_code == 200, f"chat failed: {resp.text}"
    return resp


# ---------------------------------------------------------------------------
# Test 1: #98 regression — clarify turn context preserved in turn 2
# ---------------------------------------------------------------------------


async def test_clarify_then_recipes_preserves_context(client, mock_llm):
    """Turn 1 emits clarify_turn; turn 2's messages kwarg must include the
    clarify context text so the LLM knows what was clarified.

    RED invariant: fails if orchestrator.py:414 uses response_text=""
    instead of response_text=clarify_turn_payload.to_context_text().
    """
    # --- Turn 1: mock returns emit_clarify_turn (terminal) ---
    clarify_tc = make_tool_call("emit_clarify_turn", _CLARIFY_ARGS, call_id="call_clarify_1")
    turn1_response = make_response(tool_calls=[clarify_tc], finish_reason="tool_calls")

    # --- Turn 2: mock returns a free-text terminal response ---
    turn2_response = make_response(content="Great, I'll suggest Wok-based recipes for you!", finish_reason="stop")

    mock_llm.side_effect = [turn1_response, turn2_response]

    sid = await _create_session(client)

    # Turn 1
    resp1 = await _chat(client, sid, "I have chicken and peppers", "home")
    events1 = list(parse_sse_events(resp1))
    event_types1 = [e["event"] for e in events1]

    # (a) Turn 1 SSE must emit a clarify_turn event
    assert "clarify_turn" in event_types1, f"Expected 'clarify_turn' event in turn 1 SSE events, got: {event_types1}"

    # Turn 2 — screen="home" avoids the clarify-screen forced-retry branch
    # (orchestrator.py:321-368). The #98 regression is about context preservation
    # across any two /chat turns, not specifically the clarify→clarify transition.
    resp2 = await _chat(client, sid, "option Wok", "home")
    list(parse_sse_events(resp2))  # consume stream

    # (b) Turn 2's messages must contain the clarify context as an assistant message
    assert mock_llm.call_count >= 2, "Expected at least 2 LLM calls (one per turn)"

    # The last call from turn 2
    turn2_call_kwargs = mock_llm.call_args_list[-1].kwargs
    messages = turn2_call_kwargs["messages"]

    # Find assistant messages in turn 2's message list
    assistant_messages = [m for m in messages if m.get("role") == "assistant"]
    assert assistant_messages, "No assistant messages found in turn 2's message history"

    # Concatenate all assistant message content for inspection
    all_assistant_content = []
    for m in assistant_messages:
        content = m.get("content") or ""
        if isinstance(content, list):
            # content-block array — flatten text blocks
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    all_assistant_content.append(block.get("text", ""))
        elif isinstance(content, str):
            all_assistant_content.append(content)
    combined = "\n".join(all_assistant_content)

    assert _EXPECTED_CONTEXT_TEXT_FRAGMENT in combined, (
        f"Expected '[Clarify turn]' in assistant history for turn 2, got:\n{combined!r}"
    )
    assert _EXPECTED_EXPLANATION in combined, (
        f"Expected clarify explanation in assistant history for turn 2, got:\n{combined!r}"
    )


# ---------------------------------------------------------------------------
# Test 2: 3-turn history preservation (R7)
# ---------------------------------------------------------------------------


async def test_clarify_then_recipes_then_remove_preserves_history(client, mock_llm):
    """Turn 1 → clarify, Turn 2 → search_recipes + terminal text, Turn 3 →
    natural-language 'remove' request. Turn 3's messages kwarg must carry
    BOTH prior user messages AND BOTH prior assistant messages.
    """
    # Turn 1: clarify (terminal)
    clarify_tc = make_tool_call("emit_clarify_turn", _CLARIFY_ARGS, call_id="call_clarify_t1")
    t1_resp = make_response(tool_calls=[clarify_tc], finish_reason="tool_calls")

    # Turn 2: search_recipes then terminal text (2 LLM calls)
    search_tc = make_tool_call(
        "search_recipes",
        {"ingredients": ["chicken", "peppers"], "max_results": 3},
        call_id="call_search_t2",
    )
    t2_resp_search = make_response(tool_calls=[search_tc], finish_reason="tool_calls")
    t2_resp_final = make_response(
        content="Here are 3 recipes with chicken and peppers for you.",
        finish_reason="stop",
    )

    # Turn 3: terminal text (1 LLM call)
    t3_resp = make_response(
        content="I've removed the second recipe from your list.",
        finish_reason="stop",
    )

    mock_llm.side_effect = [t1_resp, t2_resp_search, t2_resp_final, t3_resp]

    sid = await _create_session(client)

    await _chat(client, sid, "I have chicken and peppers", "home")
    # screen="home" avoids the clarify-screen forced-retry branch
    # (orchestrator.py:321-368) exhausting the mock side_effect list.
    await _chat(client, sid, "option Wok", "home")
    await _chat(client, sid, "please remove the second one", "recipes")

    # Turn 3 is the last LLM call
    t3_call_kwargs = mock_llm.call_args_list[-1].kwargs
    messages = t3_call_kwargs["messages"]

    user_messages = [m for m in messages if m.get("role") == "user"]
    assistant_messages = [m for m in messages if m.get("role") == "assistant"]

    # History must include: user turn 1 + user turn 2 + current user turn 3 = 3 user messages
    assert len(user_messages) >= 3, (
        f"Expected at least 3 user messages in turn 3 history, got {len(user_messages)}: "
        f"{[m.get('content') for m in user_messages]}"
    )

    # History must include: assistant turn 1 (clarify context text) + assistant turn 2 = 2 assistant messages
    assert len(assistant_messages) >= 2, (
        f"Expected at least 2 assistant messages in turn 3 history, got {len(assistant_messages)}: "
        f"{[m.get('content') for m in assistant_messages]}"
    )


# ---------------------------------------------------------------------------
# Test 3: dietary restriction persists across /chat calls
# ---------------------------------------------------------------------------


async def test_dietary_restriction_persists_across_turns(client, mock_llm):
    """Turn 1: 'I keep halal' → update_user_profile(dietary_restrictions=[halal]).
    Turn 2: The system prompt injected into the LLM call must contain 'halal',
    confirming get_user_profile() re-reads the mutated DB row on the next /chat.
    """
    # Turn 1: update_user_profile then terminal text (2 LLM calls)
    update_tc = make_tool_call(
        "update_user_profile",
        {"field": "dietary_restrictions", "value": ["halal"]},
        call_id="call_update_t1",
    )
    t1_resp_tool = make_response(tool_calls=[update_tc], finish_reason="tool_calls")
    t1_resp_final = make_response(
        content="Got it! I've noted that you keep halal.",
        finish_reason="stop",
    )

    # Turn 2: terminal text (1 LLM call)
    t2_resp = make_response(
        content="Here are some halal chicken recipes.",
        finish_reason="stop",
    )

    mock_llm.side_effect = [t1_resp_tool, t1_resp_final, t2_resp]

    sid = await _create_session(client)

    await _chat(client, sid, "I keep halal", "home")
    await _chat(client, sid, "what should I cook with chicken?", "home")

    # Turn 2 is the last LLM call
    t2_call_kwargs = mock_llm.call_args_list[-1].kwargs
    messages = t2_call_kwargs["messages"]

    # The system message is the first message with role=="system".
    # Its content is a content-block array (list of dicts with "type" and "text").
    system_messages = [m for m in messages if m.get("role") == "system"]
    assert system_messages, "No system message found in turn 2's messages"

    system_content = system_messages[0].get("content", "")
    if isinstance(system_content, list):
        # Flatten all text blocks
        system_text = " ".join(
            block.get("text", "") for block in system_content if isinstance(block, dict) and block.get("type") == "text"
        )
    else:
        system_text = str(system_content)

    assert "halal" in system_text.lower(), (
        f"Expected 'halal' in system prompt for turn 2, but system text was:\n{system_text!r}"
    )
