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

# 2. Run promptfoo eval (10 test cases)
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
  test_cases.yaml               # 10 test cases across 3 categories
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
| A | A2 | beef+egg+rice, dinner for 4 | Dish count for medium party |
| A | A3 | salmon+asparagus, dinner for 1 | Dish count for solo |
| A | A4 | chicken+rice+veggies, BBQ for 8 | Dish count for large party |
| B | B1 | = A1 | Ingredient noise (overlap, pantry staples) |
| B | B2 | = A2 | Ingredient noise |
| C | C1 | vegetarian no-dairy, tofu+mushrooms | Dietary compliance |
| C | C2 | Chinese input (equivalent to A1) | Bilingual handling |
| C | C3 | "I want to cook something" | Vague input handling |

B1/B2 reuse A1/A2 inputs with the same assertions — they produce independent eval rows so we get duplicate measurements, which is useful for measuring per-run variance even within a single promptfoo run.

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
- `dietary_compliance` — strict adherence to stated restrictions (C1 only)
- `vague_input_handling` — graceful handling of underspecified input (C3 only)

### Built-in (promptfoo native)
- `cost` — per-call dollar cost
- `latency` — wall-clock milliseconds
- Token usage (prompt + completion)

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

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SGA_EVAL_BASE_URL` | `http://localhost:8000` | Backend URL for provider + consistency runner |

## Relationship to dependency map

This eval suite is the "judge" that gates:
- **#87** — AI stability, noise reduction, alternatives
- **#75** — chat-modify no re-clarify
- **Phase 3 prompt caching** — validates caching doesn't degrade quality
- **Phase 3 streaming** — validates streaming doesn't lose data

Every AI service change should run this eval before and after to measure impact.
