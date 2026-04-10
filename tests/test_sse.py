"""Tests for SSE emitter — event sequence and format."""

from contracts.tool_schemas import PCSVCategory, PCSVResult, RecipeSummary
from src.ai.sse import emit_agent_result
from src.ai.types import AgentResult, ToolCall


async def _collect_events(result: AgentResult) -> list[str]:
    events = []
    async for line in emit_agent_result(result):
        events.append(line)
    return events


def _parse_event(raw: str) -> tuple[str, str]:
    """Extract event type and data from SSE line."""
    lines = raw.strip().split("\n")
    event_type = ""
    data = ""
    for line in lines:
        if line.startswith("event: "):
            event_type = line[7:]
        elif line.startswith("data: "):
            data = line[6:]
    return event_type, data


async def test_complete_result_event_sequence():
    """Complete result emits: thinking → pcsv_update → recipe_card → explanation → done."""
    pcsv = PCSVResult(
        protein=PCSVCategory(status="low", items=["chicken"]),
        carb=PCSVCategory(status="low", items=["rice"]),
        veggie=PCSVCategory(status="gap"),
        sauce=PCSVCategory(status="gap"),
    )
    recipe = RecipeSummary(id="r001", name="Chicken Rice")
    result = AgentResult(
        status="complete",
        response_text="Here's my suggestion.",
        tool_calls=[ToolCall(name="analyze_pcsv", input={}, result={})],
        pcsv=pcsv,
        recipes=[recipe],
    )

    events = await _collect_events(result)
    types = [_parse_event(e)[0] for e in events]

    assert types == ["thinking", "pcsv_update", "recipe_card", "explanation", "done"]


async def test_simple_text_only():
    """Text response without tools emits: explanation → done."""
    result = AgentResult(status="complete", response_text="Just a text response.")
    events = await _collect_events(result)
    types = [_parse_event(e)[0] for e in events]
    assert types == ["explanation", "done"]


async def test_partial_result():
    """Partial result emits done with status=partial."""
    result = AgentResult(status="partial", response_text="Ran out of iterations.")
    events = await _collect_events(result)
    types = [_parse_event(e)[0] for e in events]
    assert "done" in types
    # Check done event content
    done_data = _parse_event(events[-1])[1]
    assert '"partial"' in done_data


async def test_thinking_events_per_tool_call():
    """Each tool call produces a thinking event."""
    result = AgentResult(
        status="complete",
        response_text="Done.",
        tool_calls=[
            ToolCall(name="analyze_pcsv", input={}, result={}),
            ToolCall(name="search_recipes", input={}, result={}),
        ],
    )
    events = await _collect_events(result)
    thinking_events = [e for e in events if _parse_event(e)[0] == "thinking"]
    assert len(thinking_events) == 2


async def test_sse_format():
    """Events follow SSE format: event: <type>\\ndata: <json>\\n\\n."""
    result = AgentResult(status="complete", response_text="Test.")
    events = await _collect_events(result)
    for event in events:
        assert event.startswith("event: ")
        assert "\ndata: " in event
        assert event.endswith("\n\n")
