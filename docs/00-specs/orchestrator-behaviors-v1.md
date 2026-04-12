# SGA V2 — Orchestrator Behavioral Specification

**Date:** 2026-04-11 | **Status:** Active | **Owner:** Dako (@iDako7)

---

## 1. Purpose

This document specifies **orchestrator-level behaviors** that are not covered by the product spec (what features exist), the contracts (what the data looks like), or the architecture spec (how the system is structured). It bridges the gap between product features and implementation by defining: what triggers each behavior, what data flows, what gets populated, and what the postconditions are.

**Audience:** Implementation agents (Claude Code, Cursor) . Each section is self-contained — an agent can read only the relevant section for its current task.

**Relationship to other docs:**

| Document | Defines | This doc fills the gap |
|:---------|:--------|:----------------------|
| `product-spec-v2.md` | What features exist, acceptance criteria | When/how orchestrator behaviors fire |
| `contracts/` | Data shapes (Pydantic models, SQL schemas) | When fields get populated, by what logic |
| `architecture-spec-v2.md` | System structure, tech stack, ADRs | Behavioral rules the orchestrator must follow |
| `phase-2-implementation-plan.md` | Build order, worktree assignments | (Consumes this doc as input) |

---

## 2. Grocery List Pipeline

> Product spec: R6, G1 | Contract types: `GroceryStore`, `GroceryDepartment`, `GroceryItem` (from `contracts/sse_events.py`)

### Trigger

User taps "Build shopping list" on the Recipes screen. Frontend collects all checked "buy" pills (items the user has NOT toggled off) and calls a dedicated backend endpoint.

### Endpoint

`POST /session/{session_id}/grocery-list`

This is a **new endpoint**, separate from `/chat`. It does not go through the agent orchestration loop. No LLM involvement.

### Request

```
{
  "items": [
    {
      "ingredient_name": "gochujang",
      "amount": "3 tbsp",
      "recipe_name": "Korean BBQ Pork Belly",
      "recipe_id": "r001"
    },
    ...
  ]
}
```

The frontend constructs this from the recipe cards' `ingredients_need[]` arrays, filtering out any "buy" pills the user toggled off.

### Backend behavior

For each item in the request:

| Step | Action | Contract type |
|:-----|:-------|:-------------|
| 1 | Fuzzy-match `ingredient_name` against `products` table (same `rapidfuzz` logic as `lookup_store_product` tool handler) | — |
| 2a | **Match found:** assign to store + department, create `GroceryItem` with `recipe_context = "for {recipe_name}"` | `GroceryItem` |
| 2b | **No match:** assign to "Other" store with empty department | `GroceryItem` |
| 3 | Group all items by store → department | `GroceryStore` → `GroceryDepartment` |
| 4 | Write result to `sessions.state_snapshot["grocery_list"]` | — |
| 5 | Return `GroceryStore[]` as JSON response | `GroceryStore` |

### Postconditions

- `sessions.state_snapshot["grocery_list"]` is populated (enables "Save grocery list" later)
- Frontend navigates to Grocery screen and renders the response
- The `GroceryListEvent` SSE type is NOT used — this endpoint returns a regular JSON response, not an SSE stream

### Contract note: GroceryListEvent

`GroceryListEvent` in `contracts/sse_events.py` remains in the contract but is not emitted in Phase 2. Its inner type `GroceryStore` is reused as the response shape for this endpoint (imported by `contracts/api_types.py`). The SSE event is reserved for potential Phase 3 progressive streaming where the agent might generate grocery suggestions inline during the `/chat` flow.

---

## 3. Screen Navigation Context

> Product spec: §5 System Behavior, prompt assembly | ADR-17: Screen-Agnostic API Design

### Trigger

Every `POST /session/{id}/chat` call includes a `screen` field in `ChatRequest`.

### Current state

`build_system_prompt(profile)` takes only the user profile. The `screen` value is saved to `conversation_turns` (for logging) and `sessions.screen` (for resume), but is **not passed to the prompt assembler or the orchestrator**.

### Required behavior

`build_system_prompt()` should accept `screen` as a second parameter and append a navigation context section to the system prompt:

```
## Current Screen
The user is currently on the {screen_name} screen.
Flow: Home → Clarify → Recipes → Grocery
```

This gives the agent awareness of where the user is in the flow. Per ADR-17, this is informational context only — it does **not** constrain the agent to screen-specific actions. The agent remains free to handle any user intent regardless of screen (e.g., user on Recipes screen mentions needing baby food → agent can regenerate all recipes).

**Fallback:** `ChatRequest.screen` is a required Pydantic `Literal` field — requests without it are rejected at validation. However, `build_system_prompt()` should handle a missing `screen` parameter defensively (e.g., from tests or future internal callers) by omitting the navigation context block entirely rather than erroring.

### What does NOT change

- SSE event emission remains screen-agnostic (ADR-17) — backend always emits all relevant event types
- `load_context()` does not filter or prioritize turns by screen (ADR-22's token-based truncation is sufficient)
- No screen-specific tool restrictions

### Implementation scope

One change: add `screen` parameter to `build_system_prompt()` in `src/ai/prompt.py` and append the navigation context section. The caller in `src/backend/api/sessions.py` already has `body.screen` available — pass it through `run_agent()` to the prompt assembler.

---

## 4. SSE Event Population Rules

> Contract: `contracts/sse_events.py` | Emitter: `src/ai/sse.py` | Orchestrator: `src/ai/orchestrator.py`

This section documents when each SSE event type fires and what populates it. The SSE emitter (`emit_agent_result`) and orchestrator (`run_agent`) are already implemented and working — this is for completeness and future agent reference.

### Event sequence (collect-then-emit, ADR-2)

```
POST /session/{id}/chat
  → run_agent() executes orchestration loop (max 10 iterations)
  → Returns AgentResult with accumulated data
  → emit_agent_result() emits events in fixed order:
```

| Order | Event | Fires when | Source field | Populated by |
|:------|:------|:-----------|:-------------|:-------------|
| 1 | `thinking` (×N) | Always, one per tool call | `AgentResult.tool_calls[]` | Orchestrator appends to `all_tool_calls` on each dispatch |
| 2 | `pcsv_update` | Agent called `analyze_pcsv` | `AgentResult.pcsv` | Orchestrator sets `pcsv_result` when `analyze_pcsv` returns successfully |
| 3 | `recipe_card` (×N) | Agent called `search_recipes` | `AgentResult.recipes` | Orchestrator sets `recipe_results` when `search_recipes` returns a list |
| 4 | `explanation` | Agent produced response text | `AgentResult.response_text` | Set to `message.content` from final LLM response (when no more tool calls) |
| 5 | `grocery_list` | **Never in Phase 2** | `AgentResult.grocery_list` | Not populated — grocery list uses dedicated endpoint (§2) |
| 6 | `done` | Always, last event | `AgentResult.status` | `"complete"` if loop finished normally, `"partial"` if max iterations or error |

### Session state_snapshot update

After `emit_agent_result()`, the `/chat` endpoint writes to `sessions.state_snapshot`:

| Field | Written when | Source |
|:------|:------------|:-------|
| `state_snapshot["pcsv"]` | `result.pcsv` is not None | `AgentResult.pcsv.model_dump()` |
| `state_snapshot["recipes"]` | `result.recipes` is not empty | `[r.model_dump() for r in result.recipes]` |
| `state_snapshot["grocery_list"]` | `result.grocery_list` is not empty | Not populated via `/chat` in Phase 2. Written by `POST /session/{id}/grocery-list` instead. |

The snapshot is the primary source of truth for `GET /session/{id}` (resume). Conversation turns are secondary context.

---

## 5. Contract Implications

Decisions made during the gap analysis affect existing contract types. This section documents what needs attention.

### `ChatRequest.target_id` — dead field

`ChatRequest` in `contracts/api_types.py` has a `target_id` field with a validator requiring it when `screen ∈ {saved_meal_plan, saved_recipe}`. Since saved content screens have no chat input (product spec v4), this field and its validator are never exercised. **Leave in contract for now** — removing it is a breaking change for no benefit. If the contract is ever refactored, remove it then.

### `Screen` literal — comment update needed

The `Screen` type comment says "Core flow screens + saved content screens that support chat." Since saved content screens no longer support chat, the comment should be updated to reflect that `Screen` is used for both chat routing and session resume (`GET /session/{id}` returns current screen).

### `GroceryListEvent` — reserved, not removed

As documented in §2, the SSE event type stays in `contracts/sse_events.py`. Its `GroceryStore` model is actively reused by the new grocery list endpoint response and by `SavedGroceryList` in `api_types.py`.

---

## Modification History

| Date | Version | Changes |
|:-----|:--------|:--------|
| 2026-04-11 | v1 | Initial: grocery list pipeline, screen navigation context, SSE event rules, contract implications. Added screen fallback note to §3. |
