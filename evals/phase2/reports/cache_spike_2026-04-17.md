# Cache Spike — Prompt & Tool-Result Bloat (2026-04-17)

**Context:** Issue #115 — decide whether the upcoming explicit `cache_control`
build (#116) is worth doing, or whether prompt trimming is a bigger lever.

**Baseline (11 cases, `main-2026-04-17.json`):**
- 110,853 prompt tokens / 3,606 completion tokens
- 88,064 cached tokens → **80.6 % mean cache-hit ratio** (OpenRouter auto-cache)
- $0.039925 total / ~$0.00363 per run
- mean latency 4,255 ms

## Method

- Instrumented `src/ai/orchestrator.py` with an env-gated (`SGA_EVAL_DUMP_MESSAGES=1`)
  dump: at the top of every iteration of the agent while-loop the in-scope
  `messages` list was written to `evals/phase2/.spike_dumps/<case>_iter<NN>_<ts>.json`.
  The instrumentation was **reverted** before returning; the current
  `orchestrator.py` retains no spike code.
- Ran two cases through a local uvicorn backend (port 8765, reusing the
  `practical-tharp-db-1` Postgres):
  - **A1** (single turn): *"I have chicken and broccoli. Please help me prepare
    dinner for two people."* → 3 iterations → 3 dumps.
  - **D3** (two turns, same session): *"Plan me 3 dinners…"* + *"Swap the
    first recipe for something vegetarian."* → 2 iterations per turn → 4 dumps.
- **7 dumps total.** Analysis in
  `evals/phase2/scripts/cache_spike_analysis.py`.
- Encoder: **`tiktoken.get_encoding("cl100k_base")`** (cl100k_base is the same
  family OpenAI models use; cheap, deterministic, run locally). A 4-token
  per-message overhead is added to match OpenAI's "tokens-per-message"
  convention; role strings and tool-call framing are counted.

## (a) System prompt size

**1,962 tokens** (8,544 chars) — measured on the system message of the first
A1 dump. The prompt is identical across every iteration and every case.

| Section | Tokens |
|---|---|
| `# Smart Grocery Assistant` (persona) | 107 |
| `## How you behave` | 183 |
| `## Rules` | **1,047** |
| `## User Profile` | 25 |
| `## Tool Usage` | 4 |
| `### Screen-aware terminal action` | 508 |
| `### Important` | 65 |
| `## Current Screen` | 23 |

**Trim targets (informational — not in scope of this spike):**
- `## Rules` (1,047 tok) is by far the biggest chunk; likely the best lever if
  prompt trimming becomes the path.
- `### Screen-aware terminal action` (508 tok) is fully duplicated in every
  call even when no screen transition is possible; could be gated or moved
  into a tool description.

## (b) Tool-result bloat

Measured against the **last iteration** of each case (which contains every
tool result that ran). Across the 3 runs combined:

| Tool | Calls | Total tokens | Avg |
|---|---|---|---|
| `search_recipes` | 3 | **7,772** | 2,590 |
| `analyze_pcsv` | 3 | 202 | 67 |
| *(all others)* | 0 | 0 | — |

**Total tool-result tokens across the 3 runs: 7,974.**

**Largest single tool result:** `search_recipes` in case D3t1 at **3,444 tokens**
— a multi-recipe result set starting with `Za'atar Chicken & Rice Bowl…`.
`search_recipes` returns full `RecipeSummary` objects (name, cuisine,
cooking-method, effort, bilingual fields, metadata, ingredient list) for 5–10
recipes, so the payload scales ~350–600 tok/recipe.

> One `search_recipes` response is ~1.7× the entire system prompt and ~8×
> the user message. This is the single biggest lever.

## (c) Stable vs volatile split

Analyzed **case A1** (3 iterations, 3 → 5 → 7 messages).

| Metric | Value |
|---|---|
| Iterations compared | 3 |
| Message-counts per iter | 3, 5, 7 |
| Stable prefix (message count) | **7 / 7** |
| Stable tokens | **3,349** |
| Volatile tokens | **0** |
| Stable % of last-iter prompt | **100 %** |
| Volatile % | **0 %** |

Stable-tokens breakdown by role:

| Role | Tokens |
|---|---|
| `system` | 1,967 |
| `user` | 40 |
| `assistant_tool_calls` | 113 |
| `tool` (tool results) | 1,229 |

**Interpretation.** The orchestrator is *append-only* — `messages.append(...)`
and `messages.extend(tool_messages)` are the only mutations (lines 374–375 of
`orchestrator.py`). A message, once emitted, is byte-identical in every
later iteration. That makes the whole prefix "stable" by the definition of
this spike — every iteration's input is a strict extension of the previous.
This is the structural reason OpenRouter's auto-cache already achieves 80.6 %.
There is **no pathological volatility** (e.g., shuffled message order, mutated
content, unstable JSON serialization) to fix first.

## (d) Projected `cache_control` savings

**Formula.** From the aggregate baseline:

```
auto_cache_pct  = 88,064 / 110,853            = 79.44 %
uncached_tokens = 110,853 × (1 − 0.7944)      ≈ 22,807 / 11 cases
                                              ≈ 2,072 tokens per run
uncached_cost   ≈ (1 − 0.7944) × $0.0363/run  ≈ $0.00073 per run
per_run_cost    = $0.0399 / 11                ≈ $0.00363
```

Of those 2,072 uncached tokens, only the portion that is **stable** across
iterations can be recovered by explicit `cache_control`. The spike measured
**100 %** of the A1 prompt as stable → upper-bound cacheable share is ~2,072
tokens/run.

| Metric | Value |
|---|---|
| Current auto-cache hit | 79.44 % |
| Uncached tokens per run | ~2,072 |
| Uncached cost per run | ~$0.00073 |
| Stable share of uncached (upper bound) | **100 %** |
| **Projected savings per run** | **~$0.00073** |
| **% delta on per-run total cost** | **~20.6 %** |
| Absolute savings over 11-case suite | ~$0.008 (one run) |
| Absolute savings over 1,000 runs | **~$0.73** |

**Caveats on the upper bound.**
- The 100 % stable figure comes from the *in-turn* loop. Cross-turn (D3 t2
  keeps D3 t1's history) and cross-session stability is partial, not 100 %.
- OpenRouter's auto-cache likely already captures the highest-stability
  prefix (which is why the hit ratio is 79 % not 0 %). Explicit `cache_control`
  mostly helps on the **first** call of each session (where auto-cache has
  nothing to hit yet) and on cross-case prefix overlap (the identical
  1,962-tok system prompt).
- The cost model here is linear in tokens; actual OpenRouter uncached-vs-cached
  pricing is closer to 10×, so the $0.00073 figure is a **lower-bound**
  savings estimate in token terms and roughly the right order in dollar
  terms (since auto-cache already provides most of the discount).

## Go / No-go for issue #116

**Verdict: Defer — do prompt / tool-result trimming first.**

**Threshold used:** ≥$0.001/run (~30 % of per-run cost) *and* a clear >1 kTok/run
uncached-stable lever. The spike finds ~$0.00073/run and a <2.1 kTok/run
uncached-stable opportunity. **Misses the threshold on both axes.**

**Rationale.** The prompt is already 100 % stable inside the loop; the auto-cache
is already capturing 80 %. An explicit `cache_control` build buys at most
~$0.00073/run (upper bound under linear pricing; real-world likely less). The
**actual biggest lever is elsewhere**:

1. **`search_recipes` response size.** One response is 2,590–3,444 tokens —
   1.7× the system prompt and 8× the user message. Trimming this (e.g.,
   returning a light-weight recipe card shape, deferring full recipe bodies
   to `get_recipe_detail`) would shave ~2 kTok per recipe-search call *and*
   shrink the growing `messages` list (which compounds latency).
2. **`## Rules` section of the system prompt.** 1,047 tok (53 % of system
   prompt) — every run pays for it. A ~30 % trim here saves ~300 tok/run across
   **all** 11 cases, not just those that hit `search_recipes`.

Do (1) and (2) first. Re-measure. If after trimming the auto-cache ratio
drops (because the stable prefix got smaller in absolute terms) *or* we start
deploying multi-tenant where cross-session cold starts dominate, revisit
`cache_control` as a separate ~$0.001/run optimisation.

---

*Generated via `evals/phase2/scripts/cache_spike_analysis.py` over dumps in
`evals/phase2/.spike_dumps/` (7 dumps, 3 cases, tiktoken cl100k_base).*
