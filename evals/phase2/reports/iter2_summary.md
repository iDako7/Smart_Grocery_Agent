# Iter 2 Summary — 2026-04-17

**Raw JSON:** `iter2_run2_2026-04-17.json` (final run, post-steak fix). Run 1 was `iter2_2026-04-17.json`.

**Config:** single `--no-cache` run, backend = local uvicorn on `127.0.0.1:8765`, grader = `anthropic/claude-sonnet-4.6` via OpenRouter @ `temperature=0`. 10 cases (C2 removed).

## Changes from iter 1

- Primary-protein: HARD filter → soft +2.0 score boost when recipe shares a user-named protein.
- Added `extras_penalty = 0.05 * len(ingredients_need)`.
- Dedupe key: `cooking_method` → `(cuisine, cooking_method)` tuple.
- **Run 2 only — dietary regression fix:** vegetarian/vegan denylist gained `steak, brisket, ribs, ribeye, sirloin, tenderloin, chuck, ground meat, meatball[s], oxtail, liver, kidney, venison`. Without this, r112 "Steak, Mushroom, and Asparagus Bowl" (ingredient "flank steak") leaked past the vegetarian filter and C1 dietary_compliance collapsed 5 → 1 on run 1.

## Scorecard vs ship bar

| Case | Metric | Baseline | Iter 1 | Iter 2 | Bar | Status |
|---|---|---|---|---|---|---|
| D1 | dietary_compliance | 2 / 1 | 4 | **5** | ≥4 hard | ✅ |
| C1 | dietary_compliance | 5 / 5 | 5 | **5** | ≥4 hard | ✅ (after run-2 steak fix) |
| B1 | ingredient_faithfulness | 1.5 | 2 | **1** | ≥3 hard | ❌ regressed |
| B2 | ingredient_faithfulness | 1.75 | 3 | **2** | ≥3 hard | ❌ |
| A1 | overall_quality | 2.5 | 2 | 2 | ≥3 strong | ❌ |
| A2 | overall_quality | 3 | 2 | 2 | ≥3 strong | ❌ |
| A3 | overall_quality | 2.5 | 3 | 3 | ≥3 strong | ❌* |
| A4 | overall_quality | 2 | 2 | 2 | ≥3 strong | ❌ |
| B1 | overall_quality | 2.5 | 3 | 2 | ≥3 strong | ❌ |
| B2 | overall_quality | 2 | 0.2 | 3 | ≥3 strong | ❌* |
| C1 | overall_quality | 2.5 | 2 | 2 | ≥3 strong | ❌ |
| C3 | vague_input_handling | 3 | 1 | 3 | ≥3 | ✅ |
| D3 | recipes_swap_quality | 5 | 0.4 | **5** | ≥3 | ✅ |

\* promptfoo treats `threshold=3` as strict `>`, so score=3 rows display `pass=False`. Substantively, these are "at bar."

**Hard gate:** dietary PASSES (both C1 and D1 at 5). ingredient_faithfulness FAILS (B1=1, B2=2).
**Strong gate:** overall_quality passes 0 of 7 strictly, 2 of 7 at-bar (A3, B2). Need ≥6 of 7.

## Diagnosis for iter 3

The grader rationales converge on three root causes:

1. **User ingredients not honored** (A1, B1: "broccoli completely absent from all three recipes"; A4: "system shows a veggie gap"). Scoring rewards pantry-coverage but doesn't force every user-named non-staple ingredient to appear. A recipe using chicken only from a chicken+broccoli pantry scores 0.5 and can still win.

2. **Specialty-ingredient overload** (B1: "pomegranate seeds, za'atar, sumac, feta, hummus, havarti, olives, pita, yogurt"). `extras_penalty=0.05` per missing ingredient is far too gentle — a 15-ingredient recipe only loses 0.75 while pantry+protein bonus can be 2.5.

3. **Variety dedupe still permeable** (A2: "two Korean rice bowls"; C1: "two Chinese stir-fries"). `(cuisine, cooking_method)` tuple dedupes by exact method match. "Gochujang Steak Bowl" and "Bibimbap" have different `cooking_method` values in the KB but are both "Korean rice bowls" perceptually.

Secondary issues:
- **A4 BBQ context** — user said "BBQ for 8" but recipes aren't grill-oriented. Model isn't inferring `cooking_method="grilled"` from "BBQ" (prompt issue, not search).
- **Overall quality ceiling** is largely bottlenecked by (1)+(2)+(3): if ingredient faithfulness and variety improve, practicality/variety sub-scores will follow.

## Iter 3 plan

- **Full-coverage bonus**: +3.0 score when `have` includes ALL user ingredients (non-staple). Forces recipes that actually use everything the user named.
- **Stronger extras penalty**: bump to 0.15 per missing ingredient. A 10-extra recipe now loses 1.5 instead of 0.5.
- **Cuisine-cap dedupe**: at most 1 recipe per cuisine unless KB can't fill quota (then spill). Catches "two Korean rice bowls" regardless of method field.
- **Prompt hint for BBQ/grill**: when user mentions BBQ, grill, barbecue in text, pass `cooking_method="grilled"` to `search_recipes`. Light-touch prompt addition.
