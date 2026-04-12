# WT2: Backend + AI Layer — Implementation Plan

**Date:** 2026-04-09 | **Status:** Complete (merged to main 2026-04-11) | **Branch:** `wt2-backend`

---

## Scope

WT2 owns `src/backend/` (FastAPI app, API endpoints, DB layer, Alembic migrations) and `src/ai/` (agent orchestrator, prompt assembly, context manager, schema coercion).

Imports (read-only): `contracts/tool_schemas.py`, `contracts/sse_events.py`, `contracts/api_types.py`, `contracts/pg_schema.sql`.

Must not edit: `src/frontend/`, `data/`, `evals/`, `contracts/` (propose changes via PR to `main`).

---

## Key Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| SQLite KB | Write tool handlers against SQLite from the start using `contracts/kb_schema.sql`. Minimal seed script for testing until WT1 merges. | WT1 nearly done; writing handlers twice (JSON then SQLite) is waste. SQL query patterns differ fundamentally from JSON scanning. |
| LLM client | AsyncOpenAI SDK with `base_url=OpenRouter` | Saves ~100 lines of boilerplate (SSE parsing, tool_calls deserialization, retry). Proven in prototype. No advantage from raw httpx. |
| Fuzzy matching | `rapidfuzz` (drop-in for `thefuzz`, 10-50x faster) | Product catalog is small (~hundreds of items); in-memory scoring is fine. Explore FTS5 in Phase 3. |
| Testing | Transaction-rollback fixtures against Docker Compose PostgreSQL | JSONB + PostgreSQL-specific types make SQLite substitution unreliable. Docker Compose PostgreSQL already exists. |
| Context window | Token-based budget (~8K history tokens, ~8-12 turns). Drop oldest first. Summary deferred to Phase 3. | Token budget adapts to varying turn lengths. ~15K tokens per LLM call is reasonable cost. |
| SSE contract | Use current `contracts/sse_events.py` as-is. Freeze after `/chat` works end-to-end. | Possible `session_update` event deferred — see `docs/02-notes/open_question.md`. |

---

## Stage 1: Database Layer + Auth

**No WT1 dependency.** Can start immediately.

- SQLAlchemy 2.0 Core table definitions matching `contracts/pg_schema.sql`
  - `users`, `user_profiles`, `sessions`, `conversation_turns`
  - `saved_meal_plans`, `saved_recipes`, `saved_grocery_lists`
- Alembic initial migration
- Async engine + session lifecycle (`async_engine`, `async_sessionmaker`)
- Mock auth middleware (hardcoded dev user UUID, real JWT validation contract via `pyjwt`)
- User + profile CRUD helpers (read profile for prompt assembly, update profile from tool)

**Done when:** `docker compose up` → Alembic migration runs → dev user seeded → health check passes with DB connection.

---

## Stage 2: AI Layer Core

**Dependency:** WT1 merged (SQLite KB available), or temporary seed script.

- Async orchestration loop (`src/ai/orchestrator.py`)
  - `AsyncOpenAI` client against OpenRouter
  - `async def run_agent()` — while-loop, max 10 iterations
  - Tool dispatch routing (same structure as `prototype/orchestrator.py`)
  - Partial result fallback on max iterations
- 7 async tool handlers querying SQLite via `aiosqlite`
  - `analyze_pcsv` — deterministic lookup against `pcsv_mappings` table
  - `search_recipes` — SQL `WHERE` filters + ingredient overlap scoring
  - `lookup_store_product` — load products, score with `rapidfuzz` in-memory
  - `get_substitutions` — filtered query against `substitutions` table
  - `get_recipe_detail` — single-row lookup by `recipe_id`
  - `update_user_profile` — write to PostgreSQL `user_profiles` table
  - `translate_term` — lookup against `glossary` table
- Prompt assembly (`src/ai/prompt.py`)
  - Persona + rules + tool instructions snippets (ported from `prototype/prompt.py`)
  - User profile section read from PostgreSQL per `/chat` call
- Schema coercion pipeline
  - `json.loads()` → Pydantic type coercion → field validators → defaults → re-prompt as last resort
- Context manager (`src/ai/context.py`)
  - Store conversation turns in PostgreSQL `conversation_turns` table
  - Token-based truncation: ~8K token budget for history (~8-12 turns)
  - Approximate token count: 1 token ~ 4 chars
  - Keep recent turns verbatim, drop oldest first

**Done when:** `run_agent("BBQ for 8 people")` returns a complete `AgentResult` with tool calls executed against SQLite + PostgreSQL.

---

## Stage 3: API Endpoints

- `POST /session` — create session row, return `session_id` + `created_at`
- `GET /session/{id}` — return `SessionStateResponse` (screen, pcsv, recipes, grocery_list, conversation) from `state_snapshot` JSONB
- `POST /session/{id}/chat` — accepts `ChatRequest`, returns SSE stream
- Saved content CRUD:
  - Meal plans: `POST /saved/meal-plans`, `GET /saved/meal-plans`, `GET /saved/meal-plans/{id}`, `PUT /saved/meal-plans/{id}`, `DELETE /saved/meal-plans/{id}`
  - Recipes: same pattern under `/saved/recipes`
  - Grocery lists: same pattern under `/saved/grocery-lists`
- Mock auth middleware wired to all endpoints except `/health`

**Done when:** All endpoints return correct response types from `contracts/api_types.py`. Saved content CRUD works end-to-end.

---

## Stage 4: SSE + Integration

- SSE emitter producing typed events from `contracts/sse_events.py`
  - During orchestration loop: `thinking` events with status strings
  - After loop: `pcsv_update`, `recipe_card` (x N), `explanation`, `grocery_list`, `done` in rapid sequence
  - On error: `error` event with context, then `done` with `status: "partial"`
- End-to-end flow: create session → chat → receive SSE events → resume session via GET
- Error handling:
  - LLM failure: one retry with exponential backoff, then partial results
  - Tool failure: error returned to LLM as tool result (LLM can reason about it)
  - Max iterations: return partial results with `done: {status: "partial", reason: "max_iterations"}`
- State snapshot update: write `{pcsv, recipes, grocery_list}` to `sessions.state_snapshot` after each `/chat` completes
- Evaluate need for `session_update` SSE event (see `docs/02-notes/open_question.md`)
- Freeze `contracts/sse_events.py` and `contracts/api_types.py`

**Done when:** Full `/chat` flow streams correct SSE events. Session resume returns consistent state. Error paths return partial results.

---

## Stage 5: Testing + Polish

- Integration tests against Docker Compose PostgreSQL (transaction-rollback fixtures)
  - Session lifecycle (create, chat, resume)
  - Saved content CRUD
  - User profile read/write
- Tool handler unit tests against SQLite (mirror `prototype/tests/`)
- `/chat` endpoint tests with mocked LLM responses
  - Verify SSE event sequence and types
  - Verify partial result path
- Alembic migration up/down verification

**Done when:** Test suite green. All endpoints exercised. Ready to merge to `main`.

---

## Dependencies & Sync Points

| Sync point | What must be true | Impact on WT2 |
|---|---|---|
| WT1 merged | SQLite KB `.db` file + seed data on `main` | WT2 rebases, swaps temp seed for real KB |
| WT2 endpoints scaffolded | All API endpoints returning correct types | Freeze `contracts/api_types.py` |
| WT2 `/chat` returning real events | SSE stream working end-to-end | Freeze `contracts/sse_events.py` → unblocks WT3 Stage 3 |

---

## References

- Phase 2 implementation plan: `docs/01-plans/phase-2-implementation-plan.md`
- Architecture spec: `docs/00-specs/architecture-spec-v2.md`
- AI layer architecture: `docs/00-specs/ai-layer-architecture-v2.md`
- Product spec: `docs/00-specs/product-spec-v2.md` (v3 — feature catalog, journeys, acceptance criteria)
- Prototype code: `prototype/` (read-only reference)
- Open questions: `docs/02-notes/open_question.md`
