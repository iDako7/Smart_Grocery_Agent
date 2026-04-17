"""Tests for emit_clarify_turn tool handler and orchestrator dispatch."""

import json
import uuid
from unittest.mock import MagicMock

from src.ai.tools.emit_clarify_turn import emit_clarify_turn

from contracts.tool_schemas import ClarifyOption, ClarifyQuestion, ClarifyTurnPayload


async def test_emit_clarify_turn_handler_validates_payload():
    """Handler returns the payload unchanged when input is valid."""
    payload = ClarifyTurnPayload(
        explanation="Here's the direction: a Korean BBQ spread with sides.",
        questions=[
            ClarifyQuestion(
                id="cooking_setup",
                text="What's your cooking setup?",
                selection_mode="single",
                options=[
                    ClarifyOption(label="Outdoor grill"),
                    ClarifyOption(label="Stovetop"),
                ],
            ),
        ],
    )
    result = await emit_clarify_turn(payload)
    assert result == payload
    assert result.explanation == payload.explanation
    assert len(result.questions) == 1


async def test_emit_clarify_turn_handler_empty_questions():
    """Handler accepts a payload with zero questions (specific-input case)."""
    payload = ClarifyTurnPayload(
        explanation="Here's the direction: Korean BBQ for 8, halal-compliant.",
        questions=[],
    )
    result = await emit_clarify_turn(payload)
    assert result == payload
    assert result.questions == []


async def test_emit_clarify_turn_rejects_over_30_words():
    """31-word explanation returns an error dict for the orchestrator to retry."""
    text = " ".join(["word"] * 31)
    payload = ClarifyTurnPayload(explanation=text, questions=[])
    result = await emit_clarify_turn(payload)
    assert isinstance(result, dict)
    assert "error" in result


async def test_emit_clarify_turn_accepts_exactly_30_words():
    """Exactly 30 words passes the word-count check."""
    text = " ".join(["word"] * 30)
    payload = ClarifyTurnPayload(explanation=text, questions=[])
    result = await emit_clarify_turn(payload)
    assert result == payload


async def test_emit_clarify_turn_rejects_newlines():
    payload = ClarifyTurnPayload(
        explanation="First line.\nSecond line continues here.",
        questions=[],
    )
    result = await emit_clarify_turn(payload)
    assert isinstance(result, dict)
    assert "error" in result


async def test_emit_clarify_turn_rejects_bullet_list_prefix():
    payload = ClarifyTurnPayload(
        explanation="- A bulleted direction for dinner tonight.",
        questions=[],
    )
    result = await emit_clarify_turn(payload)
    assert isinstance(result, dict)
    assert "error" in result


async def test_emit_clarify_turn_rejects_bold_markdown():
    payload = ClarifyTurnPayload(
        explanation="Proposing a **bold** weeknight stir-fry direction.",
        questions=[],
    )
    result = await emit_clarify_turn(payload)
    assert isinstance(result, dict)
    assert "error" in result


async def test_orchestrator_dispatches_emit_clarify_turn():
    """Dispatcher routes emit_clarify_turn to the handler and returns validated payload."""
    from src.ai.orchestrator import _dispatch_tool

    raw_args = json.dumps(
        {
            "explanation": "Here's the direction: quick weeknight stir-fry.",
            "questions": [
                {
                    "id": "cuisine",
                    "text": "Any cuisine preference?",
                    "selection_mode": "single",
                    "options": [
                        {"label": "Chinese", "is_exclusive": False},
                        {"label": "Thai", "is_exclusive": False},
                    ],
                },
            ],
        }
    )

    kb = MagicMock()
    pg = MagicMock()
    user_id = uuid.uuid4()

    result_dict, tool_call = await _dispatch_tool("emit_clarify_turn", raw_args, kb, pg, user_id)

    assert tool_call.name == "emit_clarify_turn"
    assert result_dict["explanation"] == "Here's the direction: quick weeknight stir-fry."
    assert len(result_dict["questions"]) == 1
    assert result_dict["questions"][0]["id"] == "cuisine"
