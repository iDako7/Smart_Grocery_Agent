# Smart Grocery Assistant — Phase 2 Implementation Plan

**Date:** 2026-04-07 | **Status:** Phase 0-1 Complete; Phase 2.2/2.3 superseded by `phase-2-integration-plan.md` | **Owner:** Dako (@iDako7)

---

## Overview

Phase 2 delivers a workable full-stack web app running locally. Development uses contract-first parallel worktrees: shared schemas in `contracts/` on `main` are the source of truth, 3 worktrees develop independently against them, and the orchestrator (human on `main`) manages merges and contract evolution.

**Prerequisite:** Phase 1c complete. See `phase-1c-handoff.md` for artifact inventory and known gaps.

---

## Phase 0 — Setup (sequential, on `main`)

### 0.1 Finish Phase 1c ✓

~~Run eval suite against a cheaper model via `SGA_MODEL` env var. Document cost/quality trade-off for OQ-3.~~
~~Add 3-5 vegetarian/vegan recipes to `data/recipes.json`. Re-run eval suite to confirm HIGH-04 passes with real KB data.~~

**Done (2026-04-07).** Model set to `openai/gpt-5.4-mini`. 5 vegetarian recipes added. 12/14 eval pass rate. See `phase-1c-handoff.md`.

### 0.2 Draft `contracts/` directory ✓

Shared schemas that all worktrees import. Contract changes go as small PRs to `main` — no implementation mixed in.

**Done (2026-04-08).** Contracts directory scaffolded: `tool_schemas.py`, `sse_events.py`, `api_types.py`, `kb_schema.sql`, `pg_schema.sql`, `CHANGELOG.md`. See `docs/archive/phase-2-architecture-session.jsonl` for architecture session.

| File              | Contents                                                                                                         | Source                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `tool_schemas.py` | Pydantic models for 7 tool inputs/outputs                                                                        | Evolved from `prototype/schema.py` + `prototype/tools/definitions.py` |
| `sse_events.py`   | Pydantic models for SSE event types (thinking, pcsv_update, recipe_card, explanation, grocery_list, error, done) | Architecture spec §8                                                  |
| `api_types.py`    | Request/response types for all endpoints (session, chat, saved content, auth)                                    | Architecture spec §9                                                  |
| `kb_schema.sql`   | SQLite DDL (recipes, PCSV mappings, products, substitutions, glossary)                                           | Derived from `data/*.json` structure                                  |
| `pg_schema.sql`   | PostgreSQL DDL (sessions, users/profiles, saved content)                                                         | Architecture spec §7 + §9                                             |
| `CHANGELOG.md`    | Dated one-liners for breaking contract changes                                                                   | Empty at creation                                                     |

**Contract freeze protocol:** Once a contract file is marked `# Status: frozen`, only additive, non-breaking changes are allowed (new optional fields, new event types, new endpoints). Breaking changes (rename, type change, field removal) require a PR to `main` with a `CHANGELOG.md` entry; all worktrees must rebase before continuing.

| Contract          | Freezes when                           | Blocks                                        |
| ----------------- | -------------------------------------- | --------------------------------------------- |
| `tool_schemas.py` | Phase 0 (before worktrees start)       | Already validated in Phase 1                  |
| `kb_schema.sql`   | WT1 merges to `main`                   | Schema final once data is migrated            |
| `sse_events.py`   | WT2 has `/chat` returning real events  | WT3 Stage 3 (state machine needs event types) |
| `api_types.py`    | WT2 has all endpoints scaffolded       | WT3 Stage 4 (frontend needs API types)        |
| `pg_schema.sql`   | WT2 has PostgreSQL integration working | Only WT2 consumes it                          |

### 0.3 Project scaffolding ✓

- `docker-compose.yml` — PostgreSQL + placeholder FastAPI service (so all worktrees develop against real Postgres)
- Frontend project init: Vite + React + TS + Bun + Tailwind + shadcn/ui
- Backend project init: FastAPI + async setup
- Per-worktree `CLAUDE.md` files defining scope (owns / imports / must-not-edit)
- Root `CLAUDE.md` updated with contract references and rebase protocol

---

## Phase 1 — Parallel Development (3 worktrees)

### WT1: KB + Data

**Starts first, merges first.** Zero dependencies. Everything else depends on it.

- Design SQLite schema from `contracts/kb_schema.sql`
- Write migration script: JSON → SQLite (reproducible, idempotent)
- Seed all data: recipes, PCSV mappings, products, substitutions, glossary
- Validate: prototype tool handlers work against SQLite instead of JSON files

### WT2: Backend + AI Layer

**Starts after initial contracts exist.** Rebases when WT1 merges (picks up SQLite).

- Async orchestrator rewrite (`AsyncOpenAI`, `async def run_agent()`)
- Tool handlers adapted: JSON file reads → SQLite queries
- FastAPI app structure:
  - `POST /session/{id}/chat` SSE endpoint (collect-then-emit, thinking status during loop)
  - Session CRUD (`POST /session`, `GET /session/{id}`)
  - Saved content CRUD (meal plans, recipes, grocery lists)
  - Mock auth middleware (hardcoded dev user, real JWT contract)
- PostgreSQL integration: sessions, user profiles, saved content
- Context manager: conversation history + simple truncation (last N turns + summary)
- Error handling: one retry with backoff on LLM failure, then partial results
- Prompt assembly: reads user profile from PostgreSQL per `/chat` call

### WT3: Frontend

**Starts in parallel.** Stages 1-2 have zero contract dependency. Stage 3 is the first sync point.

- **Stage 1:** Static HTML for all 7 screens matching Soft Bento design reference. No JS, no framework — visual review only.
- **Stage 2:** Convert to React + TS components with typed props. shadcn/ui primitives + Tailwind. Still mock data.
- **Stage 3:** Wire state machine (`IDLE → LOADING → STREAMING → COMPLETE`) with hardcoded mock SSE responses. Validate full flow clicks through. **Requires frozen SSE contract from `contracts/sse_events.py`.**

### Orchestrator protocol (human, on `main`)

- Merge WT1 (KB) as soon as done → WT2 rebases to pick up SQLite
- Evolve SSE + API contracts on `main` as WT2 takes shape → WT3 rebases before Stage 3
- Log breaking changes in `contracts/CHANGELOG.md`
- Review each worktree's output before merge

---

## Phase 2 — Integration (sequential, on `main`)

### 2.1 Merge

- Merge WT2 (Backend + AI Layer) to `main`
- Merge WT3 (Frontend) to `main`
- Resolve integration conflicts

### 2.2 Connect

- Frontend Stage 4: real SSE client (streaming fetch via `ReadableStream`), real `/chat` endpoint, typed event handling
- End-to-end flow: Home → Clarify → Recipes → Grocery with real AI responses
- Saved content: sidebar navigation → full-screen detail views → CRUD operations

### 2.3 Finalize

#### First Priority

- Docker Compose fully wired: frontend build + FastAPI + PostgreSQL
- Smoke test all 7 screens with real KB data and real LLM responses

#### Second Priority

- Eval suite (`evals/reasoning/`) running against async backend

---

## Sync Points

| Sync point          | What must be true                       | Who's blocked                                 |
| ------------------- | --------------------------------------- | --------------------------------------------- |
| WT1 merged          | SQLite schema + seeded data on `main`   | WT2 (tool handlers need SQLite)               |
| SSE contract frozen | `contracts/sse_events.py` stable        | WT3 Stage 3 (state machine needs event types) |
| WT2 merged          | Backend running, `/chat` endpoint works | Phase 2.2 (Frontend Stage 4)                  |

---

## Per-Worktree `CLAUDE.md` Scope

**WT1 (KB + Data):**

- Owns: `data/`, `scripts/migrate_kb.py`, `contracts/kb_schema.sql`
- Imports: nothing
- Must not edit: `prototype/`, `src/`, `contracts/` (except `kb_schema.sql`)

**WT2 (Backend + AI Layer):**

- Owns: `src/backend/`, `src/ai/`
- Imports: `contracts/tool_schemas.py`, `contracts/sse_events.py`, `contracts/api_types.py`, `contracts/pg_schema.sql`
- Must not edit: `src/frontend/`, `data/`, `evals/`

**WT3 (Frontend):**

- Owns: `src/frontend/`
- Imports: `contracts/sse_events.py`, `contracts/api_types.py`
- Must not edit: `src/backend/`, `src/ai/`, `data/`

---

## What's NOT in Phase 2

- Production auth (magic link + email service)
- Progressive SSE streaming (Phase 3)
- Vector search / semantic reranking (Phase 3)
- Automated user profile extraction (Phase 3)
- Cloud deployment (Phase 3)
- Mobile / PWA (Phase 3)
- Load testing / scaling (Phase 3)

---

## References

### Project docs

- **Architecture spec:** `docs/00-specs/architecture-spec-v2.md`
- **AI layer architecture:** `docs/00-specs/ai-layer-architecture-v2.md`
- **Product spec:** `docs/00-specs/product-spec-v2.md` (v3 — feature catalog, journeys, acceptance criteria)
- **Phase 1 plan:** `docs/01-plans/phase-1-plan.md`
- **Wireframe:** `docs/00-specs/wireframe-v2.html`
- **Design reference:** `docs/00-specs/soft-bento-preview.html`
- **Prototype code:** `prototype/` (integration package from Phase 1)
- **Eval suite:** `evals/reasoning/`

### Worktree orchestration

- **Claude Code worktrees:** [Common Workflows — Parallel Sessions](https://code.claude.com/docs/en/common-workflows) — mechanics of `claude --worktree`, per-worktree CLAUDE.md scoping, lifecycle
- **Claude Code subagents:** [Subagents — Worktree Isolation](https://code.claude.com/docs/en/sub-agents) — `isolation: worktree` for auto-cleaned parallel agents

### Contract-first development

- **API contracts:** [Evil Martians — API Contracts and Everything I Wish I Knew](https://evilmartians.com/chronicles/api-contracts-and-everything-i-wish-i-knew-a-frontend-survival-guide) — why shared schemas beat ad-hoc coordination
- **Parallel worktree patterns:** [Mastering Git Worktrees with Claude Code](https://medium.com/@dtunai/mastering-git-worktrees-with-claude-code-parallel-development-workflow-41dc91e645fe) — per-worktree CLAUDE.md, rebase protocol, practical limits
- **Parallel agent development:** [Mastering Parallel Agent Development in Claude Code](https://claudelab.net/en/articles/claude-code/claude-code-parallel-development-mastery) — orchestrator pattern, 3-5 worktree sweet spot
