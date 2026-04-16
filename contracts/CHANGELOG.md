# Contract Changelog

Breaking changes to contract files require a PR to `main` and an entry here.
All worktrees must rebase after a breaking change merges.

## Format

YYYY-MM-DD | file | description

---

## 2026-04-16

2026-04-16: tool_schemas.py — additive: `SearchRecipesInput.max_results` (optional int 1-20) — agent can scope primary recipe count to party size. Non-breaking (None means use default).

---

## 2026-04-14

2026-04-14: tool_schemas.py — additive: `RecipeSummary.ingredients: list[Ingredient]` and `RecipeSummary.instructions: str` (#71). Hydrated from the KB at chat-turn time so the SSE emit path AND the session snapshot carry canonical ingredients + instructions without losing `ingredients_have` / `ingredients_need` / `alternatives`. Non-breaking (additive fields default to empty). `SessionStateResponse.recipes` remains `list[RecipeSummary]`.

2026-04-14: api_types.py — additive: `PatchSessionRecipeRequest` added for `PATCH /session/{id}/recipes`. Non-breaking.

2026-04-14: search_recipes — additive: include_alternatives flag + alternatives[] on RecipeSummary (#56). Non-breaking.

---

## 2026-04-13

### Added
- **tool_schemas.py (additive unfreeze):** `ClarifyOption`, `ClarifyQuestion`, `ClarifyTurnPayload` Pydantic models + `emit_clarify_turn` entry in `TOOLS`. `ClarifyTurnPayload` enforces a hard cap of 3 questions via `model_validator`. `tool_schemas.py` was previously `frozen`; this is an additive-only exception — no existing schemas modified. Supports issue #46.
- **sse_events.py:** `ClarifyTurnEvent` added and registered in the `SSEEvent` discriminated union. On the Clarify screen, this event replaces `ExplanationEvent` — the agent emits one atomic `clarify_turn` event bundling the directional summary and chip questions. On non-Clarify screens (home, recipes, grocery), `ExplanationEvent` continues to be emitted normally.

---

2026-04-12 | sse_events.py | sse_events: DoneEvent gains optional error_category (config|llm|validation|unknown). Additive, non-breaking. (#47)
