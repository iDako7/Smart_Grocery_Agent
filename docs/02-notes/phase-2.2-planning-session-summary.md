# Phase 2.2/2.3 Planning Session Summary

**Date:** 2026-04-10 | **Status:** Discussion — no plan written yet

---

## 1. Original Intent

Dako wants an orchestration plan for Phase 2.2 (Connect) and 2.3 (Finalize) from `docs/01-plans/phase-2-implementation-plan.md`, modeled after the WT2 TDD orchestration plan (`docs/01-plans/wt2-orchestration-plan.md`).

### What Phase 2.2 (Connect) requires:

- Replace frontend mock SSE service with real `fetch()` + `ReadableStream`
- Wire all frontend API calls (session create, chat, saved content CRUD)
- End-to-end flow: Home → Clarify → Recipes → Grocery with real AI responses
- Saved content: sidebar navigation → full-screen detail views → CRUD operations

### What Phase 2.3 (Finalize) requires:

- Docker Compose fully wired (frontend build + FastAPI + PostgreSQL)
- Eval suite running against async backend
- Smoke test all 7 screens with real KB data and real LLM responses

---

## 2. Agreed Decisions

| Topic            | Decision                                 | Reasoning                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend-only E2E | **Not a priority**                       | 3 live tests already exist in `test_chat_e2e_live.py`. Real gap is frontend ↔ backend, not backend internals.                                                                                                                                                                                |
| Auth             | **Option A: dev-mode only**              | Phase 2 plan explicitly defers production auth to Phase 3. Backend JWT middleware is wired for later.                                                                                                                                                                                        |
| Docker frontend  | **Option C: multi-stage + dev override** | Production Dockerfile (nginx) + `docker-compose.override.yml` for `bun dev`. Satisfies "fully wired" requirement while keeping dev fast.                                                                                                                                                     |
| Browser E2E tool | **Playwright**                           | Standard tool, ECC `e2e-runner` agent supports it.                                                                                                                                                                                                                                           |
| Workflow         | **TDD-gate orchestration** (like WT2)    | Write E2E test first (RED) → build integration code → run E2E (GREEN) → verification gate → code review at marked points.                                                                                                                                                                    |
| Eval suite       | **Separate phase, deferred**             | Verify product works first via browser E2E. Eval suite is expensive (~$0.50-2.00/run) and tests AI reasoning quality, not integration correctness. Dako also wants to discuss writing **new eval test cases** rather than reusing old ones (existing cases may be biased by mock/seed data). |
| OpenRouter cost  | **Acceptable**                           | ~$0.05-0.10 per E2E test. Budget ~$1-2.50 per verification cycle (5 tests × 3-5 flakiness runs).                                                                                                                                                                                             |

---

## 3. Test Strategy (Agreed)

### 3-tier approach, weighted toward integration:

| Tier                             | What                                                                            | Priority                       |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Integration (backend)            | Real OpenRouter through full stack (ASGI → endpoint → orchestrator → LLM → SSE) | Already covered (3 live tests) |
| Integration (frontend ↔ backend) | Frontend SSE client parsing real SSE from running backend                       | **Missing — highest priority** |
| Browser E2E (Playwright)         | Full user journeys in real browser                                              | **Missing — highest priority** |

### Agreed E2E Scenarios (6 total):

1. **Happy path grocery list:** Home → type ingredients → PCSV + recipes → grocery list → save grocery list → verify saved
2. **Happy path recipe save:** Home → type ingredients → PCSV + recipes → save recipe list → verify saved
3. **User input validation:** Verify selections and text input on Clarify + Recipe screens are sent to and handled by backend
4. **Refine plan:** User input on Recipe screen triggers backend to generate new content based on that input
5. **Recipe swap:** Select recipe → swap → verify grocery list updates
6. **Error handling:** Bad input or network failure → error banner

---

## 4. Gap Analysis (Critical Finding)

During planning, we discovered significant gaps between the product spec and current implementation. **The plan cannot be just "connect frontend to backend" — there are missing features that must be built first.**

### Backend Critical Gaps

| ID     | Gap                           | Detail                                                                                                                                                                                                                                |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | **Grocery list generation**   | `AgentResult.grocery_list` is **always empty**. No tool produces grocery data, orchestrator never populates it, SSE `grocery_list` event never fires. The entire Grocery screen has no real data source. This is the biggest blocker. |
| **B2** | **Screen-aware prompts**      | Chat endpoint runs **identical orchestrator** regardless of `screen` parameter (home, clarify, recipes, grocery, saved\_\*). Screen is stored in DB but never sent to LLM. Agent can't behave differently per screen context.         |
| **B3** | **`target_id` unused**        | `ChatRequest.target_id` is validated for saved_meal_plan/saved_recipe screens but **never passed to orchestrator**, never used to load the specific saved item.                                                                       |
| **B4** | **Saved content refinement**  | No mechanism to: (a) load saved item into prompt context, (b) run agent against it, (c) update saved item after agent response. "Add a dessert to this plan" or "Adjust for 8 people" cannot work.                                    |
| **B5** | **`initial_message` ignored** | `CreateSessionRequest.initial_message` is accepted but discarded. Minor — frontend sends message separately.                                                                                                                          |

### Frontend Critical Gaps

| ID     | Gap                              | Detail                                                                                                                                       |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | **Real SSE client**              | Mock SSE service with hardcoded scenarios. Nothing talks to real backend. **Blocker.**                                                       |
| **F2** | **Save buttons hardcoded**       | "Save plan" and "Save list" navigate to `/saved/plan/1` and `/saved/list/1` with **hardcoded ID "1"**. No POST to backend.                   |
| **F3** | **Saved content loading**        | All saved screens (meal plan, recipe, grocery list) use **hardcoded scenario data**. No GET from backend.                                    |
| **F4** | **"Copy to Notes" stubbed**      | Button exists, onClick handler is a no-op.                                                                                                   |
| **F5** | **"Browse all recipes" missing** | Spec describes searchable/filterable KB recipe list below recipe cards. Not implemented at all — no UI, no endpoint.                         |
| **F6** | **Recipe remove from meal plan** | Spec says ✕ button on each recipe row in saved meal plan. Not implemented — ExpandableRecipe has no remove handler.                          |
| **F7** | **Assistant turn content empty** | `SessionContext.tsx` line 185-187: assistant conversation turns saved with **empty content**. Multi-turn context is broken on frontend side. |

### End-to-End Feature Gaps

| ID     | Feature                          | Spec Description                                                                                           | Status                                       |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **G1** | Grocery list generation pipeline | Extract "buy" pills from selected recipes → cross-reference store/product KB → group by store + department | No tool, no orchestrator logic, no SSE event |
| **G2** | Screen-aware agent routing       | Different prompt/behavior per screen context                                                               | Not implemented                              |
| **G3** | Saved content chat refinement    | Chat modifies saved items in-place                                                                         | No backend support, no frontend wiring       |
| **G4** | Multi-preparation awareness      | Same protein → different preparations                                                                      | Depends on prompt engineering, not validated |
| **G5** | Bilingual output                 | EN+ZH when user prefers                                                                                    | Language toggle cosmetic, no i18n pipeline   |

---

## 5. User Journeys (Spec-Derived) & Blocking Gaps

### Journey 1: Ingredient → Recipes → Grocery (Happy Path)

```
Home → Clarify (PCV + toggles) → Recipes (3-5 cards) → Grocery (store-grouped list) → Save
```

**Blocked by:** B1 (grocery list empty), F1 (no real SSE), F2 (save stubbed)

### Journey 2: Recipe Refinement

```
Recipes: swap recipe → see alternatives → pick one
Recipes: chat "make it all Mexican" → updated cards
```

**Blocked by:** B2 (screen-unaware agent), F1

### Journey 3: Save & Resume

```
Recipes: "Save plan" → meal plan created with real ID
Home sidebar: see saved plans → tap → see detail
```

**Blocked by:** F2 (hardcoded ID), F3 (fake saved data)

### Journey 4: Saved Content Editing

```
Saved recipe: edit text → save
Saved recipe: chat "adjust for 8 people" → agent rewrites
Saved meal plan: chat "add a dessert" → agent suggests
Saved grocery list: add/remove, check off, copy to notes
```

**Blocked by:** B3, B4 (target_id unused, no refinement), F4 (copy stubbed), F6 (remove missing)

### Journey 5: User Input Validation

```
Clarify: toggle setup/dietary → sent as message to backend → agent respects them
Recipes: chat input → backend processes refinement
```

**Blocked by:** B2 (no screen-specific handling)

---

## 6. Proposed Plan Structure (Not Yet Written)

```
Phase A: Gap Audit & Prioritization        ← DONE (this session)
Phase B: Backend Gap-Filling (B1, B2, B3/B4)
Phase C: Frontend Gap-Filling (F2, F3, F4, F6, F7)
Phase D: Integration (F1 real SSE client + API wiring)
Phase E: Browser E2E Tests (Playwright, 6 scenarios)
Phase F: Docker + Polish (Phase 2.3)
Phase G: Eval Suite Port (separate phase, new test cases)
```

---

## 7. Open Questions (Need Dako's Decision)

1. **B1 (grocery list generation):** New tool (`build_grocery_list`) that orchestrator calls, or post-processing logic after agent loop?

2. **B2 (screen-aware prompts):** Pass `screen` param to orchestrator and adjust system prompt per screen? Or keep one prompt and let LLM figure it out from message context?

3. **B3/B4 (saved content refinement):** Include in this plan or defer? Requires: load saved item → inject into prompt → agent modifies → persist updates.

4. **Priority call:** Which journeys are must-ship for Phase 2 vs. nice-to-have? Suggestion: Journeys 1-3 must-ship, Journey 4 (saved content editing via chat) could defer.

---

## 8. Eval Suite Reusability Assessment

The existing eval suite (`evals/reasoning/`) **can be reused with moderate changes** (~4-6 hours):

**Reusable as-is:** All 13 test scenarios, ~95% of assertions (check `tool_calls`, `response_text`, `status`)

**Must change:**

- `evals/reasoning/provider.py` — async rewrite (new `run_agent` is async, requires SQLite KB + PostgreSQL + user_id)
- Remove `cost` assertion (new backend doesn't track token counts)
- Add DB setup/teardown fixtures

**Dako's preference:** Write new eval test cases rather than reusing old ones, since existing cases may be influenced by mock/seed data. Discuss separately.

---

## 9. Available ECC Agents & Skills for Implementation

| Agent/Skill                  | When to use                                       |
| ---------------------------- | ------------------------------------------------- |
| `/plan`                      | Design orchestration (done)                       |
| `/tdd`                       | Each implementation stage: RED → GREEN → REFACTOR |
| `e2e-runner` agent           | Write + run Playwright tests                      |
| `code-reviewer` agent        | After major stages                                |
| `/verify`                    | Verification gates: build + types + lint + tests  |
| `build-error-resolver` agent | Fix build/type errors fast                        |

---

## 10. Reference Files

| File                                           | Role                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| `docs/01-plans/phase-2-implementation-plan.md` | Master phase plan                              |
| `docs/01-plans/wt2-orchestration-plan.md`      | WT2 TDD orchestration (template for this plan) |
| `docs/00-specs/product-spec-v2.md`             | Product spec (source of truth for features)    |
| `contracts/api_types.py`                       | API request/response types                     |
| `contracts/sse_events.py`                      | SSE event definitions                          |
| `src/backend/api/sessions.py`                  | Chat endpoint (where B2/B3 gaps live)          |
| `src/ai/orchestrator.py`                       | Agent loop (where B1/B2 gaps live)             |
| `src/ai/sse.py`                                | SSE emitter (grocery_list event never fires)   |
| `src/frontend/src/context/session-context.tsx` | Session state (F7 gap at line 185-187)         |
| `src/frontend/src/screens/RecipesScreen.tsx`   | Save plan hardcoded ID (F2 at line 260)        |
| `src/frontend/src/screens/GroceryScreen.tsx`   | Save list hardcoded ID (F2 at line 138)        |
| `tests/test_chat_e2e_live.py`                  | Existing live backend E2E tests (3 tests)      |

### resume the session

claude --resume 70c10a7a-ee59-40ad-968c-8d1742c6b93b
