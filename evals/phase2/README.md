# Phase 2 Eval Suite

Evaluation gate for all AI service changes. Runs against the full backend stack via HTTP.

Referenced as "the judge" in `docs/01-plans/phase3-prep-dependency-map.md` — must exist before any prompt/orchestration work (#87, #75, Phase 3 caching/streaming).

## Prerequisites

- Docker running: `docker compose up`
- Node.js (for promptfoo): `npx promptfoo`
- Python 3.11+ with `requests` installed

## Quick start

```bash
# 1. Start backend
docker compose up -d

# 2. Run promptfoo eval (5 test cases)
cd evals/phase2 && npx promptfoo eval -c promptfooconfig.yaml

# 3. View results in browser
npx promptfoo view

# 4. Run consistency analysis (A1 + A2, 3 runs each)
python scripts/consistency_runner.py --runs 3

# 5. Run KB ingredient audit (no backend needed)
python scripts/kb_audit.py --json
```

## What's in here

```
evals/phase2/
  promptfooconfig.yaml          # Main promptfoo config
  provider.py                   # HTTP provider (POST /session/{id}/chat)
  test_cases.yaml               # 5 test cases across 3 categories
  assertions/
    structural.js               # Pass/fail: agent completes, done event exists
    dish_count.js               # Metric: dish count, dishes per person
    ingredient_noise.js         # Metric: overlap ratio, pantry staples, counts
  scripts/
    consistency_runner.py       # N-run variance analysis
    kb_audit.py                 # SQLite KB ingredient quality audit
  README.md
```

## Test cases

| Cat | ID | Input summary | What we measure |
|---|---|---|---|
| A | A1 | chicken+broccoli, dinner for 2 | Dish count for small party |
| C | C1 | vegetarian no-dairy, tofu+mushrooms | Dietary compliance |
| C | C3 | "I want to cook something" | Vague input handling |
| D | D1 | halal + chicken+rice+broccoli | Hard dietary constraint (no pork/non-halal) |
| D | D3 | 2-turn swap: "plan 3 dinners" -> "swap #1 for vegetarian" | Multi-turn history + recipe swap (R2) |

D3 uses `vars.turns` instead of `vars.input`. The provider sends each turn as a separate `/chat` request on the same `session_id` and aggregates token usage across turns; `output` is the response from the last turn. The consistency runner is single-turn only and skips `vars.turns` entries.

**Encoding note:** `vars.turns` must be a **JSON-encoded string** (e.g. `turns: '["first turn", "second turn"]'`), not a native YAML list. Promptfoo treats list-valued vars as a cartesian parameter and expands them into one test row per element — that would break the multi-turn design (same `session_id` across turns, output = last turn's response). Encoding as a scalar string keeps the test as a single row; the provider `json.loads()`-decodes it back into `list[str]`. A real YAML list is also accepted for backward compatibility and ad-hoc use, but please keep the canonical form as a JSON string in `test_cases.yaml`.

## Metrics recorded

All metrics are **measure-only** (no pass/fail thresholds). The only pass/fail gate is `agent_completes` (structural integrity).

### Structural (JS)
- `agent_completes` — done event received, status is complete/partial

### Measured dimensions (JS named scores)
- `dish_count` — number of recipe_card events
- `dishes_per_person` — dish_count / party_size
- `ingredient_count_avg` — average ingredients per recipe
- `ingredient_count_max` — max ingredients on any single recipe
- `ingredient_overlap_ratio` — ratio of ingredient names appearing across 2+ recipes (fuzzy match)
- `pantry_staple_count` — total pantry staples across all recipes

### LLM-graded (promptfoo llm-rubric, score 1-5)
- `overall_quality` — practical, well-organized meal suggestion
- `dietary_compliance` — strict adherence to stated restrictions (C1 and D1)
- `vague_input_handling` — graceful handling of underspecified input (C3 only)

### Built-in (promptfoo native)
- `cost` — per-call dollar cost
- `latency` — wall-clock milliseconds
- Token usage (prompt + completion)

## Telemetry fields

The provider surfaces the following telemetry on every result (issue #115).
Backend plumbs `token_usage` into the SSE `done` event; the provider reads
it and exposes it via promptfoo's standard output shape.

- `tokenUsage.total` — total tokens (sum across multi-turn cases)
- `tokenUsage.prompt` — prompt tokens
- `tokenUsage.completion` — completion tokens
- `tokenUsage.cached` — cached prompt tokens (prompt-cache hits)
- `cost` — USD, straight from OpenRouter's `token_usage.cost`
- `latency_ms` — wall-clock milliseconds (sum across multi-turn cases)
- `cache_hit_ratio` — `cached_tokens / prompt_tokens` (0.0 if prompt is 0)
- `metadata.model` — model id reported by the backend
- `metadata.cache_write_tokens` — tokens written to the cache

Note: D3 uses `vars.turns` for multi-turn. Token usage and latency are
summed across turns; `output` is the response from the final turn.

## Consistency runner

Runs test cases N times and computes variance:
- Dish count mean/stddev/CV
- Ingredient count mean/stddev/CV
- Recipe name Jaccard similarity across runs

```bash
python scripts/consistency_runner.py --runs 5
# JSON to stdout, summary to stderr
```

## KB audit

Scans `data/kb.sqlite` for ingredient quality issues. No backend needed.

```bash
python scripts/kb_audit.py            # Text report to stdout
python scripts/kb_audit.py --json     # Also writes kb_audit_results.json
```

Reports: overlap pairs, pantry staple frequency, ingredient count distribution, affected recipes.

## Per-test profile reset (#126)

All test cases share the hardcoded dev user (`00000000-0000-0000-0000-000000000001`).
C1 and D1 write dietary restrictions onto that row via `update_user_profile`,
and without a reset those restrictions persist into the next case — e.g. A1
and A3 return 0 recipes because the agent (correctly) refuses chicken/salmon
for a "vegetarian" user carried over from C1.

The provider calls `POST /internal/reset-dev-profile` at the start of every
test case to restore schema defaults. The endpoint is **dev-mode only**
(returns 404 when `SGA_AUTH_MODE=prod`) and always targets the hardcoded dev
UUID.

- Enabled by default. Set `SGA_EVAL_RESET_PROFILE=0` to disable (e.g. to
  reproduce the pre-fix flakiness as a negative control).
- Residual risk under concurrency ≥ 2: if two tests interleave reset→chat
  with another test's mutating tool call, restrictions can still leak
  mid-run. The issue's ±1 score variance tolerance accounts for this; if
  it's breached, escalate to Option B (per-test user_id) rather than
  tuning Option A.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SGA_EVAL_BASE_URL` | `http://localhost:8000` | Backend URL for provider + consistency runner |
| `SGA_EVAL_RESET_PROFILE` | `1` | If `1`, provider calls `/internal/reset-dev-profile` per case (see #126). Set `0` to disable. |

## Relationship to dependency map

This eval suite is the "judge" that gates:
- **#87** — AI stability, noise reduction, alternatives
- **#75** — chat-modify no re-clarify
- **Phase 3 prompt caching** — validates caching doesn't degrade quality
- **Phase 3 streaming** — validates streaming doesn't lose data

Every AI service change should run this eval before and after to measure impact.
