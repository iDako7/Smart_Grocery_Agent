# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Grocery Assistant V2 (SGA V2) — a conversational AI agent that helps users plan meals and shop smarter. Targets Vancouver users: immigrants exploring Western grocery items (bilingual EN/ZH) and locals exploring cultural foods.

**Current status:** Phase 2 — scaffolding complete (Phase 0.3), parallel worktree development next.

## Three-Phase Plan

- **Phase 1:** *(done)* Validated agent reasoning via Claude artifact + promptfoo evals.
- **Phase 2 (current):** Ship deployable app — FastAPI backend, React SPA frontend, real KB. See `docs/01-plans/phase-2-implementation-plan.md`.
- **Phase 3:** Optimize based on usage data (progressive streaming, vector search, model routing).

## Architecture

```
React SPA (Vite) ──SSE──> FastAPI ──tool-use loop──> Claude via OpenRouter
                              |
                              ├── SQLite (read-only KB: recipes, PCSV, products, substitutions)
                              └── PostgreSQL (mutable: sessions, saved content, users, auth)
```

**Two databases by access pattern:** SQLite for the curated reference KB (shipped as a file), PostgreSQL for user-generated mutable data.

**Single conversational agent** with 7 tools — not separate REST endpoints. The LLM decides tool ordering per conversation:
- `analyze_pcsv` — categorize ingredients by Protein/Carb/Veggie/Sauce
- `search_recipes` — find KB recipes matching ingredients/constraints
- `lookup_store_product` — package sizes, departments, store availability
- `get_substitutions` — ingredient alternatives by reason
- `get_recipe_detail` — full cooking instructions for a recipe
- `update_user_profile` — persist learned preferences/restrictions to PostgreSQL
- `translate_term` — EN↔ZH bilingual glossary lookup for ingredients, cooking terms, grocery terms

**Orchestration:** Explicit while-loop (no LangChain/LangGraph). ~40 lines. Max 10 iterations with partial result fallback.

**SSE streaming:** Phase 2 uses collect-then-emit (status strings during loop, typed events after). Event types: `thinking`, `pcsv_update`, `recipe_card`, `explanation`, `grocery_list`, `error`, `done`.

**Schema coercion pipeline** (not re-prompting): `json.loads()` → Pydantic type coercion → field validators → defaults → re-prompt only as last resort.

## Project Structure

```
contracts/          ← Shared schemas (source of truth for all worktrees)
src/backend/        ← FastAPI app, API endpoints, DB layer (WT2)
src/ai/             ← Agent orchestrator, prompt assembly (WT2)
src/frontend/       ← React SPA, Vite + Bun + Tailwind + shadcn/ui (WT3)
data/               ← KB source data (WT1)
scripts/            ← Migration scripts (WT1)
prototype/          ← Phase 1 prototype (read-only reference)
evals/              ← promptfoo eval suite
docs/               ← Specs, plans, archives
```

## Contracts (`contracts/`)

Shared schemas that all worktrees import. Contract changes go as small PRs to `main`.

| File | Status | Contents |
|---|---|---|
| `tool_schemas.py` | frozen | Pydantic models for 7 tool inputs/outputs |
| `sse_events.py` | unfrozen | SSE event type definitions |
| `api_types.py` | unfrozen | Request/response types for all endpoints |
| `kb_schema.sql` | unfrozen | SQLite DDL for KB |
| `pg_schema.sql` | unfrozen | PostgreSQL DDL for mutable data |
| `CHANGELOG.md` | — | Dated one-liners for breaking changes |

**Contract freeze protocol:** Once a contract file is marked `# Status: frozen`, only additive non-breaking changes are allowed (new optional fields, new event types, new endpoints). Breaking changes require a PR to `main` with a `CHANGELOG.md` entry.

## Worktree Development Protocol

Three worktrees develop in parallel, each with its own `CLAUDE.md` defining scope:

| Worktree | Branch | Owns | Scope file |
|---|---|---|---|
| WT1: KB + Data | `wt1-kb-data` | `data/`, `scripts/` | `data/CLAUDE.md` |
| WT2: Backend + AI | `wt2-backend` | `src/backend/`, `src/ai/` | `src/backend/CLAUDE.md` |
| WT3: Frontend | `wt3-frontend` | `src/frontend/` | `src/frontend/CLAUDE.md` |

**Rebase protocol:** When a contract is frozen or updated on `main`, all active worktrees must `git rebase main` before continuing. Check `contracts/CHANGELOG.md` for breaking changes.

## Key Design Decisions

- **PCV gap analysis** (Protein/Carb/Veggie) is the reasoning backbone — deterministic lookup, not LLM judgment. Sauce tracked internally but not shown in analysis UI.
- **Real recipes over generation** — KB-grounded (~80%), LLM-generated flagged as "AI-suggested" (~20%).
- **User profile** is a structured Pydantic model (~500 tokens) injected into every system prompt, not RAG-based memory.
- **Prompt assembly rebuilds every `/chat` call** — reads latest user profile from PostgreSQL each time.
- **System prompt** = persona snippet + rules snippet + tool instructions snippet (skill files concatenated at build time).
- **Dietary restrictions are hard constraints** — never violated.
- **Auth:** Magic link (passwordless email) + JWT. Token in memory, not localStorage.
- **PostgreSQL access:** SQLAlchemy 2.0 Core (async) + asyncpg + Alembic. No full ORM.

## Key Documentation

- `docs/00-specs/product-spec-v2.md` — full product vision, user stories, screens, saved content
- `docs/00-specs/architecture-spec-v2.md` — system architecture, API contract, deployment
- `docs/00-specs/ai-layer-architecture-v2.md` — agent internals, ADRs (7 decisions documented)
- `docs/01-plans/phase-2-implementation-plan.md` — phase plan, worktree protocol, sync points

## Running Locally

```bash
# Backend (Docker: PostgreSQL + FastAPI)
docker compose up

# Frontend (standalone dev server)
cd src/frontend && bun dev

# Evals (prototype, Phase 1)
cd prototype && uv run promptfoo eval -c ../evals/reasoning/promptfooconfig.yaml
```
