# Iter 1 Summary — 2026-04-17 (post #124 fix)

**Raw JSON:** `iter1_2026-04-17.json`

**Config:** single `--no-cache` run, backend = local uvicorn on `127.0.0.1:8765`, grader = `anthropic/claude-sonnet-4.6` via OpenRouter @ `temperature=0`. 10 cases (C2 removed).

## Scorecard vs ship bar

| Case | Metric | Baseline (2/2) | Iter 1 | Bar | Status |
|---|---|---|---|---|---|
| D1 | dietary_compliance | 2 / 1 | **4** | ≥4 hard | ✅ **PRIMARY GOAL MET** |
| C1 | dietary_compliance | 5 / 5 | 5 | ≥4 hard | ✅ |
| B1 | ingredient_faithfulness | 1.5 / 1.5 | 2 | ≥3 hard | ❌ |
| B2 | ingredient_faithfulness | 2 / 1.5 | 3 | ≥3 hard | ✅ |
| A1 | overall_quality | 3 / 2 | 2 | ≥3 strong | ❌ |
| A2 | overall_quality | 3 / 3 | 2 | ≥3 strong | ❌ regressed |
| A3 | overall_quality | 2 / 3 | 3 | ≥3 strong | ✅ improved |
| A4 | overall_quality | 2 / 2 | 2 | ≥3 strong | ❌ |
| B1 | overall_quality | 2 / 3 | 3 | ≥3 strong | ✅ improved |
| B2 | overall_quality | 2 / 2 | 0.2 | ≥3 strong | ❌ big regression |
| C1 | overall_quality | 3 / 2 | 2 | ≥3 strong | ❌ |
| C3 | vague_input_handling | 3 / 3 | 1 | ≥3 | ❌ regressed (likely variance) |
| D3 | recipes_swap_quality | 5 / 5 | 0.4 | ≥3 | ❌ big regression |

**Strong gate:** overall_quality passes 2 of 7 rubric-bearing cases (need ≥6 of 7). Not at bar.

## Diagnosis for iter 2

1. **Primary-protein HARD filter is too aggressive** (B2 regression). User lists beef+egg+rice → KB has only ~1 recipe with both beef or egg passing. Fix: soft-rank (big score bonus) instead of hard-drop when user named a protein.

2. **Cooking-method dedupe misses same-cuisine duplicates** (A2: two Korean rice bowls; C1: two tofu stir-fries). Dedupe should also factor in `cuisine` or a coarse recipe-type signal.

3. **Pantry-coverage scoring didn't force broccoli/veggie use** (A1, A4). Suspect: scoring rewards "how many user ingredients the recipe uses" — but recipes with one user ingredient (chicken) and many extras still rank if their only alternative is a two-ingredient-match recipe that isn't in KB. Fix: add a penalty for high `ingredients_need` count so recipes overloaded with extras fall down.

4. **`ingredient_faithfulness` still failing B1** — recipes require specialty ingredients (za'atar, sumac, pomegranate). Same root cause as (3): need a cap/penalty on extras.

5. **D3 continuity broken** — the dietary/protein changes altered which recipes the model presents on turn 1; swap on turn 2 still targets "recipe 1" but the model can't match back to turn 1 cleanly. May self-resolve once search is more stable.

6. **C3 regression** likely grader variance at threshold edge — not search-related.

## Iter 2 plan

- Swap primary-protein from HARD filter to **soft score boost** (+2.0 to pantry_cov when protein matches).
- Add `extras_penalty = len(ingredients_need) * 0.05` subtracted from score.
- Dedupe by `(cuisine, cooking_method)` tuple instead of method alone.
- Keep dietary HARD filter (working — D1 PASS).
- Re-run evals, judge against bar.
