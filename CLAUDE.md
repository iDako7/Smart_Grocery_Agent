# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Grocery Assistant V2 (SGA V2) — a conversational AI agent that helps users plan meals and shop smarter. Targets Vancouver users: immigrants exploring Western grocery items (bilingual EN/ZH) and locals exploring cultural foods.

**Current status:** Pre-code, planning phase (Phase 1). All docs are in `docs/`. No application code exists yet.

## Three-Phase Plan

- **Phase 1 (current):** Validate agent reasoning via Claude artifact with mock KB data. Build promptfoo evals from real conversation logs. Output: validated system prompt, tool definitions, eval fixtures.
- **Phase 2:** Ship deployable app — FastAPI backend, React SPA frontend, real KB.
- **Phase 3:** Optimize based on usage data (progressive streaming, vector search, model routing).

## Architecture (Phase 2 target)

```
React SPA (Vite) ──SSE──> FastAPI ──tool-use loop──> Claude via OpenRouter
                              |
                              ├── SQLite (read-only KB: recipes, PCSV, products, substitutions)
                              └── PostgreSQL (mutable: sessions, saved content, users, auth)
```

**Two databases by access pattern:** SQLite for the curated reference KB (shipped as a file), PostgreSQL for user-generated mutable data.

**Single conversational agent** with 6 tools — not separate REST endpoints. The LLM decides tool ordering per conversation:
- `analyze_pcsv` — categorize ingredients by Protein/Carb/Veggie/Sauce
- `search_recipes` — find KB recipes matching ingredients/constraints
- `lookup_store_product` — package sizes, departments, store availability
- `get_substitutions` — ingredient alternatives by reason
- `get_recipe_detail` — full cooking instructions for a recipe
- `update_user_profile` — persist learned preferences/restrictions to PostgreSQL

**Orchestration:** Explicit while-loop (no LangChain/LangGraph). ~40 lines. Max 10 iterations with partial result fallback.

**SSE streaming:** Phase 2 uses collect-then-emit (status strings during loop, typed events after). Event types: `thinking`, `pcsv_update`, `recipe_card`, `explanation`, `grocery_list`, `error`, `done`.

**Schema coercion pipeline** (not re-prompting): `json.loads()` → Pydantic type coercion → field validators → defaults → re-prompt only as last resort.

## Key Design Decisions

- **PCV gap analysis** (Protein/Carb/Veggie) is the reasoning backbone — deterministic lookup, not LLM judgment. Sauce tracked internally but not shown in analysis UI.
- **Real recipes over generation** — KB-grounded (~80%), LLM-generated flagged as "AI-suggested" (~20%).
- **User profile** is a structured Pydantic model (~500 tokens) injected into every system prompt, not RAG-based memory.
- **Prompt assembly rebuilds every `/chat` call** — reads latest user profile from PostgreSQL each time.
- **System prompt** = persona snippet + rules snippet + tool instructions snippet (skill files concatenated at build time).
- **Dietary restrictions are hard constraints** — never violated.
- **Auth:** Magic link (passwordless email) + JWT. Token in memory, not localStorage.

## Key Documentation

- `docs/product-spec-v2.md` — full product vision, user stories, screens, saved content
- `docs/architecture-spec-v2.md` — system architecture, API contract, deployment
- `docs/ai-layer-architecture-v2.md` — agent internals, ADRs (7 decisions documented)
- `docs/Smart_Grocery_Assistant___V2_Implementation_Plan.md` — phase plan, V1 lessons
