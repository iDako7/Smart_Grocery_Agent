"""Tests for ClarifyTurnPayload.to_context_text() serialization."""

from contracts.tool_schemas import ClarifyTurnPayload


def test_to_context_text_with_questions():
    payload = ClarifyTurnPayload(
        explanation="Let's make a weeknight stir-fry with your chicken.",
        questions=[
            {
                "id": "cooking_setup",
                "text": "What's your cooking setup?",
                "selection_mode": "single",
                "options": [{"label": "Wok"}, {"label": "Pan"}, {"label": "Instant Pot"}],
            },
            {
                "id": "spice_level",
                "text": "Preferred spice level?",
                "selection_mode": "single",
                "options": [{"label": "Mild"}, {"label": "Medium"}, {"label": "Spicy"}],
            },
        ],
    )
    text = payload.to_context_text()

    assert text.startswith("[Clarify turn]")
    assert "weeknight stir-fry" in text
    assert "What's your cooking setup?" in text
    assert "Wok, Pan, Instant Pot" in text
    assert "Preferred spice level?" in text
    assert "Mild, Medium, Spicy" in text


def test_to_context_text_no_questions():
    payload = ClarifyTurnPayload(
        explanation="Let's focus on a quick chicken dinner.",
        questions=[],
    )
    text = payload.to_context_text()

    assert text == "[Clarify turn] Let's focus on a quick chicken dinner."
    # No bullet lines when there are no questions
    assert "\n" not in text


def test_to_context_text_is_nonempty():
    """Regression: clarify turns must never produce empty response_text."""
    payload = ClarifyTurnPayload(
        explanation="A",
        questions=[],
    )
    assert len(payload.to_context_text()) > 0
