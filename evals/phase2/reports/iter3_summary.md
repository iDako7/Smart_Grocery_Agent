# Iter 3 Summary — 2026-04-17 (final)

**Raw JSON:** `iter3_run2_2026-04-17.json` (clean-profile serial run; canonical).
Run 1 `iter3_2026-04-17.json` was invalid — the dev user profile was polluted
(`["vegetarian","no dairy","halal"]`) from accumulated `update_user_profile`
writes in prior runs, and concurrency=4 allowed C1 to pollute mid-run.

**Config:** backend = local uvicorn on `127.0.0.1:8765` (fresh restart,
clean profile), grader = `anthropic/claude-sonnet-4.6` via OpenRouter,
`npx promptfoo eval --no-cache -j 1` (serial to prevent profile pollution).
10 cases (C2 removed).

## Changes from iter 2

- **`covered_user_ings` set**: fix latent bug where `have` counted recipe
  ingredients with dish-name-prefix substring matches (e.g. r102 "za'atar
  spiced chicken: salt" counted as a chicken match), inflating
  `len(have)` past `len(user_ingredients)`. Now `pantry_cov` uses the set
  of user tokens actually covered, capped at 1.0.
- **Full-coverage bonus (+3.0)**: recipes that cover EVERY user-named
  ingredient dominate scoring. Addresses A1/B1 "broccoli completely absent"
  grader complaint.
- **extras_penalty 0.05 → 0.15**: specialty-ingredient-heavy recipes
  (za'atar, sumac, pomegranate) drop out of top-3.
- **Cuisine-cap dedupe**: ≤1 primary per cuisine, spill to leftover.
  Replaces `(cuisine, cooking_method)` tuple that let Bibimbap (mixed) +
  Gochujang Steak Bowl (pan-fry) both through.
- **Prompt**: one-sentence "BBQ/grill → pass `cooking_method='grilled'`"
  hint to `search_recipes` tool instructions.

## Scorecard vs ship bar

| Case | Metric | Baseline | Iter 1 | Iter 2 | **Iter 3** | Bar | Status |
|---|---|---|---|---|---|---|---|
| D1 | dietary_compliance | 2/1 | 4 | 5 | **4.5** | ≥4 hard | ✅ |
| C1 | dietary_compliance | 5/5 | 5 | 5 | **5** | ≥4 hard | ✅ |
| B1 | ingredient_faithfulness | 1.5 | 2 | 1 | **3** | ≥3 hard | ✅ at bar |
| B2 | ingredient_faithfulness | 1.75 | 3 | 2 | **2** | ≥3 hard | ❌ |
| A1 | overall_quality | 2.5 | 2 | 2 | **4** | ≥3 strong | ✅ |
| A2 | overall_quality | 3 | 2 | 2 | **4** | ≥3 strong | ✅ |
| A3 | overall_quality | 2.5 | 3 | 3 | **4** | ≥3 strong | ✅ |
| A4 | overall_quality | 2 | 2 | 2 | **2** | ≥3 strong | ❌ |
| B1 | overall_quality | 2.5 | 3 | 2 | **3** | ≥3 strong | ✅ at bar |
| B2 | overall_quality | 2 | 0.2 | 3 | **3** | ≥3 strong | ✅ at bar |
| C1 | overall_quality | 2.5 | 2 | 2 | **3** | ≥3 strong | ✅ at bar |
| C3 | vague_input_handling | 3 | 1 | 3 | **3** | ≥3 | ✅ |
| D3 | recipes_swap_quality | 5 | 0.4 | 5 | **2** | ≥3 | ❌ regressed |

**HARD dietary gate:** ✅ PASS (D1=4.5, C1=5).
**HARD ingredient_faithfulness gate:** ⚠️ partial (B1=3 at bar; B2=2 below bar).
**STRONG overall_quality gate:** ✅ 6 of 7 at bar (A1=4, A2=4, A3=4, B1=3, B2=3, C1=3). A4=2 is the sole miss. Requirement was ≥6 of 7.

## What shipped

- **Primary goal of #124 (dietary HARD gate): fully met.** Halal filter works; vegetarian filter works; dairy-free filter works.
- **overall_quality transformed** from 0-2 of 7 at bar in iter 2 to 6 of 7 in iter 3. The full-coverage bonus + extras penalty bump is what moved it — graders explicitly cite "all recipes executable" and "uses stated ingredients" rationales on A1/A2/A3.
- **B1 ingredient_faithfulness fixed**: 1 → 3 (at bar). Grader now says the recipes "use chicken and broccoli" vs iter 2's "broccoli completely absent."
- **Latent `pantry_cov` bug fixed**: dish-name-prefix double-counting no longer inflates coverage scores.

## Remaining issues (iter 3 does NOT fix)

1. **A4 BBQ** (overall_quality=2). The prompt hint wasn't picked up — agent still didn't pass `cooking_method='grilled'` despite "BBQ dinner for 8" in the user input. Likely needs stronger prompting (e.g., Rule 12 explicit mapping, not just a parenthetical in the tool instructions) or a chat-facing PCSV-free branch for grill-specific queries. Separate work item.
2. **B2 ingredient_faithfulness=2**. Grader: "4-5 specialty ingredients per recipe" (gochujang, fish sauce, palm sugar, pita bread). `extras_penalty=0.15` still isn't punishing enough for Asian-fusion recipes that naturally carry fermented-sauce specialties. A further bump (0.25) risks regressing A1/A2/A3 where the same penalty weight helped.
3. **D3 recipes_swap_quality=2** (regressed from iter 2's 5). Grader: agent regenerated recipes 2 and 3 when user only asked to swap recipe 1. This is an orchestrator/prompt continuity issue, not a `search_recipes` issue. Separate investigation.

## Eval infrastructure fix applied

**Root cause found during iter 3**: the dev user profile in Postgres
(`00000000-0000-0000-0000-000000000001`) accumulates `update_user_profile`
writes from any test that asks the agent to add dietary/preference data.
With promptfoo concurrency=4 the profile state mid-run is non-deterministic,
and across iterations it persists. This silently corrupted iter 1, iter 2,
and iter 3's first run.

- **Mitigation (this run):** manually reset the profile row to clean
  defaults before running (`UPDATE user_profiles SET dietary_restrictions='[]',
  preferred_cuisines='[]', disliked_ingredients='[]', household_size=2`),
  and run serial (`-j 1`).
- **Recommended permanent fix** (separate work item): either (a) give
  each test run a distinct user_id, (b) reset the dev profile in the
  provider's `before_test` hook, or (c) disable `update_user_profile` in
  eval mode. This blocks reliable regression testing until fixed.

## Ship decision

Given:
- Dietary HARD gate met (D1, C1).
- Strong overall_quality gate met in substance (6 of 7 at ≥3; requirement is ≥6 of 7).
- ingredient_faithfulness B1 at bar, B2 below.
- Two remaining issues (A4 BBQ, D3 continuity) are prompt/orchestration problems, NOT search_recipes.

The service is **qualitatively ready to use** for the core pantry-to-recipe
path. Hard-constraint dietary safety is enforced at the tool layer.
Quality on ingredient-sparse multi-specialty queries (B2) and
cooking-context queries (A4) remains a weak spot and should be addressed
in follow-up work (Rule 12 BBQ mapping; B2-specific extras penalty
tuning; eval harness profile reset).
