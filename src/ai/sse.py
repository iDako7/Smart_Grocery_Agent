"""SSE emitter — converts AgentResult into a stream of SSE events.

Collect-then-emit: the orchestrator runs to completion, then we emit
typed events in rapid sequence.
"""

import json
from collections.abc import AsyncIterator

from contracts.sse_events import (
    AgentErrorCategory,
    ClarifyTurnEvent,
    DoneEvent,
    ErrorEvent,
    ExplanationEvent,
    GroceryListEvent,
    PcsvUpdateEvent,
    RecipeCardEvent,
    ThinkingEvent,
)
from src.ai.types import AgentResult


def _sse_line(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {payload}\n\n"


async def emit_agent_result(
    result: AgentResult,
    *,
    error_category: AgentErrorCategory | None = None,
) -> AsyncIterator[str]:
    """Emit SSE events from a completed AgentResult.

    Sequence: thinking* → pcsv_update → recipe_card(s) → explanation → grocery_list → done
    """
    # Thinking events (one per tool call)
    for tc in result.tool_calls:
        event = ThinkingEvent(message=f"Running {tc.name}...")
        yield _sse_line("thinking", event.model_dump())

    # PCSV update
    if result.pcsv:
        event = PcsvUpdateEvent(pcsv=result.pcsv)
        yield _sse_line("pcsv_update", event.model_dump())

    # Recipe cards
    for recipe in result.recipes:
        event = RecipeCardEvent(recipe=recipe)
        yield _sse_line("recipe_card", event.model_dump())

    # Clarify turn (mutually exclusive with explanation)
    if result.clarify_turn is not None:
        event = ClarifyTurnEvent(
            explanation=result.clarify_turn.explanation,
            questions=result.clarify_turn.questions,
        )
        yield _sse_line("clarify_turn", event.model_dump())
    elif result.response_text:
        # Explanation (the assistant's response text) — only when clarify_turn not set
        event = ExplanationEvent(text=result.response_text)
        yield _sse_line("explanation", event.model_dump())

    # Grocery list
    if result.grocery_list:
        event = GroceryListEvent(stores=result.grocery_list)
        yield _sse_line("grocery_list", event.model_dump())

    # Clarify enforcement retry failure — emit an error event so the frontend
    # routes through its error UI instead of rendering an empty ghost card.
    if result.status == "partial" and result.reason == "clarify_turn_enforcement_failed":
        err = ErrorEvent(
            message="Sorry — I couldn't prepare your clarification. Please try rephrasing.",
            code="clarify_turn_enforcement_failed",
            recoverable=True,
        )
        yield _sse_line("error", err.model_dump())

    # Done
    if result.status == "complete":
        if error_category is not None:
            raise ValueError("error_category must be None when status='complete'")
        done = DoneEvent(status="complete")
    else:
        done = DoneEvent(status="partial", reason=result.reason, error_category=error_category)
    yield _sse_line("done", done.model_dump())
