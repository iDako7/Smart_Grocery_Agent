"""Contract tests for ClarifyTurnPayload, ClarifyTurnEvent, and emit_clarify_turn TOOLS entry."""

import pytest
from contracts.sse_events import ClarifyTurnEvent, ExplanationEvent, SSEEvent
from contracts.tool_schemas import (
    TOOLS,
    ClarifyOption,
    ClarifyQuestion,
    ClarifyTurnPayload,
)
from pydantic import TypeAdapter, ValidationError

# ---------------------------------------------------------------------------
# Test 1: Roundtrip
# ---------------------------------------------------------------------------


def test_clarify_turn_payload_roundtrip():
    """ClarifyTurnPayload survives model_dump_json → model_validate_json for various shapes."""

    # 0 questions, explanation only
    case_0 = ClarifyTurnPayload(explanation="Let's figure out your cooking setup first.")
    assert ClarifyTurnPayload.model_validate_json(case_0.model_dump_json()) == case_0

    # 1 single-mode question, 2 options, no exclusive
    case_1 = ClarifyTurnPayload(
        explanation="Tell me about your equipment so I can suggest the right method.",
        questions=[
            ClarifyQuestion(
                id="cooking_setup",
                text="What's your cooking setup?",
                selection_mode="single",
                options=[
                    ClarifyOption(label="Stovetop"),
                    ClarifyOption(label="Oven"),
                ],
            )
        ],
    )
    assert ClarifyTurnPayload.model_validate_json(case_1.model_dump_json()) == case_1

    # 1 multi-mode question, 3 options, one exclusive
    case_2 = ClarifyTurnPayload(
        explanation="Let me know your dietary needs so I can filter recipes.",
        questions=[
            ClarifyQuestion(
                id="dietary",
                text="Any dietary restrictions?",
                selection_mode="multi",
                options=[
                    ClarifyOption(label="Vegetarian"),
                    ClarifyOption(label="Gluten-free"),
                    ClarifyOption(label="None", is_exclusive=True),
                ],
            )
        ],
    )
    assert ClarifyTurnPayload.model_validate_json(case_2.model_dump_json()) == case_2

    # 3 questions mixing both modes
    case_3 = ClarifyTurnPayload(
        explanation="A few quick questions to tailor your meal plan.",
        questions=[
            ClarifyQuestion(
                id="cooking_setup",
                text="What's your cooking setup?",
                selection_mode="single",
                options=[ClarifyOption(label="Stovetop"), ClarifyOption(label="Air fryer")],
            ),
            ClarifyQuestion(
                id="dietary",
                text="Any dietary restrictions?",
                selection_mode="multi",
                options=[
                    ClarifyOption(label="Vegetarian"),
                    ClarifyOption(label="None", is_exclusive=True),
                ],
            ),
            ClarifyQuestion(
                id="effort",
                text="How much time do you have?",
                selection_mode="single",
                options=[
                    ClarifyOption(label="15 min"),
                    ClarifyOption(label="30 min"),
                    ClarifyOption(label="45+ min"),
                ],
            ),
        ],
    )
    assert ClarifyTurnPayload.model_validate_json(case_3.model_dump_json()) == case_3


# ---------------------------------------------------------------------------
# Test 2: Hard cap on question count
# ---------------------------------------------------------------------------


def test_clarify_turn_payload_rejects_too_many_questions():
    """ClarifyTurnPayload raises ValidationError when > 3 questions are provided."""

    def make_question(n: int) -> ClarifyQuestion:
        return ClarifyQuestion(
            id=f"q{n}",
            text=f"Question {n}?",
            selection_mode="single",
            options=[ClarifyOption(label="Yes"), ClarifyOption(label="No")],
        )

    # 4 questions must fail
    with pytest.raises(ValidationError):
        ClarifyTurnPayload(
            explanation="Too many questions here.",
            questions=[make_question(i) for i in range(4)],
        )

    # exactly 3 must succeed
    payload_3 = ClarifyTurnPayload(
        explanation="Three questions is fine.",
        questions=[make_question(i) for i in range(3)],
    )
    assert len(payload_3.questions) == 3

    # exactly 0 must succeed
    payload_0 = ClarifyTurnPayload(explanation="No questions needed.")
    assert len(payload_0.questions) == 0


# ---------------------------------------------------------------------------
# Test 3: SSEEvent discriminated union
# ---------------------------------------------------------------------------


def test_clarify_turn_event_in_sse_union():
    """ClarifyTurnEvent is correctly routed by the SSEEvent discriminated union."""
    adapter: TypeAdapter[SSEEvent] = TypeAdapter(SSEEvent)

    # Empty questions list
    payload_json = '{"event_type": "clarify_turn", "explanation": "Here\'s the direction: Korean BBQ with sides.", "questions": []}'
    event = adapter.validate_json(payload_json)
    assert isinstance(event, ClarifyTurnEvent)
    assert event.explanation == "Here's the direction: Korean BBQ with sides."
    assert event.questions == []

    # Non-empty questions list
    payload_with_q = (
        '{"event_type": "clarify_turn", "explanation": "Let me clarify your needs.", '
        '"questions": [{"id": "cooking_setup", "text": "What is your setup?", '
        '"selection_mode": "single", "options": [{"label": "Stovetop"}, {"label": "Oven"}]}]}'
    )
    event_q = adapter.validate_json(payload_with_q)
    assert isinstance(event_q, ClarifyTurnEvent)
    assert len(event_q.questions) == 1
    assert event_q.questions[0].id == "cooking_setup"

    # Negative: explanation event must NOT parse to ClarifyTurnEvent
    explanation_json = '{"event_type": "explanation", "text": "Some explanation text."}'
    explanation_event = adapter.validate_json(explanation_json)
    assert isinstance(explanation_event, ExplanationEvent)
    assert not isinstance(explanation_event, ClarifyTurnEvent)


# ---------------------------------------------------------------------------
# Test 4: emit_clarify_turn in TOOLS list
# ---------------------------------------------------------------------------


def test_emit_clarify_turn_in_tools_list():
    """TOOLS contains exactly one emit_clarify_turn entry with the expected structure."""
    matches = [t for t in TOOLS if t["function"]["name"] == "emit_clarify_turn"]
    assert len(matches) == 1, f"Expected exactly 1 emit_clarify_turn entry, got {len(matches)}"

    tool = matches[0]
    assert tool["type"] == "function"

    params = tool["function"]["parameters"]
    assert params["type"] == "object"

    props = params["properties"]
    assert "explanation" in props
    assert "questions" in props

    assert props["explanation"]["type"] == "string"
    assert props["questions"]["type"] == "array"

    required = params["required"]
    assert "explanation" in required
    assert "questions" in required

    # Check items schema for questions
    items = props["questions"]["items"]
    assert items["type"] == "object"
    q_props = items["properties"]
    assert "id" in q_props
    assert "text" in q_props
    assert "selection_mode" in q_props
    assert "options" in q_props

    items_required = items["required"]
    assert "id" in items_required
    assert "text" in items_required
    assert "selection_mode" in items_required
    assert "options" in items_required

    assert q_props["selection_mode"].get("enum") == ["single", "multi"], (
        "selection_mode must declare enum=['single','multi'] for OpenAI function-calling to constrain the LLM"
    )

    # Check options items schema
    option_items = q_props["options"]["items"]
    assert option_items["type"] == "object"
    assert "label" in option_items["properties"]
    assert "label" in option_items["required"]


# ---------------------------------------------------------------------------
# Test 5: W2 regression — ClarifyTurnEvent parses without questions key
# ---------------------------------------------------------------------------


def test_clarify_turn_event_deserializes_without_questions_key():
    """W2 regression: a JSON payload that omits the `questions` key should
    still parse, defaulting to an empty list. Guards against serializer
    fragility where an empty array might be omitted."""
    from contracts.sse_events import ClarifyTurnEvent, SSEEvent
    from pydantic import TypeAdapter

    # Minimal payload — no questions key at all
    payload_json = '{"event_type": "clarify_turn", "explanation": "Here is the direction: Korean BBQ."}'
    event = TypeAdapter(SSEEvent).validate_json(payload_json)
    assert isinstance(event, ClarifyTurnEvent)
    assert event.questions == []
    assert event.explanation == "Here is the direction: Korean BBQ."
