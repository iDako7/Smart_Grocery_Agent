"""SSE emitter — converts AgentResult into a stream of SSE events.

Collect-then-emit: the orchestrator runs to completion, then we emit
typed events in rapid sequence.
"""

import json
from collections.abc import AsyncIterator

from contracts.sse_events import (
    DoneEvent,
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


async def emit_agent_result(result: AgentResult) -> AsyncIterator[str]:
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

    # Explanation (the assistant's response text)
    if result.response_text:
        event = ExplanationEvent(text=result.response_text)
        yield _sse_line("explanation", event.model_dump())

    # Grocery list
    if result.grocery_list:
        event = GroceryListEvent(stores=result.grocery_list)
        yield _sse_line("grocery_list", event.model_dump())

    # Done
    if result.status == "complete":
        done = DoneEvent(status="complete")
    else:
        done = DoneEvent(status="partial", reason=result.reason)
    yield _sse_line("done", done.model_dump())
