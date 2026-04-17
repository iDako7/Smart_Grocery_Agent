# Issue #87 — Dish count inconsistency: root-cause diagnosis

**Date:** 2026-04-16
**Branch:** `fix/87-dish-count`
**Status:** Investigation complete. Fix not yet scoped. PR #105 *not* ready to ship.

> **TL;DR** — The symptom labeled "dish count inconsistency" is actually two overlapping bugs. The dominant one is: **when PCSV detects a protein/carb/veggie gap, the agent narrates the gap to the user instead of presenting the KB recipes it already fetched.** No `recipe_card` SSE events are emitted, so the home-screen recipes panel stays empty even though `search_recipes` ran and returned real results. A secondary bug is that the model doesn't reliably pass `max_results` to `search_recipes`, so the cap from PR #105 is leaky. Related to #99 (same underlying pattern, different symptom — clarify turn serialization).

---

## 1. Empirical evidence

Ran `evals/phase2/scripts/consistency_runner.py --runs 5 --no-gate` at temp=0.3 against a healthy backend on `localhost:8000`. Four cases, five runs each.

| Case | Input | Party | Expected | Actual (all 5 runs) | stddev |
|------|-------|-------|----------|---------------------|--------|
| A1 | "I have chicken and broccoli. Please help me prepare dinner for two people." | 2 | 2-3 dishes | **0** | 0 |
| A2 | "I have beef, egg, and rice. Please help me to prepare dinner for four people." | 4 | 3-4 dishes | **7** | 0 |
| A3 | "I have salmon and asparagus. Please help me prepare dinner for one person." | 1 | 1-2 dishes | **0** | 0 |
| A4 | "I have chicken, rice, and mixed vegetables. Please help me prepare a BBQ dinner for eight people." | 8 | 4-5 dishes | **0** | 0 |

**Important side finding:** temp=0.3 is perfectly deterministic across all four cases (stddev=0 on every metric). The pre-commit reviewer's HIGH-severity concern that "temp > 0 introduces variance that will break the variance-zero gate" is empirically wrong for Claude via OpenRouter at this temperature. No need to switch to temp=0.0.

## 2. Hypotheses considered

Investigation tried each of the following against the curl evidence in `/tmp/a1_raw.txt`, `/tmp/a2_raw.txt`, `/tmp/a3_raw.txt`, `/tmp/a1_explicit.txt`. (These files are ephemeral; the conclusions below are the durable record.)

| # | Hypothesis | Verdict |
|---|------------|---------|
| H1 | Runner SSE parsing is broken for some response shapes | **Ruled out.** Runner extracts `recipe_card` events correctly when backend emits them. A2 parses fine. |
| H2 | Agent takes a conversational path and never emits `recipe_card` for A1/A3/A4 | **Confirmed primary cause.** |
| H3 | `max_results` cap from PR #105 isn't being honored | **Confirmed as partial cause for A2.** A2 returned 7 (expected 3-4). Explicit "show me 3 recipes" prompt returned 10 (default). Model omits the parameter despite Rule 11. |
| H4 | KB data gap — no recipes for those ingredient combos | **Ruled out.** A1 prompt rephrased as "show me 3 recipes with chicken and broccoli" returned 10 recipes. The data is there. |

## 3. Root cause

### The narrative-vs-presentation bug (H2)

For A1 ("chicken and broccoli... dinner for two"), raw SSE stream:

```
event: thinking       data: {"message": "Running analyze_pcsv..."}
event: thinking       data: {"message": "Running search_recipes..."}
event: pcsv_update    data: {... "carb": {"status":"gap"}, "sauce":{"status":"gap"} ...}
event: explanation    data: {"text": "A good direction is a quick chicken and broccoli dinner
                                      with a carb and simple sauce added.\n\nYou have the
                                      protein and veggie base already, but you'll likely want
                                      to add rice or noodles plus a sauce so it feels
                                      complete."}
event: done
```

Zero `recipe_card` events. Session snapshot shows `recipes: []`. A3 same shape. A4 same shape.

Both tools were invoked — the `thinking` event for `search_recipes` fires — but whatever the tool returned does not surface as user-visible recipe cards. The agent absorbed the PCSV gap signal and chose to *talk about* the gap instead of *presenting KB options* to fill it.

### Why A2 is the odd one out

A2 (beef + egg + rice) forms a naturally complete Protein/Carb/Veggie set — rice is a carb, egg plays a protein role, beef is protein. PCSV returns no `gap` status. The agent has nothing to narrate, so it falls through to the normal presentation path and emits 7 `recipe_card` events.

**A1/A3/A4 all have PCSV gaps. A2 does not. That is the entire asymmetry.**

### The max_results leak (H3)

- `contracts/tool_schemas.py:51` — `max_results: int | None = Field(default=None, ge=1, le=20)` ✓
- `src/ai/tools/search_recipes.py:74` — `limit = input.max_results or 10` ✓ correct on server side
- `src/ai/prompt.py:81` (Rule 11) — *advisory* natural-language instruction to "Pass the chosen count as `max_results`"

Sonnet 4.6 at temp=0.3 treats Rule 11 as optional:
- A2 passed `max_results=7` (should be 3-4 per the ladder) — wrong value
- Explicit "show me 3 recipes" test omitted `max_results` entirely — default cap of 10 applied

The server-side cap works. The prompt-side instruction does not reliably get the model to use it.

## 4. Related landmines

### Orchestrator replaces recipe_results per tool call

[`src/ai/orchestrator.py:280-281`](../../src/ai/orchestrator.py) (approximate line) assigns `recipe_results = ...` on each `search_recipes` tool call rather than accumulating. If the model makes a second `search_recipes` call with tighter filters that returns an empty list, the prior valid results are wiped. Not proven to fire in the probe runs above, but it is a latent failure mode that will make the narrative-vs-presentation bug harder to diagnose once it does fire.

### SSE emission is downstream of agent decision

[`src/ai/sse.py:51-53`](../../src/ai/sse.py) emits `recipe_card` events only when `result.recipes` is populated on the terminal `AgentResult`. There is no mechanism that says "if `search_recipes` was called during the loop and returned non-empty, surface those recipes regardless of the model's terminal narrative." That policy would have to be added.

## 5. Why past fixes didn't land the real bug

- **Issue #99** (closed 2026-04-16) fixed a related symptom: the clarify-turn path was saving `""` to conversation history, so the *next* `/chat` call lost context. That fix was correct for its scope. But it addressed the serialization of a conversational path rather than questioning whether the conversational path should have been taken at all on the home screen.
- **PR #105 Commits in this branch** add: an optional `max_results` contract field (`afdea38`), Rule 11 + max_results cap + temp=0.3 (`fc04690`), consistency runner with gates (`841eed2`). Each is correct in isolation. None of them force the agent to *present* KB recipes it already fetched. The probe run above would still produce 0 dishes for A1/A3/A4 with all three commits applied.

Both attempts treated downstream symptoms. The root cause is that the agent's terminal-message logic has no hard contract about surfacing retrieved KB results.

## 6. Fix-shape options (not a plan; options to consider)

Listed without recommendation so the next session can weigh them cold:

1. **Deterministic orchestrator enforcement.** If `search_recipes` returned non-empty during the loop, auto-populate `AgentResult.recipes` regardless of the terminal message's shape. Don't trust the LLM's narrative choice for user-visible recipe surfacing.
2. **Prompt hardening.** Upgrade Rule 11 from advisory to hard constraint ("You MUST present the first N recipes from `search_recipes` results as the primary response when screen=home"). Cheaper; less reliable.
3. **Tool-choice forcing.** Use `tool_choice` to constrain the post-`search_recipes` response shape.
4. **Contract change on `max_results`.** Make it required, or clamp server-side from party_size (requires threading party_size to the tool).
5. **Accumulation fix for orchestrator.py:280-281.** Append or preserve-on-empty; avoid the replace-wipes-prior-results landmine.

Any comprehensive fix likely combines (1) + (5) at minimum. (2) alone has already been tried in spirit with Rule 11 and proven insufficient.

## 7. Files referenced

- [`evals/phase2/scripts/consistency_runner.py`](../../evals/phase2/scripts/consistency_runner.py) — investigation tool, correct; no bug
- [`src/ai/orchestrator.py:280`](../../src/ai/orchestrator.py) — recipe_results replaced not appended
- [`src/ai/tools/search_recipes.py:67-74`](../../src/ai/tools/search_recipes.py) — correct filtering + server-side cap
- [`src/ai/prompt.py:81`](../../src/ai/prompt.py) — Rule 11 (advisory, not being followed reliably)
- [`src/ai/sse.py:51-53`](../../src/ai/sse.py) — emits `recipe_card` only when `result.recipes` is populated
- [`contracts/tool_schemas.py:51`](../../contracts/tool_schemas.py) — `max_results` field definition

## 8. Related issues / PRs

- **#87** — parent bug (this document)
- **#99** — closed 2026-04-16: same pattern, different symptom (clarify-turn history serialization)
- **#105** — current PR branch, contains contract + prompt + runner commits. Not yet opened. **Should not ship as-is** — the probe in §1 proves it does not fix the user-visible bug.
