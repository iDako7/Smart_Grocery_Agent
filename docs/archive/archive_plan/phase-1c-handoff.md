# Phase 1c Handoff — Artifact-to-Phase 2 Mapping

**Date:** 2026-04-07 | **Owner:** Dako (@iDako7)

---

## Model Decision

**Chosen model:** `openai/gpt-5.4-mini` (via OpenRouter)

OQ-3 resolved by direct selection. GPT-5.4-mini provides significantly lower per-token cost (~10x cheaper than Sonnet 4.6) while supporting function calling. Eval results below confirm quality is acceptable.

---

## Artifact Inventory

| Phase 1 artifact | Path | Phase 2 destination | Notes |
|---|---|---|---|
| System prompt (persona + rules + tool instructions) | `prototype/prompt.py` | `contracts/` → `src/ai/prompt.py` | Three sections become skill file snippets concatenated at build time |
| Tool definitions (7 tools, OpenAI function schema) | `prototype/tools/definitions.py` | `contracts/tool_schemas.py` | Convert from dict-of-dicts to Pydantic models |
| Tool handlers | `prototype/tools/*.py` (6 files) | `src/ai/tools/` | JSON file reads → SQLite queries |
| Pydantic schemas (tool I/O + agent result) | `prototype/schema.py` | `contracts/tool_schemas.py` + `contracts/sse_events.py` | Split into tool I/O types and SSE event types |
| Orchestrator (while-loop + tool dispatch) | `prototype/orchestrator.py` | `src/ai/orchestrator.py` | Sync `openai` calls → `async httpx` via OpenRouter; add SSE emission points |
| Seed data (recipes, PCSV, products, subs, glossary) | `data/*.json` | SQLite KB via `scripts/migrate_kb.py` | JSON → SQL tables per `contracts/kb_schema.sql` |
| Costco raw product data | `data/costco_raw/*.json` | SQLite KB (products table) | 443 products across 7 departments |
| Eval suite | `evals/reasoning/` | Stays in place | Update `provider.py` to call async backend once available |

---

## Integration Notes

### Orchestrator → FastAPI

The orchestrator's `_dispatch_tool()` switch statement maps 1:1 to the Phase 2 tool dispatch. Key changes:

- `run_agent()` becomes an `async` function
- `openai.OpenAI` → `httpx.AsyncClient` hitting OpenRouter
- After each tool result, emit an SSE status event before the next LLM call
- After the final response, emit typed SSE events (`pcsv_update`, `recipe_card`, `grocery_list`, etc.)

### Prompt Assembly

`build_system_prompt(profile)` signature stays the same. Only the `UserProfile` source changes:
- **Phase 1:** In-memory default or test fixture
- **Phase 2:** PostgreSQL read at the start of each `/chat` call

### Data Migration

Each `data/*.json` file maps to a SQLite table:
- `recipes.json` → `recipes` + `recipe_ingredients` (normalized)
- `pcsv_mappings.json` → `pcsv_mappings`
- `substitutions.json` → `substitutions`
- `glossary.json` → `glossary`
- `costco_raw/*.json` → `products`

### Eval Suite

`provider.py` currently calls `run_agent()` synchronously. Once the FastAPI backend is up, update the provider to hit the `/chat` endpoint (or import the async `run_agent` with `asyncio.run()`). Same 14 scenarios, same graders.

---

## Known Gaps for Phase 2

| Gap | Where | Detail |
|---|---|---|
| No `effort_level` or `flavor_tags` filters | `search_recipes.py` | Spec calls for them; prototype omits. Add as optional params. |
| No fuzzy match in product lookup | `lookup_store_product.py` | Currently uses `thefuzz`; verify behavior against SQLite FTS5 |
| `update_user_profile` is in-memory only | `update_user_profile.py` | Phase 2 must write to PostgreSQL |
| Single-turn only | `orchestrator.py` | No conversation history / context manager. Phase 2 needs multi-turn with compression. |
| Cost estimation hardcoded | `evals/reasoning/provider.py` | Updated to handle GPT-5.4-mini; may need further updates for new models |

---

## KB Changes in Phase 1c

- Added 5 vegetarian/vegan recipes (`r016`–`r020`): Mapo Tofu, Tofu & Bok Choy Stir-Fry, Aloo Gobi, Vegetable Fried Rice, Vegetarian Bibimbap
- Added PCSV mappings: `cauliflower`, `doubanjiang`, `sichuan peppercorn`
- Total KB: 20 recipes, ~103 PCSV mappings, 22 substitutions, 124 glossary entries, 443 products
