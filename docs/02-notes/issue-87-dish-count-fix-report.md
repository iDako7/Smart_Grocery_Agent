# Issue #87 — Dish count inconsistency: fix report

**Date:** 2026-04-16
**Branch:** `fix/87-dish-count`
**Companion:** [`issue-87-dish-count-root-cause.md`](./issue-87-dish-count-root-cause.md) (investigation log, written before the fix)
**Status:** Fix complete, verified with real LLM tokens. Not yet committed.

> Keep this alongside the root-cause doc — together they show the full arc:
> investigation → first-pass diagnosis (partially wrong) → iterative fix →
> verification. The diagnosis doc's §6 options list is useful context but
> its §3 "narrative-vs-presentation" framing turned out to be a symptom, not
> the cause.

---

## 1. What the diagnosis got wrong

The root-cause doc (written from SSE evidence alone) concluded:

> "…the agent absorbed the PCSV gap signal and chose to *talk about* the gap
> instead of *presenting KB options* to fill it."

This framed the bug as a **model narrative choice** — the agent *could* have
presented recipes but chose not to. Fixes (1) and (5) in §6 followed from
that frame: enforce recipe surfacing regardless of narrative, accumulate
results across calls.

Real cause, discovered in Phase C by instrumenting `search_recipes` calls:

> The model calls `search_recipes` with **over-restrictive filters**
> (`effort_level="quick"` when the user said "dinner for two"; `cuisine="BBQ"`
> when the user said "BBQ dinner" but the KB has no `BBQ` cuisine row), so
> the tool returns zero rows. The agent's "can't find" narration is an
> honest report of an empty tool result, not a choice.

The narrative-vs-presentation frame is consistent with the SSE (you see
`thinking: Running search_recipes…` then an `explanation` event with no
`recipe_card` events), which is why it survived review. But it missed the
KB search layer. The instrumentation probe that made this visible is
§3 below.

**Lesson:** when diagnosing an agent bug, log tool *inputs and outputs*, not
just the SSE event sequence. SSE is downstream of tool dispatch; tool
inputs reveal how the model is interpreting the prompt.

---

## 2. Baseline (before any fix)

Ran `consistency_runner.py --runs 5 --no-gate` against backend with the
3 pre-fix commits (`afdea38` + `fc04690` + `841eed2`) already applied.

| Case | Input | Party | Expected | Runs | Mean | Stddev |
|------|-------|-------|----------|------|------|--------|
| A1 | chicken + broccoli dinner | 2 | 2–3 | [0, 0, 0, 0, 0] | 0 | 0 |
| A2 | beef + egg + rice dinner | 4 | 3–4 | [7, 7, 7, 7, 7] | 7 | 0 |
| A3 | salmon + asparagus dinner | 1 | 1–2 | [0, 0, 0, 0, 0] | 0 | 0 |
| A4 | chicken + rice + veg BBQ dinner | 8 | 4–5 | [0, 0, 0, 0, 0] | 0 | 0 |

Three of four cases return zero dishes (user-facing: empty recipe panel).
A2 is the odd one out — it returns 7 recipes instead of the ladder-expected
3–4. Stddev=0 across all cases at temp=0.3 (Sonnet 4.6 is deterministic at
this setting — pre-commit reviewer's variance concern is empirically wrong).

---

## 3. The instrumentation probe that found the real cause

After iteration 1 (§4.1) landed and A2 improved but A1/A3/A4 still returned
0, I added temporary `print()` lines to `orchestrator._dispatch_tool`:

```python
elif name == "search_recipes":
    print(f"[DEBUG-87] search_recipes input: {parsed.model_dump()}")
    result = await search_recipes(kb, parsed)
    print(f"[DEBUG-87] search_recipes returned "
          f"{len(result) if isinstance(result, list) else 'not-a-list'} recipes")
```

(These prints were removed before final commit. Keeping the snippet here
so future debugging sessions know the pattern.)

One manual A1 request produced:

```
[DEBUG-87] search_recipes input: {'ingredients': ['chicken', 'broccoli'],
    'cuisine': '', 'cooking_method': '', 'effort_level': 'quick',
    'flavor_tags': [], 'serves': 2, 'include_alternatives': False,
    'max_results': 3}
[DEBUG-87] search_recipes returned 0 recipes
```

Then a direct KB probe confirmed the filter was the problem:

```
ingredients=['chicken', 'broccoli']          -> 3 recipes  (no filters)
-- but in KB, effort_level distribution is:
  ('long', 36) ('medium', 74) ('quick', 10)
-- and all chicken+broccoli matches have effort_level='medium':
  ('Chicken and Ginger Stir Fry', 'medium')
  ('Higher Protein Chicken Lo Mein', 'medium')
  ('Chicken Pad See Ew', 'medium')
  ('One Pot Italian Sausage & Broccoli Pasta', 'medium')
```

A3 and A4 showed the same pattern:

| Case | Model's filters | KB hit? |
|------|----------------|---------|
| A1 | `effort_level="quick"` | 0 (all matches are `medium`) |
| A3 | `effort_level="quick"` | 0 |
| A4 try 1 | `cuisine="BBQ", cooking_method="grill", effort_level="medium", flavor_tags=["smoky","savory"]` | 0 (no `BBQ` cuisine in KB) |
| A4 try 2 | `cooking_method="bake", effort_level="medium", flavor_tags=["savory"]` | 0 |

A4 is the most damning case — the agent retries with different filters
(showing the accumulation fix from iter 1 is being exercised) but still
hits zero both times because neither `grill` nor `bake` combined with
`medium` effort matches chicken+rice+mixed-veg.

**Root cause in one sentence:** the model guesses filter fields from
user-prompt context ("dinner for two" → `effort_level="quick"`, "BBQ" →
`cuisine="BBQ"`); those guesses don't match KB rows; `search_recipes`
returns empty; the agent honestly reports "can't find" and the user sees
an empty panel.

---

## 4. The fix, in two iterations

### 4.1 Iteration 1 — accumulator + presentation rule (partial)

**Hypothesis at the time:** the root-cause doc's (1)+(5) combo — enforce
recipe surfacing + preserve recipes on empty follow-up searches.

**Files changed:**

#### `src/ai/orchestrator.py`

Extracted a named helper for combining search results across calls, then
wired it into the dispatch:

```python
def accumulate_recipe_results(
    existing: list[RecipeSummary],
    new_raw: list,
) -> list[RecipeSummary]:
    """Merge a fresh search_recipes tool result into the accumulator.

    Issue #87 invariant: if any search_recipes call during the loop returns
    non-empty, recipe_results must carry those recipes to the terminal
    AgentResult. A later zero-result call (e.g., model retries with tighter
    filters) must NOT wipe prior valid results.

    Policy:
    - new_raw empty → preserve existing (the landmine fix).
    - new_raw non-empty → replace with new_raw (newest narrowing reflects
      model intent; union-with-dedup would risk duplicate cards).
    """
    if not new_raw:
        return existing
    return [
        RecipeSummary.model_validate(r) if isinstance(r, dict) else r
        for r in new_raw
    ]
```

Dispatch site (was a naked list-comp assignment):

```python
# before
elif tc.function.name == "search_recipes" and isinstance(result_dict, list):
    recipe_results = [
        RecipeSummary.model_validate(r) if isinstance(r, dict) else r
        for r in result_dict
    ]

# after
elif tc.function.name == "search_recipes" and isinstance(result_dict, list):
    recipe_results = accumulate_recipe_results(recipe_results, result_dict)
```

#### `src/ai/prompt.py` — Rule 11 rewrite

Before: advisory ("Pass the chosen count as `max_results`").
After: two-part hard contract.

```markdown
11. **Present retrieved recipes; scale count to party size.** Two hard contracts:

    **(a) Presentation contract.** When you are on the **Home** screen and
    `search_recipes` returns non-empty results, you MUST present those recipes
    as the primary response. If `analyze_pcsv` reports gaps (e.g., carb or sauce),
    ALSO explain the gap — but do NOT replace recipe presentation with
    gap-narration. The user sees an empty recipe panel if you describe the gap
    without presenting KB options; that is a failure. Retrieved recipes always
    surface; gap commentary is supplementary context alongside them.

    **(b) Count contract.** You MUST pass `max_results` on every `search_recipes`
    call, scaled to party size via this ladder: 1 person → 1-2, 2-3 people → 2-3,
    4-6 people → 3-4, 7+ people → 4-5. Default to household size from the User
    Profile if the user doesn't specify a party size. Omitting `max_results` or
    passing a value outside the ladder is a rule violation.
```

#### `src/ai/sse.py` — comment only

```python
# Recipe cards. Issue #87 invariant: result.recipes is populated upstream
# in orchestrator.run_agent() whenever search_recipes returned non-empty
# during the loop — don't add belt-and-suspenders logic here.
for recipe in result.recipes:
    ...
```

**Iteration 1 verification** (5 runs each, real LLM tokens):

| Case | Baseline | After iter 1 | Delta |
|------|----------|--------------|-------|
| A1 | 0 | **0** | no change — filter bug, not accumulator bug |
| A2 | 7 | **3.6 (mean)** | fixed by count contract (max_results now passed per ladder) |
| A3 | 0 | **0** | no change |
| A4 | 0 | **0** | no change |

A2 fixed — confirms the count-contract half of Rule 11 works. But A1/A3/A4
unchanged, because their failure mode is "search_recipes returns empty
from the first call," which the accumulator (preserve-on-empty) cannot
rescue. The accumulator fix is still valuable — it prevents a regression
pattern — but it wasn't the A1/A3/A4 fix.

**This is where the instrumentation probe in §3 happened.**

### 4.2 Iteration 2 — filter relaxation fallback (the actual fix)

**Hypothesis:** tools should gracefully degrade when LLM-supplied filters
eliminate all matches. A silent zero is worse than an unfiltered fallback.

**Files changed:**

#### `src/ai/tools/search_recipes.py`

Added filter-relaxation fallback right after `primaries` computation:

```python
results.sort(key=lambda r: r[0], reverse=True)
limit = input.max_results or 10
primaries = [r[1] for r in results[:limit]]

# Issue #87: filter relaxation fallback. If restrictive filters
# (cuisine / cooking_method / effort_level) produced an empty result,
# retry once without them. The model sometimes guesses these fields
# from user context (e.g., "dinner for two" → effort_level="quick");
# returning nothing lets the agent narrate "can't find" instead of
# surfacing KB recipes the user actually has ingredients for.
if not primaries and (input.cuisine or input.cooking_method or input.effort_level):
    relaxed = input.model_copy(
        update={"cuisine": "", "cooking_method": "", "effort_level": None}
    )
    return await search_recipes(db, relaxed)

if input.include_alternatives and primaries:
    ...
```

Recursive call terminates safely: `relaxed` has no restrictive filters, so
it can't recurse again. If the unfiltered search also returns empty (user's
ingredients genuinely aren't in KB), we return `[]` honestly.

#### `src/ai/prompt.py` — tool usage addendum

Added to the `search_recipes` bullet in `_TOOL_INSTRUCTIONS`:

```markdown
2. **`search_recipes`** — Call AFTER pcsv analysis to find recipes that match.
   Pass `include_alternatives: true` for meal-plan requests so users can swap
   in place; omit for lookup-style queries. Pass `max_results` (integer 1-20)
   to scope the recipe count to party size per Rule 11 — e.g., `max_results: 3`
   for a 2-3 person household. **DO NOT pass `cuisine`, `cooking_method`, or
   `effort_level` filters unless the user EXPLICITLY requested that attribute**
   (e.g., "Italian", "grilled", "quick weeknight meal"). These fields filter
   the KB strictly; guessing them from context (e.g., inferring
   `effort_level="quick"` from "dinner for two") frequently returns zero
   matches and hides valid recipes from the user. When in doubt, omit filters
   and let ingredient matching do the work.
```

This is belt-and-suspenders with the server-side relaxation — the relaxation
is the real enforcement; the prompt rule reduces the load on the fallback
path.

**Iteration 2 verification** (5 runs each, real LLM tokens):

| Case | Expected | Runs (iter 2) | Mean | Stddev | In range? |
|------|----------|---------------|------|--------|-----------|
| A1 | 2–3 | [3, 3, 3, 3, 3] | 3.0 | 0.0 | ✅ |
| A2 | 3–4 | [4, 3, 4, 3, 3] | 3.4 | 0.5 | ✅ |
| A3 | 1–2 | [1, 2, 2, 2, 2] | 1.8 | 0.4 | ✅ |
| A4 | 4–5 | [4, 4, 4, 4, 4] | 4.0 | 0.0 | ✅ |

All four dish counts are now within their ladder-expected ranges. A1 raw
SSE emits 3 `recipe_card` events (baseline was 0).

**On the stddev>0 surprise:** baseline showed stddev=0 on every case
because "all zero" is trivially deterministic. With real working output,
temp=0.3 still produces small within-range variance on A2 and A3 (the
model picks 3 or 4 recipes across runs). This is not a user-facing bug
and not what the Phase C acceptance criteria were really trying to
protect — the acceptance criteria were written assuming "stddev=0 at
baseline is stable," but baseline stability was a side-effect of the
bug, not a property to preserve.

---

## 5. All tests added or modified

### 5.1 New file — `tests/test_orchestrator_issue_87.py`

Seven tests, split between pure unit tests on the accumulator and
integration tests against the real orchestrator loop with mocked LLM.

#### Accumulator unit tests

```python
def test_accumulate_preserves_existing_when_new_is_empty():
    """Landmine fix: a later zero-result search MUST NOT wipe prior recipes."""
    existing = [_recipe("r1"), _recipe("r2")]
    result = accumulate_recipe_results(existing, [])
    assert [r.id for r in result] == ["r1", "r2"]


def test_accumulate_replaces_when_new_is_non_empty():
    """Non-empty new result replaces existing (newest narrowing wins)."""
    existing = [_recipe("r1")]
    new_raw = [_recipe_dict("r2"), _recipe_dict("r3")]
    result = accumulate_recipe_results(existing, new_raw)
    assert [r.id for r in result] == ["r2", "r3"]


def test_accumulate_validates_raw_dicts_to_recipe_summary():
    """Raw dicts from tool output coerce into RecipeSummary."""
    result = accumulate_recipe_results([], [_recipe_dict("r1", name="Soup")])
    assert len(result) == 1
    assert isinstance(result[0], RecipeSummary)
    assert result[0].id == "r1"
    assert result[0].name == "Soup"


def test_accumulate_preserves_when_both_empty():
    """Empty existing + empty new stays empty (no crash)."""
    assert accumulate_recipe_results([], []) == []
```

#### Orchestration integration tests

```python
async def test_recipes_surface_even_when_terminal_narrative_omits_them(kb, seeded_user, db):
    """H2 regression: when search_recipes returns non-empty but the model's
    terminal text narrates a PCSV gap instead of presenting recipes,
    AgentResult.recipes MUST still carry the retrieved recipes."""
    # Mock LLM: tool call → narrative-only response (no mention of recipes)
    # Assert: result.recipes is populated regardless of the narrative text.
    ...


async def test_recipes_preserved_when_second_search_returns_empty(kb, seeded_user, db):
    """Two search_recipes calls — first returns recipes, second returns empty.
    AgentResult.recipes must retain the first call's results."""
    ...


async def test_recipes_replaced_when_second_search_returns_non_empty(kb, seeded_user, db):
    """Two successful searches: newest narrowing wins. Accumulator uses
    replace-on-non-empty semantics to avoid duplicate cards."""
    ...
```

All three integration tests use `_make_response` / `_make_tool_call` shaped
to match the existing `tests/test_orchestrator.py` mock style and run
through the real tool handlers against the real SQLite KB (only the LLM
is mocked).

### 5.2 `tests/test_tool_search_recipes.py` — 5 new, 2 modified

#### New tests for filter relaxation

```python
async def test_filter_relaxation_when_effort_level_yields_empty(kb):
    """If the effort_level filter eliminates all matches, fall back to
    unfiltered ingredient search rather than returning empty.

    Regression scenario: model passes effort_level='quick' for chicken+broccoli
    (all KB matches are 'medium'), previously returning 0 → user sees empty panel.
    """
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "broccoli"],
            effort_level="quick",
            max_results=3,
        ),
    )
    assert len(result) > 0


async def test_filter_relaxation_when_cuisine_yields_empty(kb):
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice", "mixed vegetables"],
            cuisine="BBQ",
            max_results=3,
        ),
    )
    assert len(result) > 0


async def test_filter_relaxation_when_combined_filters_yield_empty(kb):
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["chicken", "rice"],
            cuisine="BBQ",
            cooking_method="grill",
            effort_level="quick",
            max_results=3,
        ),
    )
    assert len(result) > 0


async def test_no_fallback_when_ingredients_unmatched(kb):
    """Relaxation only fires for filter-emptied results. Ingredients that
    don't exist in the KB at all still return empty — don't invent recipes."""
    result = await search_recipes(
        kb,
        SearchRecipesInput(
            ingredients=["xyznonexistent_ingredient_qwerty"],
            effort_level="quick",
        ),
    )
    assert result == []


async def test_no_fallback_when_filters_absent(kb):
    result = await search_recipes(
        kb, SearchRecipesInput(ingredients=["xyznonexistent_qwerty"])
    )
    assert result == []
```

#### Modified tests

Two pre-existing tests asserted strict filter behavior on combos where
filter relaxation would now kick in (chicken+Korean, chicken+quick — both
of which return 0 in the KB). Replaced the ingredient half of each combo
with one that yields non-empty results, so the assertion continues to
verify the positive case:

```python
# before:
result = await search_recipes(kb, SearchRecipesInput(
    ingredients=["chicken"], cuisine="Korean"))
for r in result:
    assert r.cuisine.lower() == "korean"

# after:
# Use ingredients+cuisine combo that yields non-empty. Filter relaxation
# (issue #87) falls back to unfiltered when the combo yields zero — covered
# by test_filter_relaxation_when_cuisine_yields_empty.
result = await search_recipes(kb, SearchRecipesInput(
    ingredients=["rice"], cuisine="Korean"))
assert len(result) > 0
for r in result:
    assert r.cuisine.lower() == "korean"
```

Same shape change for `test_effort_level_filter` (chicken+quick → rice+quick).

### 5.3 `tests/test_prompt.py` — assertion update

The old Rule 11 string ("Dish count proportional to party size.",
"1-2 dishes", "4-5 dishes") no longer appears in the prompt — Rule 11 is
now "Present retrieved recipes; scale count to party size." with different
literal phrasing. Updated the assertion to match the new contract:

```python
def test_prompt_contains_dish_count_rule():
    """Rule 11 must include the presentation contract + party-size → max_results ladder."""
    prompt = build_system_prompt(UserProfile())
    # Presentation contract (issue #87 fix)
    assert "Presentation contract" in prompt
    assert "MUST present" in prompt
    # Count contract + ladder
    assert "max_results" in prompt
    assert "1 person → 1-2" in prompt
    assert "7+ people → 4-5" in prompt
```

### 5.4 Test suite result

316 tests pass. (2 pre-existing failures in `tests/test_api_auth.py` are
JWT key-length warnings flipping to errors — unrelated to this change,
confirmed via `git stash` + rerun on the parent commit.)

---

## 6. What I'd do differently next time

1. **Instrument tool I/O before forming a diagnosis.** The root-cause doc
   ran for ~2 hours on SSE evidence alone and reached a plausible-but-wrong
   conclusion. A 30-second `print()` at the tool dispatch would have pointed
   straight at the filter over-restriction. SSE is a downstream view; it
   shows *what came out*, not *what went in*.

2. **Treat "stddev=0 at baseline" as suspicious, not reassuring.** The
   reviewer's concern about temp=0.3 variance was empirically wrong on the
   broken system — but the determinism came from the *bug*, not from the
   model. Once the system works end-to-end, small natural variance returns
   and the original strict gate is infeasible.

3. **Iterative fixing works.** The user's framing ("fix first, then verify,
   then decide whether to improve — iterative") was right. Trying to solve
   everything in one shot would have built on the wrong diagnosis; the
   iter 1 verify step is what surfaced that the diagnosis was incomplete.

4. **Graceful degradation at the tool layer beats prompt enforcement.**
   Rule 11's "MUST pass max_results per ladder" fixed A2 reliably because
   the server-side cap enforced it. The new "DO NOT pass filters unless
   explicit" prompt rule is belt-and-suspenders; the real enforcement is
   the search_recipes fallback. If I had to pick one, I'd pick the server
   fallback every time — it doesn't depend on model compliance.

---

## 7. Files referenced

- [`src/ai/orchestrator.py`](../../src/ai/orchestrator.py) — `accumulate_recipe_results` helper (iter 1)
- [`src/ai/tools/search_recipes.py`](../../src/ai/tools/search_recipes.py) — filter-relaxation fallback (iter 2, the actual fix)
- [`src/ai/prompt.py`](../../src/ai/prompt.py) — Rule 11 rewrite + tool-instruction addendum
- [`src/ai/sse.py`](../../src/ai/sse.py) — invariant comment (iter 1)
- [`tests/test_orchestrator_issue_87.py`](../../tests/test_orchestrator_issue_87.py) — 7 regression tests (new file, iter 1)
- [`tests/test_tool_search_recipes.py`](../../tests/test_tool_search_recipes.py) — 5 new + 2 updated (iter 2)
- [`tests/test_prompt.py`](../../tests/test_prompt.py) — assertion updated
- [`evals/phase2/scripts/consistency_runner.py`](../../evals/phase2/scripts/consistency_runner.py) — Phase C verification tool (unchanged)
- [`evals/phase2/test_cases.yaml`](../../evals/phase2/test_cases.yaml) — A1–A4 cases (unchanged)
- [`docs/02-notes/issue-87-dish-count-root-cause.md`](./issue-87-dish-count-root-cause.md) — initial diagnosis (superseded by §1 above for the framing, but the evidence tables and hypothesis enumeration remain useful)
