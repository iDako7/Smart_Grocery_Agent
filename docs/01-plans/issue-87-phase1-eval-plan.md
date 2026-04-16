# Issue #87 Phase 1 — Eval Suite Plan

**Date:** 2026-04-15 | **Status:** Draft | **Owner:** Dako (@iDako7)
**Issue:** #87 — AI stability, noise reduction, and alternatives
**PR:** `feat/87-eval` (references #87)

---

## Goal

Build a promptfoo eval suite that runs against the **Phase 2 agent** (`src/ai/orchestrator.run_agent`), establishes a scored baseline of current behavior, and surfaces the root causes behind ingredient bloat and dish count instability.

This is a **diagnostic tool**, not a pass/fail gate. We score and record — thresholds come after we understand the numbers.

---

## Scope

| In scope | Out of scope |
|---|---|
| New promptfoo provider targeting Phase 2 agent | Any prompt, KB, or code changes (that's Phase 2) |
| ~10 test cases across 4 categories | Bilingual/Chinese-input cases (deferred) |
| JS + LLM-graded assertions for 6 dimensions | Hard pass/fail thresholds (discovery first) |
| Baseline report with scores | Frontend display changes |

---

## Provider setup

The existing eval provider (`evals/reasoning/provider.py`) targets the Phase 1 archived agent. We need a new provider for Phase 2.

**Requirements:**
- Calls `src.ai.orchestrator.run_agent` (async)
- Needs: SQLite KB connection, PostgreSQL connection, `user_id`
- Same infrastructure as `test_chat_e2e_live.py` — Docker-composed PostgreSQL + SQLite file
- Returns structured `AgentResult` (status, response_text, tool_calls, pcsv, recipes)
- Env: `OPENROUTER_API_KEY`, `DATABASE_URL`, KB path

**Location:** `evals/phase2/provider.py` (new directory, separate from Phase 1 evals)

---

## Test cases (~10 cases, 4 categories)

### Category A — Dish count reasonableness

Tests whether the agent suggests a reasonable number of dishes for the stated party size.

| ID | Input | Party size | What we measure |
|---|---|---|---|
| `A1` | "I have chicken and broccoli. Please help me prepare dinner for two people." | 2 | Dish count — expect ~2-3, not 10 |
| `A2` | "I have beef, egg, and rice. Please help me to prepare dinner for four people." | 4 | Dish count — expect ~3-4 |
| `A3` | "I only have eggs. Quick lunch for one person." | 1 | Minimal input — expect 1-2 |
| `A4` | "I have chicken, rice, and various vegetables. Dinner party for 8 people." | 8 | Large party — does it scale reasonably? |

### Category B — Ingredient noise / bloat

Tests whether recipe cards contain an unreasonable number of ingredients, overlapping items, or trivial pantry staples. Uses the same inputs as Category A (dish count and ingredient bloat are two views of the same response).

| ID | Reuses | What we measure |
|---|---|---|
| `B1` | `A1` | Ingredient count per recipe. Overlap detection (near-duplicate ingredients within one recipe). Pantry staple presence (salt, water, oil). |
| `B2` | `A2` | Same signals |

### Category C — Diverse / specific user inputs

Tests behavior with longer, more specific, and constrained inputs.

| ID | Input | What we measure |
|---|---|---|
| `C1` | "I have salmon, asparagus, and lemon. I want a light, low-carb dinner for two. No dairy, no heavy sauces." | Dietary constraint compliance + ingredient reasonableness |
| `C2` | "I have chicken thighs, jasmine rice, bok choy, soy sauce, ginger, garlic, sesame oil. Looking for 2-3 Asian-inspired dishes for dinner for 3 people. One person is gluten-free." | Complex input + dietary constraint + dish count guidance |
| `C3` | "What can I make for dinner?" | Vague input — how does it handle minimal info? |

### Category D — Consistency (repeat runs)

Tests whether the same input produces consistent results across multiple runs.

| ID | Input | What we measure |
|---|---|---|
| `D1` | Same as `A1`, run 3 times | Variance in dish count and ingredient count across runs |
| `D2` | Same as `A2`, run 3 times | Same — consistency check |

---

## Assertions (6 dimensions)

### Structural assertions (JavaScript)

| Dimension | How | Output |
|---|---|---|
| **Dish count** | Extract recipe count from `AgentResult.recipes` | Integer per case |
| **Ingredient count per recipe** | Count items in each recipe's `ingredients` array | Integer per recipe |
| **Ingredient overlap** | Fuzzy string match within each recipe's ingredient list — detect near-duplicates (e.g., "poblano peppers" vs "anaheim peppers", "red onions" vs "onions") | List of flagged overlaps |
| **Pantry staples** | Check for salt, water, cooking oil, pepper, neutral oil in ingredient lists | Boolean + list |

### LLM-graded assertions (rubric)

| Dimension | Rubric prompt | Scale |
|---|---|---|
| **Dietary compliance** | "Does the response respect all stated dietary constraints? Are any violated?" | 1-5 |
| **Overall quality** | "Is the response helpful, well-structured, and reasonable for the stated scenario? Are the suggested dishes practical for the party size?" | 1-5 |

### Built-in metrics

| Metric | Source |
|---|---|
| **Cost** | promptfoo token tracking |
| **Latency** | promptfoo timing |
| **Token count** | Input + output tokens |

---

## File structure

```
evals/
  phase2/
    promptfooconfig.yaml    ← Config: provider, test cases, assertions
    provider.py             ← Phase 2 provider (calls src.ai.orchestrator)
    assertions/
      dish_count.js         ← Extract and score recipe count
      ingredient_noise.js   ← Overlap detection, pantry staple check, count
    test_cases.yaml         ← Test inputs and expected signals (separate for readability)
    README.md               ← How to run, what to expect
  reasoning/                ← Phase 1 evals (unchanged, archived reference)
```

---

## How to run

```bash
# Start services
docker compose up -d

# Run eval suite
cd evals/phase2
npx promptfoo eval -c promptfooconfig.yaml

# View results
npx promptfoo view
```

---

## Baseline deliverable

After the first run, record:
- Dish count per case (and variance for D1/D2)
- Ingredient count per recipe per case
- Flagged overlaps and pantry staples
- Dietary compliance scores
- Overall quality scores
- Cost and latency per case

This becomes the "before" snapshot. Phase 2 changes must improve these numbers.

---

## Modification History

| Date | Version | Changes |
|---|---|---|
| 2026-04-15 | v1 | Initial Phase 1 eval plan |
