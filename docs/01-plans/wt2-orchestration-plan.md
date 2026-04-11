# WT2 Backend: TDD Orchestration Plan

**Date:** 2026-04-09 | **Status:** Active | **Branch:** `wt2-backend`

> **How to use:** You are the senior engineer manager. For each TDD call below, invoke the TDD agent with the prompt details specified. After each verification gate, run the listed commands. Call code review agent only at marked points (Stages 1, 2, 4). The plan file at `docs/01-plans/wt2-backend-plan.md` has the full stage specs.

---

## Summary

- **10 TDD calls** across 5 stages
- **3 code reviews** (after Stages 1, 2, 4)
- **5 verification gates**
- Dependency chain: `1.1 -> 1.2 -> [REVIEW] -> 2.1 -> 2.2 -> 2.3 -> 2.4 -> [REVIEW] -> 3.1 -> 3.2 -> 4.1 -> [REVIEW] -> 5.1`

---

## Pre-flight

- Branch `wt2-backend` rebased onto `main` (WT1 merged)
- `data/kb.sqlite` exists (5 tables, 654 rows)
- Docker Compose PostgreSQL available
- Missing deps to add in Stage 2.2: `rapidfuzz`, `openai`

---

## Stage 1: Database Layer + Auth

### TDD 1.1 — Tables + Engine + Fixtures

**Create:**
- `src/backend/db/tables.py` — 7 SQLAlchemy Core `Table` objects matching `contracts/pg_schema.sql` (JSONB, UUID PKs, indexes)
- `src/backend/db/engine.py` — `create_async_engine`, `async_sessionmaker`, `get_db()` FastAPI dependency
- `src/backend/db/__init__.py` — re-exports
- `tests/conftest.py` — Transaction-rollback fixture (connect, begin, yield, rollback)

**Tests:** `tests/test_db_tables.py`, `tests/test_db_engine.py`

**Done:** All 7 tables in metadata, `get_db()` works, `pytest` green.

### TDD 1.2 — Migration + Auth + CRUD

**Create:**
- `src/backend/alembic/versions/001_initial.py` — All 7 tables, upgrade + downgrade
- Update `alembic/env.py` — set `target_metadata`
- `src/backend/auth.py` — Mock auth: dev mode = hardcoded UUID, real = JWT decode via pyjwt
- `src/backend/db/crud.py` — `get_user_profile()`, `update_user_profile_field()`, `ensure_user_exists()`

**Tests:** `tests/test_alembic.py`, `tests/test_auth.py`, `tests/test_crud.py`

**Done:** Migration up/down works, auth rejects bad tokens, CRUD round-trips.

### Gate 1
```bash
docker compose up -d
docker compose exec api alembic upgrade head
pytest tests/ -v
```

### Code Review: YES
Focus: tables match pg_schema.sql, tx-rollback fixture, auth middleware, CRUD uses `conn.execute()`.

---

## Stage 2: AI Layer Core

### TDD 2.1 — 5 KB-Read Tool Handlers

**Create:**
- `src/ai/kb.py` — SQLite connection manager
- `src/ai/tools/__init__.py`
- `src/ai/tools/analyze_pcsv.py` — Query `pcsv_mappings`, partial-match fallback
- `src/ai/tools/search_recipes.py` — SQL filters + Python ingredient scoring, top 10
- `src/ai/tools/get_recipe_detail.py` — Single-row lookup
- `src/ai/tools/get_substitutions.py` — SQL query + reason filter
- `src/ai/tools/translate_term.py` — Glossary query, direction detection

**Signature:** `async def handler(db: aiosqlite.Connection, input: PydanticModel) -> PydanticModel`

**Tests:** 5 test files against real `data/kb.sqlite`. Port from `prototype/tests/`.

**Reference:** `prototype/tools/*.py` (rewrite JSON loading to SQL queries).

### TDD 2.2 — Store + Profile Tool Handlers

**Create:**
- `src/ai/tools/lookup_store_product.py` — Load from SQLite, score with `rapidfuzz.fuzz.token_sort_ratio`, threshold 60
- `src/ai/tools/update_user_profile.py` — Delegates to `crud.update_user_profile_field()` (PostgreSQL)
- Add `rapidfuzz`, `openai` to `src/backend/pyproject.toml`

**Tests:** 2 test files. Store uses real KB, profile uses PostgreSQL fixture.

### TDD 2.3 — Orchestrator + Prompt + Schema Coercion

**Create:**
- `src/ai/orchestrator.py` — `async def run_agent()`. `AsyncOpenAI(base_url=OpenRouter)`. While-loop, max 10. Returns `AgentResult` with extracted pcsv/recipes/grocery_list.
- `src/ai/prompt.py` — `async def build_system_prompt()`. Reads profile from PostgreSQL. 4-part: persona + rules + profile + tool instructions. Port from `prototype/prompt.py`.
- `src/ai/schema_coercion.py` — `json.loads()` -> Pydantic `model_validate()` -> error dict on failure
- `src/ai/types.py` — `AgentResult` dataclass

**Tests:** Port 7 orchestrator tests from prototype (mock `AsyncOpenAI`). Prompt tests (PostgreSQL fixture). Coercion tests (type coercion, errors).

**Also:** Update `src/backend/CLAUDE.md` to say "AsyncOpenAI SDK" not "httpx, no SDK".

### TDD 2.4 — Context Manager

**Create:**
- `src/ai/context.py` — `save_turn()` (insert), `load_context()` (token-budget ~8K, 1 token ~ 4 chars, drop oldest)

**Tests:** `tests/test_context.py` — round-trip, budget enforcement, tool turn handling.

### Gate 2
```bash
pytest tests/test_tool_*.py tests/test_orchestrator.py tests/test_prompt.py tests/test_schema_coercion.py tests/test_context.py -v
```

### Code Review: YES
Focus: Pydantic I/O (not raw dicts), async correctness, rapidfuzz not thefuzz, no sync I/O, coercion edge cases.

---

## Stage 3: API Endpoints

### TDD 3.1 — Session + Chat Endpoints

**Create:**
- `src/backend/api/sessions.py` — `POST /session` (201), `GET /session/{id}`, `POST /session/{id}/chat` (JSON for now, SSE in Stage 4)
- Update `src/backend/main.py` — register router

**Tests:** `tests/test_api_sessions.py` — create, get, 404, chat with mocked orchestrator.

### TDD 3.2 — Saved Content CRUD

**Create:**
- `src/backend/api/saved.py` — 15 endpoints (5 x meal plans, recipes, grocery lists): POST, GET list, GET by id, PUT, DELETE
- Update `src/backend/main.py` — register router

**Tests:** `tests/test_api_saved.py` — full CRUD cycle per content type.

### Gate 3
```bash
pytest tests/test_api_*.py -v
python -c "from src.backend.main import app; [print(r.path) for r in app.routes]"
```

### Code Review: NO

---

## Stage 4: SSE + Integration

### TDD 4.1 — SSE Emitter + End-to-End

**Create:**
- `src/ai/sse.py` — `async def emit_agent_result()` -> AsyncGenerator of SSE lines. Sequence: thinking* -> pcsv_update -> recipe_card(s) -> explanation -> grocery_list -> done.
- Modify `POST /session/{id}/chat` — return `StreamingResponse(media_type="text/event-stream")`
- Error handling: LLM failure (1 retry + backoff), tool failure (error to LLM), max iterations (partial)

**Tests:** `tests/test_sse.py` (event sequence), `tests/test_sse_errors.py` (partial/error), `tests/test_chat_e2e.py` (full flow: create -> chat -> SSE -> GET -> verify state).

### Gate 4
```bash
pytest tests/ -v
```

### Code Review: YES
Focus: SSE format, error handling (no crash), state snapshot atomicity, no leaked connections, session resume.

---

## Stage 5: Testing + Polish

### TDD 5.1 — Integration Tests + Coverage

**Create:**
- `tests/test_session_lifecycle.py` — multi-turn, context includes previous turns
- `tests/test_saved_content_integration.py` — save from session, verify independence
- `tests/test_profile_integration.py` — tool updates profile, next chat reflects it
- `tests/test_migration_updown.py` — full up/down/up, JSONB verification

### Gate 5 (Final)
```bash
pytest tests/ -v --tb=short
pytest tests/ --cov=src --cov-report=term-missing   # target >= 80%
docker compose exec api alembic upgrade head && alembic downgrade base && alembic upgrade head
```

### Code Review: NO

---

## Key References

| File | Role |
|------|------|
| `contracts/tool_schemas.py` (frozen) | Pydantic I/O + TOOLS list |
| `contracts/api_types.py` | Request/response types |
| `contracts/sse_events.py` | SSE event models |
| `contracts/pg_schema.sql` | PostgreSQL DDL |
| `contracts/kb_schema.sql` | SQLite DDL |
| `prototype/orchestrator.py` | While-loop reference |
| `prototype/prompt.py` | 4-part prompt reference |
| `prototype/tools/*.py` | 7 handler references |
| `prototype/tests/` | ~48 tests to port |
| `data/kb.sqlite` | SQLite KB (654 rows) |
| `docs/01-plans/wt2-backend-plan.md` | Full stage specs + decisions |
