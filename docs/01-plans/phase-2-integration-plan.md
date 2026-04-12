# Phase 2 Integration Plan

**Date:** 2026-04-11 | **Status:** Active | **Owner:** Dako (@iDako7)

---

## Goal

All Phase 2 worktrees (WT1, WT2, WT3) have been merged to `main`. The codebase has working backend endpoints, AI orchestrator, and frontend screens — but they aren't connected, and several features don't match the product spec v4.

This plan has two phases:
- **Phase A (Cleanup):** Fix all spec violations so the codebase is correct before integration. Prevents agents from building on top of buggy code.
- **Phase B (Integration):** Connect frontend to real backend — replace mock SSE, wire real API calls, verify end-to-end flows.

**Input documents:**
- `docs/00-specs/product-spec-v2.md` (v4) — what features exist and acceptance criteria
- `docs/00-specs/orchestrator-behaviors-v1.md` — behavioral rules for grocery pipeline, screen context, SSE events
- `docs/00-specs/architecture-spec-v2.md` (v2) — system architecture and API contract
- `docs/02-notes/architecture-decision-records.md` — ADR-1 through ADR-25

**Workflow:** Follow `docs/01-plans/workflow-guide.md` for each issue.

---

## Gap Summary by Journey

### Journey 1: Ingredient → Recipes → Grocery → Save

The user types input on Home, sees PCV analysis on Clarify, gets recipe cards on Recipes, toggles off buy items already on hand, taps "Build shopping list," sees a store-grouped grocery checklist, and saves the list.

**Currently:** Home input works. Clarify shows PCV badges. Recipes shows cards with colored ingredient pills. Grocery renders a store-grouped checklist. But the pipeline uses mock data, buy pills aren't toggleable, the grocery endpoint doesn't exist, and saves use hardcoded IDs.

| ID | Gap | Spec Reference |
|----|-----|---------------|
| F2 | Buy pills on recipe cards are read-only, not toggleable | R1, R6: "Buy pills are toggleable. User can deselect items already on hand." |
| B1 | `POST /session/{id}/grocery-list` endpoint doesn't exist | R6, G1: "Deterministic backend operation, not an agent/LLM call." |
| B3 | `GroceryListRequest` contract type missing | orchestrator-behaviors §2: request shape for grocery endpoint |
| B2 | `build_system_prompt()` ignores the `screen` parameter | orchestrator-behaviors §3: "append a navigation context section to the system prompt" |
| F1 | Frontend uses mock SSE, not real `fetch` + `ReadableStream` | Journey 1 acceptance: "AI responses arrive via SSE." |
| F12 | Assistant SSE content not appended to conversation history | F7 acceptance: "Frontend must append the full assistant SSE explanation response." |
| F4 | "Save list" button navigates to hardcoded `/saved/list/1` | G3 acceptance: "Save list triggers backend POST, navigates using returned ID." |

### Journey 2: Recipe Refinement

The user taps swap on a recipe card, chat pre-fills with a contextual message, sends, and gets 1-2 alternatives inline.

**Currently:** Swap button pre-fills chat. SwapPanel renders alternative cards. But alternatives come from mock data.

| ID | Gap | Spec Reference |
|----|-----|---------------|
| F1 | Same as Journey 1 — mock SSE, no real agent responses | R2 acceptance: "Agent receives swap message, queries KB, returns alternatives." |

### Journey 3: Save & Resume

The user taps "Save plan," sidebar lists all saved content, tapping a saved item loads real data by ID.

**Currently:** "Save plan" button exists. Sidebar renders three sections. But everything uses hardcoded data.

| ID | Gap | Spec Reference |
|----|-----|---------------|
| F3 | "Save plan" navigates to hardcoded `/saved/plan/1` | R5 acceptance: "Save returns a unique ID, not hardcoded." |
| I-sidebar | Sidebar displays hardcoded items, not fetched from backend | S1 acceptance: "Sidebar fetches and displays all saved content from backend." |
| I-detail | Saved screens use mock data, not fetched by ID | S2 acceptance: "Tapping a saved item loads full content from backend by ID." |

### Journey 4: Saved Content Management

The user removes a recipe from a saved meal plan, edits a saved recipe in-place, and copies a grocery list to clipboard.

**Currently:** SavedRecipeScreen has in-place edit. ExpandableRecipe has a remove button built in. But several features aren't wired, and saved screens incorrectly have chat input.

| ID | Gap | Spec Reference |
|----|-----|---------------|
| F5 | ChatInput present on SavedMealPlanScreen | S2: "No chat input — modifications are manual (S5, S6)." ADR-25. |
| F6 | ChatInput present on SavedRecipeScreen | S3: "No chat input — modifications via in-place edit (S6)." ADR-25. |
| F7-S5 | onRemove not wired on SavedMealPlanScreen | S5: "Tap x on a recipe row in saved meal plan removes it." |
| F9 | "Copy to Notes" button has no onClick handler | S8: "Copy to Notes produces a plain-text checklist in clipboard." |

### Journey 5: Error & Edge Cases

**Currently:** ErrorBanner component exists with retry. Backend has LLM retry, tool error handling, partial result fallback. No gaps — this will be validated during Phase B integration testing.

### Cross-Journey: Bilingual (A3)

Toggle button on Recipes and Grocery screens. When active, recipe names and ingredient names show Chinese translations.

**Currently:** RecipesScreen has a toggle button and `lang` state. But the state isn't consumed by components, and GroceryScreen has no toggle.

| ID | Gap | Spec Reference |
|----|-----|---------------|
| F10 | Bilingual toggle on RecipesScreen declared but not consumed by RecipeCard | A3: "When active, recipe names and ingredient names display Chinese translations." |
| F11 | Bilingual toggle missing from GroceryScreen | A3: "Toggle button appears on the Recipes and Grocery screens." |

### Cross-Journey: Auth

| ID | Gap | Spec Reference |
|----|-----|---------------|
| B-auth | No `/auth/send-code` or `/auth/verify` endpoints | architecture-spec §9-10. Mock auth middleware works, but endpoints don't exist. |

---

## Issue Map

### Phase A: Cleanup (no inter-issue dependencies)

| Issue | Title | Gaps Covered | Layer | Verify With |
|-------|-------|-------------|-------|-------------|
| [**#18**](https://github.com/iDako7/Smart_Grocery_Agent/issues/18) A1 | Frontend Cleanup | F5, F6, F7-S5, F9, F2, F10, F11 | Frontend | Browser: walk through all screens with dev server |
| [**#19**](https://github.com/iDako7/Smart_Grocery_Agent/issues/19) A2 | Backend Cleanup | B2, B3, B1, B-auth | Backend | pytest + curl |

A1 and A2 have zero dependencies on each other. Execute in either order.

### Phase B: Integration (B1 first, then B2/B3 in either order)

| Issue | Title | Gaps Covered | Layer | Verify With |
|-------|-------|-------------|-------|-------------|
| [**#20**](https://github.com/iDako7/Smart_Grocery_Agent/issues/20) B1 | SSE Integration | F1, F12 | Frontend + Backend | End-to-end: type input, see real AI response stream |
| [**#21**](https://github.com/iDako7/Smart_Grocery_Agent/issues/21) B2 | Grocery Frontend Wiring | Grocery call from frontend | Frontend | Toggle pills, tap Build Shopping List, see real grouped list |
| [**#22**](https://github.com/iDako7/Smart_Grocery_Agent/issues/22) B3 | Save & Resume | F3, F4, I-sidebar, I-detail | Frontend | Save plan, sidebar shows it, tap, loads real data |

B2 and B3 both depend on B1 but are independent of each other.

---

## Execution Order

```
Phase A (parallel — no dependencies):
  A1: Frontend Cleanup
  A2: Backend Cleanup

Phase B (sequential — B1 first):
  B1: SSE Integration
  B2: Grocery Frontend Wiring  ← after B1, independent of B3
  B3: Save & Resume            ← after B1, independent of B2

Done: All 5 journeys verifiable end-to-end.
```

---

## Done Criteria

The integration effort is complete when:

- [ ] All 5 journeys can be walked through in the browser with real backend responses
- [ ] Journey 1: Type input → real PCV analysis → real recipe cards → toggle buy pills → build shopping list → store-grouped grocery list → save with real ID
- [ ] Journey 2: Tap swap → real alternative cards from agent → pick or keep
- [ ] Journey 3: Save plan → sidebar lists it → tap → loads real data by ID
- [ ] Journey 4: Remove recipe from plan (x button) → edit saved recipe → copy grocery list to clipboard
- [ ] Journey 5: Error banner appears on network failure with retry option
- [ ] Bilingual toggle works on Recipes and Grocery screens
- [ ] `pytest` passes with no failures
- [ ] `/verify` passes (build + types + lint + tests)

---

## Modification History

| Date | Version | Changes |
|:-----|:--------|:--------|
| 2026-04-11 | v1 | Initial: gap analysis, 5 issues across 2 phases, execution order, done criteria. |
