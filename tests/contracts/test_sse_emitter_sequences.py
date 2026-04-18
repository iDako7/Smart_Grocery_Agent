"""Contract tests: exact SSE event-type sequences emitted by emit_agent_result.

These tests are pure-function guards — no DB, no LLM, no HTTP.
They fail immediately on any rename of:
  - event-type string literals in src/ai/sse.py (call-site `_sse_line(...)` args)
  - event_type Literal fields on the Pydantic models in contracts/sse_events.py
    (enforced by SSEEvent discriminated-union validation in _validate_payload)
  - AgentResult / ClarifyTurnPayload field names (Pydantic validation at construction)

Sequence rule (from src/ai/sse.py):
  thinking*  →  pcsv_update?  →  recipe_card*  →  (clarify_turn XOR explanation?)
  →  grocery_list?  →  error?  →  done
"""

import json

from pydantic import TypeAdapter
from src.ai.sse import emit_agent_result
from src.ai.types import AgentResult, ToolCall

from contracts.sse_events import SSEEvent
from contracts.tool_schemas import (
    ClarifyOption,
    ClarifyQuestion,
    ClarifyTurnPayload,
    PCSVCategory,
    PCSVResult,
    RecipeSummary,
)

# ---------------------------------------------------------------------------
# Helpers (inlined so this file is self-contained and independent)
# ---------------------------------------------------------------------------

_SSE_EVENT_ADAPTER = TypeAdapter(SSEEvent)


async def _collect_events(result: AgentResult) -> list[str]:
    events: list[str] = []
    async for line in emit_agent_result(result):
        events.append(line)
    return events


def _parse_block(raw: str) -> tuple[str, str]:
    """Return (event-header type, data-line JSON string) from a single SSE block."""
    header = ""
    data = ""
    for line in raw.strip().split("\n"):
        if line.startswith("event: "):
            header = line[7:]
        elif line.startswith("data: "):
            data = line[6:]
    return header, data


def _validate_payload(raw: str) -> str:
    """Parse an SSE block, validate the JSON payload against SSEEvent,
    assert the header matches the payload discriminator, and return the header.

    Catches three rename classes in one shot:
      1. call-site event string drift in src/ai/sse.py
      2. Literal rename on any event model in contracts/sse_events.py
      3. header/payload discriminator mismatch
    """
    header, data = _parse_block(raw)
    assert data, f"SSE block missing data line: {raw!r}"
    payload = json.loads(data)
    model = _SSE_EVENT_ADAPTER.validate_python(payload)
    assert header == model.event_type, f"header {header!r} != payload event_type {model.event_type!r}"
    return header


def _event_types(events: list[str]) -> list[str]:
    return [_validate_payload(e) for e in events]


# ---------------------------------------------------------------------------
# Test 1: clarify result — thinking → pcsv_update → clarify_turn → done
# ---------------------------------------------------------------------------


async def test_clarify_result_emits_thinking_pcsv_clarify_done():
    """Clarify flow: one tool call + pcsv + clarify_turn → no explanation, no recipe_card."""
    pcsv = PCSVResult(
        protein=PCSVCategory(status="gap"),
        carb=PCSVCategory(status="low", items=["rice"]),
        veggie=PCSVCategory(status="gap"),
        sauce=PCSVCategory(status="gap"),
    )
    clarify = ClarifyTurnPayload(
        explanation="Let me ask a couple of quick questions before suggesting recipes.",
        questions=[
            ClarifyQuestion(
                id="dietary",
                text="Any dietary restrictions?",
                selection_mode="single",
                options=[ClarifyOption(label="None"), ClarifyOption(label="Vegetarian")],
            )
        ],
    )
    result = AgentResult(
        status="complete",
        response_text="",
        pcsv=pcsv,
        clarify_turn=clarify,
        tool_calls=[ToolCall(name="emit_clarify_turn", input={}, result={})],
    )

    events = await _collect_events(result)
    types = _event_types(events)

    assert types == ["thinking", "pcsv_update", "clarify_turn", "done"], (
        f"Expected [thinking, pcsv_update, clarify_turn, done], got {types}"
    )


# ---------------------------------------------------------------------------
# Test 2: recipe curation — thinking → pcsv_update → recipe_card → explanation → done
# ---------------------------------------------------------------------------


async def test_recipe_curation_emits_thinking_pcsv_recipe_explanation_done():
    """Normal recipe flow: tool call + pcsv + recipe + explanation text."""
    pcsv = PCSVResult(
        protein=PCSVCategory(status="low", items=["chicken"]),
        carb=PCSVCategory(status="low", items=["noodles"]),
        veggie=PCSVCategory(status="gap"),
        sauce=PCSVCategory(status="gap"),
    )
    result = AgentResult(
        status="complete",
        response_text="Try this dish.",
        pcsv=pcsv,
        recipes=[RecipeSummary(id="r1", name="Test")],
        clarify_turn=None,
        tool_calls=[ToolCall(name="analyze_pcsv", input={}, result={})],
    )

    events = await _collect_events(result)
    types = _event_types(events)

    assert types == ["thinking", "pcsv_update", "recipe_card", "explanation", "done"], (
        f"Expected [thinking, pcsv_update, recipe_card, explanation, done], got {types}"
    )


# ---------------------------------------------------------------------------
# Test 3: enforcement failure — error → done
#
# Invariant: tool_calls=[] on the enforcement-failure path, so the per-tool-call
# `thinking` loop emits nothing. recipes=[] and pcsv=None skip the recipe_card
# and pcsv_update blocks. The error block fires only when status=="partial" AND
# reason=="clarify_turn_enforcement_failed", then `done` closes the stream.
# ---------------------------------------------------------------------------


async def test_error_result_emits_error_done():
    """clarify_turn_enforcement_failed: no tool_calls, no pcsv, no recipes → error then done."""
    result = AgentResult(
        status="partial",
        reason="clarify_turn_enforcement_failed",
        response_text="",
        clarify_turn=None,
        tool_calls=[],
        pcsv=None,
        recipes=[],
    )

    events = await _collect_events(result)
    types = _event_types(events)

    assert types == ["error", "done"], f"Expected [error, done], got {types}"


# ---------------------------------------------------------------------------
# Test 4: max-iter fallback — explanation → done
#
# Invariant: tool_calls=[] → no thinking; pcsv=None and recipes=[] skip their
# blocks; status=="partial" WITHOUT reason=="clarify_turn_enforcement_failed"
# skips the error block; response_text is non-empty → explanation fires, then done.
# ---------------------------------------------------------------------------


async def test_partial_result_emits_explanation_done():
    """Max-iterations partial: no tool calls, has response_text → explanation then done."""
    result = AgentResult(
        status="partial",
        response_text="Ran out of iterations.",
        reason="max_iterations",
        clarify_turn=None,
        tool_calls=[],
        pcsv=None,
        recipes=[],
    )

    events = await _collect_events(result)
    types = _event_types(events)

    assert types == ["explanation", "done"], f"Expected [explanation, done], got {types}"
