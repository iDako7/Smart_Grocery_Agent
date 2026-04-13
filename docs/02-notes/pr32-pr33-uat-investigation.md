# PR #32 / PR #33 UAT Investigation

- **Date:** 2026-04-12
- **Branch:** main
- **Summary:** Consolidated root-cause reports for the PR #32/#33 UAT bugs (mock data leakage, backend grill hallucination, test/process failures) and deep investigation into why the TDD/E2E agents missed them.

# UAT Bug Investigation — Root Cause Report

Four parallel investigations complete. Consolidated findings below, organized by your two framings: **(1) mock data leakage** and **(2) test/process failure**, plus the backend grill hallucination as a third distinct root cause.

---

## 1. Mock data was not cleaned thoroughly — confirmed

`ScenarioProvider` still wraps the whole app (`App.tsx:34`) with no env guard. Every non-Saved screen still reads `useScenario()` directly, and the prior PR #32 commit `fb5919d` (idle-fallback) was reverted but the underlying leaks were never fixed.

| File:line | Expression | Fires when | Severity |
|---|---|---|---|
| `ClarifyScreen.tsx:56` | `screenData?.explanation \|\| scenarioDeckText` | empty string falls through (wrong op: `\|\|` not `??`) | HIGH |
| `ClarifyScreen.tsx:55` | `screenData?.pcsv ?? scenarioPcsv` | no `pcsv_update` event yet | HIGH |
| `RecipesScreen.tsx:62` | `return scenario.recipes` | session recipes empty | **CRITICAL** (Korean BBQ leak) |
| `RecipesScreen.tsx:65` | `scenario.recipesHeader` unconditional | **always** — no real-data equivalent | **CRITICAL** (eyebrow/description always mock) |
| `RecipesScreen.tsx:67–78` | `scenario.swapAlternatives` unconditional | always — no real-data equivalent | **CRITICAL** (swap pool always mock) |
| `GroceryScreen.tsx:34` | `scenario.groceryHeader` unconditional | always | MEDIUM |
| `GroceryScreen.tsx:19–33` | fallback to `scenario.groceryItems` | no `grocery_list` event | MEDIUM |
| `App.tsx:34–36` | `ScenarioProvider` wraps prod | all envs | **CRITICAL** (structural) |

**Saved screens are clean** — they fetch from real endpoints, no scenario imports. The leak is entirely in the Home→Clarify→Recipes→Grocery pipeline.

---

## 2. Remaining UAT bugs — by file:line

**ClarifyScreen (`src/frontend/src/screens/ClarifyScreen.tsx`)**
- `:58–60` — `selectedSetup` default `["Outdoor grill"]` biases every first-turn message. Was flagged in #32 commit message; never removed.
- `:56` — `||` on string field, empty `explanation` falls through to scenario
- `:179–181` — `{deckText}` rendered in plain `<p>`; no markdown parser imported anywhere in the project. Raw `**text**` is expected behavior of the current code.
- `:237–289` — "quick questions" chip UI rendered unconditionally; no loading/streaming-gated skeleton. `thinkingMessage` only shows if backend sends one, which it often doesn't before first `pcsv_update`.
- `:119–137` — header has no EN·中 toggle (that toggle only exists on Recipes/Grocery). Design gap.

**RecipesScreen**
- `:56–63` — the scenario fallback (above). Was supposed to be fixed in `fb5919d`; reverted and not re-applied.
- `src/frontend/src/components/swap-panel.tsx:27–54` — SwapPanel never receives `lang` prop (RecipesScreen passes only `name`, `nameCjk`, `description` at :350–354). Translation toggle on swap cards never worked. Pre-existing, not introduced by #32/#33.

**GroceryScreen (`:38` vs `:19–33`)**
- `checked` Set is local React state only. No backend PATCH. No filter logic connecting the buy-pill to the displayed list. Pre-existing — the backend sync was never in scope.

**SavedGroceryListScreen (`:58–109`)** — **introduced by PR #33**
- `handleToggle`, `handleRemove`, `handleAddCostco`, `handleAddMarket` all mutate local state only. `api-client.ts` has no PATCH/PUT for saved lists. Edits are lost on reload. The UI suggests persistence; the wiring doesn't exist.

---

## 3. Backend grill hallucination — LLM freeform, primed by two nudges

**Verdict:** not a template or cached context. Pure LLM freeform, nudged by:

1. `_RULES` in `src/ai/prompt.py:62–74` — rule #2 "always search the recipe knowledge base first" pushes the LLM to call `search_recipes` speculatively on turn 1, before constraints are confirmed.
2. `contracts/tool_schemas.py` `search_recipes.cooking_method.description` — literally says `"Filter by method (e.g., grill, stir-fry, bake)"`. This is the **only place "grill" appears in the prompt**. Combined with user input "BBQ", the LLM infers `cooking_method: "grill"`, gets empty results, and synthesizes "No exact grill recipe matched" into the `response_text` → SSE `explanation` event → `ClarifyScreen:180`.

**Fix surface is the prompt, not code.** Either remove "grill" from the tool-schema example, or add a rule that forbids `search_recipes` calls before the user confirms cooking setup. (Not fixing now — just identifying.)

---

## 4. Why three agents missed all of this

**Integration plan says** (§127–156): "5 journeys walked in browser with **real backend responses**." **Reality:** no automated step enforces this. The test agent shipped tests that pass without ever running a real SSE stream.

**Four structural test gaps:**

| Gap | Evidence | Consequence |
|---|---|---|
| **(a) Mocks return empty arrays** | `flow-integration.test.tsx:40` `postGroceryList: mockResolvedValue([])`; same for `listSaved*`, `getSaved*` | The exact empty-state path that triggers scenario fallback is the path the tests run. Tests pass *because* of the bug. |
| **(b) Tests assert navigation, not content** | `flow-integration.test.tsx:165–189` — clicks through 4 screens, asserts only `getByTestId("screen-*")`. Never asserts recipe names, header text, or absence of scenario data. | Mock leakage is invisible to tests. |
| **(c) No loading-state assertions** | No test ever waits for `screenState === "loading"`. No spinner/skeleton element is queried anywhere. | ClarifyScreen no-loading-state bug cannot be detected. |
| **(d) No scenario↔real-data contract test** | `RecipesScreen:56–63` fallback has no test that says "when session fills, scenario disappears". | The whole leak class is structurally untestable with current mocks. |

**Issue prompt template** (`docs/01-plans/issue-prompt-template.md`) points implementers at `workflow-guide.md`, which says "unit tests only for pure logic — previous implementation had too many unit tests that missed wiring issues" — but then **does not actually require** empty-state, loading-state, or fallback assertions. It warns against the wrong tests without prescribing the right ones.

**Per-agent failure:**
- **Impl agent**: wrote navigation-only tests; shipped unguarded fallbacks. Root cause: followed the template literally — the template doesn't demand empty/loading/contrast tests.
- **Test/review agent**: `code-reviewer` checked code style + logic, never "does this test cover the empty-data path?" Approved structurally insufficient tests.
- **Orchestrator**: `/verify` green (build/types/lint/unit). No E2E gate for real SSE + network delay. Workflow guide says "one happy path E2E per Phase B issue" but that was bypassed (E2E CI currently disabled per the merge decision).

**Bottom line:** the process is not designed to catch integration bugs that require rendered-UI inspection against *realistic* empty/streaming states. Fixing the bugs without fixing the template/process means the next PR will reproduce the same class of failures.

---

## Patterns that tie everything together

Two meta-causes explain all 9 UAT bugs:

1. **Scenario fallback was treated as a UX cushion instead of a dev-only preview.** Every leak is a `scenario.*` reference that should have been gated behind `scenarioMode && !hasRealSession`, or simply removed now that real endpoints exist.
2. **Tests rehearsed the happy frame, not the screen.** Assertions check that you *arrived* at a screen, not what you *see* there. A user can't tell the difference between "navigated correctly" and "navigated correctly and the screen is real" — but the test suite couldn't.

The grill hallucination and the SavedList non-persistence are independent from the mock leak but both fall under cause #2: no test asserted the *content* of the clarify response or the *persistence* of a saved-list edit.

---

# TDD/E2E Agent Failure — Deep Investigation

All three hypotheses investigated. **H2 is the dominant cause, amplified by H3, enabled by H1.** You were right.

---

## H1 — Skill descriptions: PARTIALLY at fault

`.claude/agents/tdd-guide.md:50-58` lists "Edge Cases You MUST Test":
> 1. Null/Undefined input
> 2. **Empty arrays/strings**
> 3. Invalid types
> 4. Boundary values
> 5. **Error paths (network failures, DB errors)**
> 6. Race conditions
> 7. Large data
> 8. Special characters

It says "empty arrays" — a **data-structure** concept. It does **not** say "empty UI states," "loading skeletons," "streaming lifecycle," or "fallback branches." A TDD agent reading this is thinking about `foo([])`, not "what does the screen render while `screenData.recipes` is still `null` during an SSE stream."

`.claude/agents/e2e-runner.md` says "critical user journeys" — doesn't mandate skeleton/loading assertions.

`docs/01-plans/workflow-guide.md:72` says: *"too many unit tests that passed individually but missed wiring issues"* — warns against the wrong tests without prescribing the right ones. No row in its Testing Rules table for "state-machine transitions."

**This alone doesn't explain the miss** — even with better wording, the agent could have written a test asserting "empty session → falls back to scenario" and it would pass (the fallback works), with the agent reporting coverage complete.

---

## H2 — Pre-existing mock tests created a "coverage trap": CONFIRMED, dominant cause

Your hypothesis is exactly right. Concrete evidence:

**1. `src/frontend/src/test/screens.test.tsx` (commit `16de424`, Stage 2 — long before #32/#33):**
- Line 16: `import { ScenarioProvider } from "@/context/scenario-context"`
- Line 73–82: `renderWithRouter()` wraps every screen in `ScenarioProvider` (defaults to `bbq` scenario)
- **No `SessionProvider`** — tests render ClarifyScreen, RecipesScreen, GroceryScreen entirely against scenario mock data
- Tests pass green because they render the scenario fallback path — the exact path that is the bug

When the B2/B3 TDD agent ran `/verify` and saw `screens.test.tsx` green, it saw:
```
✓ RecipesScreen renders recipes
✓ GroceryScreen renders items
✓ ClarifyScreen renders pcsv
```
All three screens "tested" and "rendering." The agent had no reason to write a second `RecipesScreen renders` test.

**2. What #32 actually added — `build-grocery-list.integration.test.tsx:30-60`:**
```tsx
<ScenarioProvider>
  <SessionProvider>   // no chatService → useSessionOptional returns null
    <Routes>...</Routes>
  </SessionProvider>
</ScenarioProvider>
```
Tests navigation only. The SessionProvider has no chat service, so `session.screenData` stays null, so `RecipesScreen:56-63` **takes the scenario fallback branch** — and the test still passes. The very bug is exercised by the test, and the test is green because of it.

**3. What #33 actually added — `save-list-integration.test.tsx`:**
```tsx
useSessionOptional: vi.fn(() => ({
  screenData: { recipes: [], groceryList: [], pcsv: null, explanation: null },
  screenState: "idle",
  ...
}))
```
- Hard-codes `screenState: "idle"` — **LOADING and STREAMING states are never rendered in any test, ever**
- Empty arrays → fallback branch taken → test passes while bug hides

**The coverage trap in action:**
1. Stage 2 tests were written against scenario data because scenario data was all that existed
2. They rendered green forever
3. When the TDD agent for B2/B3 inspected coverage, screens were "already tested"
4. Agent focused narrowly on *the new wiring* (save button, grocery API) and wrote tests that still defaulted session data to empty/idle
5. Empty/idle is precisely the state that triggers scenario fallback, so every new test also reinforced the trap

The tests didn't just miss the bug — **they depended on the bug to pass**. Fixing the fallback would have turned the tests red.

---

## H3 — Issue requirements were scope-limited: CONFIRMED

`docs/01-plans/phase-2-integration-plan.md`:
- B2 (Issue #21, line 120): *"Toggle pills on recipe cards, tap Build Shopping List, see real grouped list"*
- B3 (Issue #22, line 122): *"Save plan, sidebar shows it, tap, loads real data"*

Neither says *"and remove the scenario fallback"* or *"verify the screen renders empty state, not scenario data, when the session is empty."* The tickets treat the work as **feature wiring**, not **data-path correctness**. The TDD agent implemented what the ticket asked for — exactly.

The PR #32 audit comment (iDako7/Smart_Grocery_Agent#32 comment 4232962300) is the moment this was discovered; but that discovery post-dates the shipped tests, so the TDD/test agents never saw it as a requirement.

---

## Combined verdict

> **The failure is not one agent being lazy. It's a compound failure where H3 shrank the scope, H2 made the pre-existing mock tests look like valid coverage, and H1 gave the agent no mental model to detect the trap.**

Any of the three alone would have been survivable:
- If tickets had said "remove scenario fallback" (fix H3), the agent would have done it.
- If Stage 2 tests hadn't rendered scenario data (fix H2), the TDD agent would have seen coverage as genuinely missing and written real tests.
- If the skill had said "when you see a fallback branch, write a test that forces each branch" (fix H1), the agent would have spotted the pattern at `RecipesScreen:56-63` and written both branches.

H2 is the most powerful because it's the **silent** one — it doesn't look like a failure, it looks like "this area is already tested, move on." The agent following TDD discipline honestly would not have re-done work it thought was covered.

---

## Where to intervene (prioritized)

1. **Highest leverage — kill the coverage trap (H2).** The Stage 2 `screens.test.tsx` and its scenario-only render helper is the actual source of the false-coverage signal. Either (a) delete scenario-rendered tests once real-data paths exist, (b) rename them to `*.scenario-preview.test.tsx` so no agent mistakes them for feature coverage, or (c) make `ScenarioProvider` opt-in so the Stage 2 tests stop rendering without an explicit flag. Do this before any other fix and the TDD agent on the next issue will immediately see the gap.

2. **Tighten `tdd-guide.md` with a "fallback branch rule" (H1).** Add something like: *"If a component contains a fallback/default branch (`?? scenario`, `|| default`, `if (!data) return MOCK`), you MUST write one test per branch: one that hits the real path and one that hits the fallback path, and you must assert they render different content."* This gives the agent a concrete detection rule that would have caught `RecipesScreen:56-63`.

3. **Add a "state-machine test row" to `workflow-guide.md` Testing Rules (H1).** Require that any screen with a `screenState` union is tested in each state — at minimum `idle`, `loading`, `streaming`, `complete`, `error`.

4. **Issue template clause (H3).** Add to `issue-prompt-template.md`: *"If this issue wires a screen to a real backend endpoint, the acceptance criteria implicitly include: (a) the scenario/mock fallback for that screen is removed or gated, (b) tests render the screen with real-data-shape data, not empty/null."*

5. **Tiny addition to `e2e-runner.md`.** Require that Phase B E2E tests assert **on content**, not just `getByTestId("screen-*")`. One assertion per screen checking a field that came from the real API.

You don't need all five to fix the recurrence. (1) + (2) alone would have caught every UAT bug in this batch.
