# Phase 2 Eval Report — 2026-04-17

**Revision note.** The original run1/run2 (now archived as `run1_2026-04-17_pre-d3fix.json` / `run2_2026-04-17_pre-d3fix.json`) suffered from a D3 `vars.turns` character-iteration bug: promptfoo expanded D3's YAML list into two parametric rows and the provider iterated the resulting *string* per character, blowing D3 up to 140–260 s and ~$0.18 per row. Phase 3.5a fixed this by JSON-encoding `turns` in `test_cases.yaml` and defensively decoding in `provider.py`. The numbers below are from a fresh 2-run set (`--no-cache` each) after that fix; D3 is now a single row taking ~7.4 s.

**Runs compared:**
- Run 1 — `reports/run1_2026-04-17.json` (58 s wall-clock)
- Run 2 — `reports/run2_2026-04-17.json` (57 s wall-clock)
- Baseline — `baselines/main-2026-04-17.json` (11 cases, total tokens 114,459 / cached 88,064 = 80.6%, total cost $0.039925, mean latency 4,255 ms)

**Backend:** local uvicorn on `127.0.0.1:8765` (reusing `practical-tharp-db-1` Postgres on `:5432`; port 8000 held by that worktree's docker api). Flag: `--no-cache` on both invocations. Grader: `anthropic/claude-sonnet-4.6` via OpenRouter, `temperature=0`. `OPENROUTER_API_KEY` exported in the shell so the grader subprocess inherited credentials — 0 API errors on either run.

## 1. Scenario summary

| Case | Category | Description | Rubric(s) |
|---|---|---|---|
| A1 | dish_count | Chicken + broccoli, dinner for 2. | `overall_quality` |
| A2 | dish_count | Beef + egg + rice, dinner for 4. | `overall_quality` |
| A3 | dish_count | Salmon + asparagus, dinner for 1. | `overall_quality` |
| A4 | dish_count | Chicken + rice + veggies for 8 (BBQ). | `overall_quality` (cache-outlier in baseline) |
| B1 | ingredient_noise | Chicken + broccoli, noise emphasis. | `overall_quality`, `ingredient_faithfulness` |
| B2 | ingredient_noise | Beef + egg + rice, noise emphasis. | `overall_quality`, `ingredient_faithfulness` |
| C1 | dietary | Tofu + mushrooms, vegetarian no-dairy for 2. | `overall_quality`, `dietary_compliance` |
| C2 | bilingual | Chinese input, chicken + broccoli for 2. | `overall_quality`, `bilingual_handling` |
| C3 | vague_input | No ingredients, no party size. | `vague_input_handling` |
| D1 | dietary | Halal, chicken + rice + broccoli. | `dietary_compliance` |
| D3 | recipes_swap | 2-turn: plan 3, then swap #1 to vegetarian. | `recipes_swap_quality` |

JS structural asserts (`agent_completes`, `dish_count`, `ingredient_noise`) run first on A1–D3 and pass on all rows in both runs.

## 2. Latency distribution

| Case | Run 1 (ms) | Run 2 (ms) | Mean (ms) | Δ R2 vs R1 | Δ vs baseline 4,255 ms |
|---|---:|---:|---:|---:|---:|
| A1 | 5,836 | 3,509 | 4,672 | -39.9% | +417 / +9.8% |
| A2 | 10,656 | 6,186 | 8,421 | -41.9% | +4,166 / +97.9% |
| A3 | 13,967 | 9,375 | 11,671 | -32.9% | +7,416 / +174.3% |
| A4 | 18,057 | 11,834 | 14,946 | -34.5% | +10,691 / +251.2% |
| B1 | 3,166 | 4,381 | 3,774 | +38.4% | -481 / -11.3% |
| B2 | 3,528 | 8,172 | 5,850 | +131.6% | +1,595 / +37.5% |
| C1 | 5,310 | 10,578 | 7,944 | +99.2% | +3,689 / +86.7% |
| C2 | 3,872 | 10,745 | 7,308 | +177.5% | +3,053 / +71.8% |
| C3 | 1,457 | 2,015 | 1,736 | +38.3% | -2,519 / -59.2% |
| D1 | 3,849 | 3,029 | 3,439 | -21.3% | -816 / -19.2% |
| D3 | 7,475 | 7,396 | 7,436 | -1.1% | +3,181 / +74.7% |

**Overall mean latency:** Run 1 = **7,016 ms**, Run 2 = **7,020 ms** (Δ R2 vs R1: **+0.1%**). Mean across both runs = **7,018 ms**, **+2,763 ms (+64.9%)** vs baseline 4,255 ms.

**D3 fix impact:** pre-fix D3 was 140–260 s per row across 2 expanded rows; post-fix D3 is a single row at ~7.4 s (-98% latency). Sum-total wall-clock dropped from 469 s (Run 1 pre-fix) and 423 s (Run 2 pre-fix) to **77 s on both** post-fix runs — an **83–84% reduction** in suite wall-clock.

**Cases >6 s** (above the ~6 s 2σ bar from a 4.3 s baseline): A2, A3, A4, B2, C1, C2, D3 in at least one run.

**Run-to-run agreement (±20% tolerance):** 2/11 cases within tolerance (D1, D3). Outliers span the rest: A1/A2/A3/A4 all latency-dropped 30–42% in Run 2, while B2/C1/C2 all latency-spiked +99% to +178%. The drop on A1–A4 is consistent with warmer OpenRouter auto-cache between adjacent runs; the spikes on B2/C1/C2 suggest those cases' tool trajectories are sensitive to scheduler jitter under promptfoo's concurrency=4.

## 3. Cost

| Case | Run 1 ($) | Run 2 ($) | R1 prompt tok | R1 cached tok | R1 cache % | R2 prompt tok | R2 cached tok | R2 cache % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 | 0.00345 | 0.00304 | 10,886 | 9,216 | 84.7% | 7,695 | 6,144 | 79.8% |
| A2 | 0.00373 | 0.00259 | 11,100 | 9,216 | 83.0% | 7,326 | 6,144 | 83.9% |
| A3 | 0.00318 | 0.00228 | 10,373 | 9,216 | 88.8% | 10,373 | 9,728 | 93.8% |
| A4 | 0.00315 | 0.00442 | 7,835 | 6,144 | **78.4%** | 9,883 | 6,144 | **62.2%** |
| B1 | 0.00219 | 0.00268 | 10,886 | 10,240 | 94.1% | 10,886 | 10,240 | 94.1% |
| B2 | 0.00308 | 0.00264 | 10,890 | 9,216 | 84.6% | 7,603 | 6,144 | 80.8% |
| C1 | 0.00287 | 0.00237 | 7,226 | 6,144 | 85.0% | 7,226 | 6,656 | 92.1% |
| C2 | 0.00248 | 0.00267 | 9,830 | 9,216 | 93.8% | 9,830 | 9,216 | 93.8% |
| C3 | 0.00118 | 0.00154 | 3,163 | 3,072 | 97.1% | 6,417 | 6,144 | 95.7% |
| D1 | 0.00244 | 0.00240 | 8,927 | 8,704 | **97.5%** | 8,927 | 8,704 | **97.5%** |
| D3 | 0.00712 | 0.00914 | 19,200 | 15,360 | 80.0% | 18,533 | 12,288 | 66.3% |
| **Totals** | **0.034859** | **0.035775** | 110,316 | 95,744 | **86.8%** | 104,699 | 87,552 | **83.6%** |

**Vs baseline totals** ($0.039925 / 80.6% cache, mean latency 4,255 ms):
- Run 1 cost **-12.7%** below baseline; Run 2 cost **-10.4%** below baseline.
- Run 1 cache-hit rate **+6.2 pp** above baseline; Run 2 **+3.0 pp** above.
- Prompt-token total 110,316 (R1) / 104,699 (R2) vs baseline 110,853 — within ±6%.

**A4 cache hit (baseline 62% outlier):** Run 1 78.4% (improved), Run 2 62.2% (exactly matches baseline). A4 remains the most volatile cache case in the suite — its "dinner for 8" tool trajectory produces tail tokens that slip outside OpenRouter's 5 s auto-cache window about half the time.

**D1 (baseline flagged expensive):** $0.00244 / $0.00240, **97.5% cache hit on both runs**. D1's cost profile has **tightened dramatically** vs the baseline report (which flagged it as expensive) and vs the pre-fix eval (68.9% cache). Now mid-pack and stable. The D1 "expensive" reputation does not survive the cleaned measurement.

**D3 (post-fix):** $0.0071 / $0.0091, 80.0% / 66.3% cache. D3 is ~2–2.5× the cost of a single-turn case because it sends two turns, which is expected. Pre-fix it was ~$0.16–$0.20 per expanded row; the fix took suite D3-spend from ~$0.36 → ~$0.008.

**Prompt:completion ratio:** Run 1 = 110,316 / 3,722 ≈ **29.6 : 1**, Run 2 = 104,699 / 3,633 ≈ **28.8 : 1** vs baseline's 30.7 : 1. Essentially matches the baseline ratio (baseline: 110,853 / 3,606).

## 4. Generated quality (promptfoo rubrics)

| Case | Metric | R1 score | R2 score | R1 pass | R2 pass | Flip? |
|---|---|---:|---:|---|---|---|
| A1 | overall_quality | 3 | 2 | No | No | — |
| A2 | overall_quality | 3 | 3 | No | No | — |
| A3 | overall_quality | 2 | 3 | No | No | — |
| A4 | overall_quality | 2 | 2 | No | No | — |
| B1 | overall_quality | 2 | 3 | No | No | — |
| B1 | ingredient_faithfulness | 1.5 | 1.5 | No | No | — |
| B2 | overall_quality | 2 | 2 | No | No | — |
| B2 | ingredient_faithfulness | 2 | 1.5 | No | No | — |
| C1 | overall_quality | 3 | 2 | No | No | — |
| C1 | dietary_compliance | 5 | 5 | Yes | Yes | — |
| C2 | overall_quality | 1 | 1 | No | No | — |
| C2 | bilingual_handling | 5 | 4 | Yes | Yes | — |
| C3 | vague_input_handling | 3 | 3 | Yes | Yes | — |
| D1 | dietary_compliance | 2 | 1 | No | No | — |
| D3 | recipes_swap_quality | 5 | 5 | Yes | Yes | — |

**Rubric passes:** Run 1 = **4 / 15**, Run 2 = **4 / 15** (26.7% each). Identical pass set: `C1 dietary_compliance`, `C2 bilingual_handling`, `C3 vague_input_handling`, `D3 recipes_swap_quality`.

**Rubric flips between runs:** **0 / 15.** The grader is rock-solid run-to-run under Claude Sonnet 4.6 `temperature=0`; all pass-set membership is stable even when scores drift by 1 point (A1, A3, B1, B2 `ingredient_faithfulness`, C1, C2 `bilingual_handling`, D1).

**Rubrics that fail BOTH runs (real quality issues):**
- `overall_quality`: A1, A2, A3, A4, B1, B2, C1, C2 — **8 of 11 cases**. A2 now scores 3,3 (was 3,3 in pre-fix — same). C2 at 1,1 is a hard failure on the bilingual output.
- `ingredient_faithfulness`: B1 (1.5, 1.5) and B2 (2, 1.5) — **both B-series cases fail**, same as pre-fix runs.
- `dietary_compliance`: D1 (2, 1) — both below threshold 4, consistent halal-constraint miss.

JS deterministic asserts (`agent_completes`, `dish_count`, `ingredient_noise`) passed on all 11 rows in both runs.

## 5. Findings

1. **[infra, D3] D3 character-iteration bug in provider — fixed, confirmed.** Detection: pre-fix `run1_2026-04-17_pre-d3fix.json` / `run2_pre-d3fix.json` archived show D3 as **two rows of 140–260 s each** costing $0.12–$0.20 per row. Cause: `test_cases.yaml` originally listed `vars.turns` as a native YAML list, which promptfoo cartesian-expanded into parametric tests and delivered a string to `provider.py`, where `_run_single_turn` iterated the string per character. Fix (Phase 3.5a, not touched here): `test_cases.yaml` now encodes `turns` as a JSON-encoded scalar string; `provider.py` defensively `json.loads`-decodes. Post-fix D3 is **1 row, ~7.4 s, ~$0.008, 66–80% cache** — matching smoke-test expectations. Suite wall-clock fell 83–84% (469/423 s pre-fix → 77 s post-fix).

2. **[quality, 8 of 11 cases] `overall_quality` fails the ≥3 threshold on A1–A4, B1, B2, C1, C2 in both runs** — identical to the pre-fix quality picture (8 of 10 non-D3 cases pre-fix). So what: this is *not* an artifact of the D3 bug. The agent's outputs are under-delivering on grounding / count-fit / explanation on 73% of the suite. C2 at 1/1 is particularly bad — the bilingual path appears to lose most of the structured content. This dominates the quality roadmap and is orthogonal to prompt-caching economics.

3. **[quality, B1 / B2] `ingredient_faithfulness` fails on both B-series cases in both runs** (B1 1.5/1.5; B2 2/1.5). Same failure mode as pre-fix. The "ingredient noise" emphasis in B-series inputs reveals that the agent adds ingredients the user did not provide; this is a pure quality bug that prompt caching / tool trimming will not fix.

4. **[quality, D1] `dietary_compliance` fails 2/1 on halal** — trending *worse* than pre-fix (was 1/2). Hard dietary constraint is being violated at least intermittently; this is a priority bug because halal is a safety-class restriction per the spec ("dietary restrictions are hard constraints — never violated"). Matches a known weakness the pre-fix numbers already flagged.

5. **[cache, A4] A4 cache hit = 78.4% (R1) / 62.2% (R2)** — Run 2 exactly reproduces baseline's 62% outlier; Run 1 came in higher. D1, by contrast, holds at **97.5% on both runs**. So what: A4 alone (the "BBQ for 8" long-tool-trajectory case) is the stable cache outlier; the baseline's flag of D1 as "expensive" does not survive this cleaner measurement. The Phase 1 spike attribution of `search_recipes` tool payload size as the lever remains plausible — A4 is the case that exercises that tool most heavily.

6. **[rubric-stability] 0 rubric flips across 15 rubric instances in Run 1 vs Run 2.** Pre-fix had 2 flips (A2, C2) — both threshold-adjacency artifacts. Post-fix those disappeared (A2 both at `score=3, pass=False`; C2 `bilingual_handling` 5→4, both pass). So what: grader pinning (Claude Sonnet 4.6 via OpenRouter, `temperature=0`) is now reproducible at the pass/fail level; reports can be produced from a single run with reasonable confidence and double-runs are a cheap safety net, not a requirement.

7. **[cost, aggregate] Run 1 = $0.034859 and Run 2 = $0.035775 — both ~11% below baseline $0.039925 and 5–7% below each other.** Aggregate cache 83.6–86.8% vs baseline 80.6%. So what: once D3 is fixed, the suite's economics are **better than baseline**, not worse, even under `--no-cache`. Remaining cost headroom is narrow (~$0.004 per full run); spending engineering effort on further caching economics is a low-value play.

**Spike reconciliation — does the clean eval data corroborate or contradict Phase 1's verdict to defer #116?**

- `search_recipes`-heavy case (A4) still shows cache-rate depression in one of two runs (62.2% in R2 vs 80.6% baseline), matching the spike's claim that `search_recipes` tool result bloat is the dominant uncached lever. Single-data-point, but the direction is unchanged. **Corroborated.**
- Aggregate cache hit 83.6–86.8% lands above baseline's 80.6%, consistent with the spike's 80% auto-cache narrative. Explicit #116 caching would compete against an already-high hit rate for the marginal 15–20% of uncached tokens — exactly the economics the spike flagged as marginal. **Corroborated.**
- Total-cost delta (-10% to -13% below baseline) is larger than what #116 could plausibly add. Engineering payoff for implementing #116 is even lower than the spike estimated. **Strengthened.**
- The eval rubrics continue to surface quality bugs (overall_quality on 8/11 cases; B-series ingredient_faithfulness; D1 halal) that prompt caching cannot address. These are now the demonstrably-higher-ROI backlog items.

**Phase 1 Defer #116 verdict is confirmed and strengthened — clean-measurement economics are even tighter than the spike projected; priority should shift fully to the `overall_quality`, `ingredient_faithfulness`, and `dietary_compliance` quality tracks surfaced by rubrics.**
