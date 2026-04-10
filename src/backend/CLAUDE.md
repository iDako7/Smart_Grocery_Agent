# WT2: Backend + AI Layer — Scope

## Owns
- `src/backend/` — FastAPI app, API endpoints, database layer, Alembic migrations
- `src/ai/` — Agent orchestrator, prompt assembly, context manager, schema coercion

## Imports (read-only)
- `contracts/tool_schemas.py` — Pydantic models for 7 tool inputs/outputs
- `contracts/sse_events.py` — SSE event type definitions
- `contracts/api_types.py` — Request/response types for all endpoints
- `contracts/pg_schema.sql` — PostgreSQL DDL reference

## Must not edit
- `src/frontend/` — WT3 owns this
- `data/` — WT1 owns this
- `evals/` — eval suite, not implementation code
- `contracts/` — propose changes via PR to `main`

## Tech stack
- **Framework:** FastAPI (async)
- **DB driver:** asyncpg (PostgreSQL), aiosqlite (SQLite KB)
- **ORM:** SQLAlchemy 2.0 Core (async) — no full ORM, no relationship mapping
- **Migrations:** Alembic
- **LLM:** Claude via OpenRouter (AsyncOpenAI SDK with base_url)
- **Orchestration:** Explicit while-loop (~40 lines), max 10 iterations

## Key patterns
- `DATABASE_URL` env var for PostgreSQL connection
- Prompt assembly rebuilds every `/chat` call (reads user profile from PostgreSQL)
- Schema coercion pipeline: `json.loads()` → Pydantic coercion → validators → defaults → re-prompt as last resort
- Collect-then-emit SSE: status strings during loop, typed events after
