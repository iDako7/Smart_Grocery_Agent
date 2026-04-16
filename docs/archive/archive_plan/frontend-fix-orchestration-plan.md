# Frontend Fix: TDD Orchestration Plan

**Date:** 2026-04-10 | **Status:** Complete (merged to main 2026-04-11) | **Branch:** `fix/frontend-uat-bugs` (off `main`)

> **How to use:** You are the senior engineer orchestrator. For each TDD call below, invoke the `/tdd` agent with the prompt details specified. After each verification gate, run the listed commands. Call `/code-review` only at the marked checkpoint. The full diagnostic is in `evals/UAT_result/stage3_review.md`.

---

## Summary

- **7 TDD calls** across 3 phases (Phase 1 has 2 parallel pairs)
- **1 code review** checkpoint
- **3 verification gates** + 1 final gate
- Dependency chain: `[TDD 1 + TDD 3 parallel] -> [TDD 2 + TDD 4 parallel] -> GATE 1 -> TDD 5 -> TDD 6 -> GATE 2 -> [REVIEW] -> TDD 7 -> FINAL GATE`

---

## Pre-flight

```bash
git checkout -b fix/frontend-uat-bugs main
cd src/frontend && bun test          # all existing 13 test files must pass
```

---

## Bug Root Cause Summary

**Bug 1 — ClarifyScreen toggle logic** (`src/frontend/src/screens/ClarifyScreen.tsx:64-74`)
The `toggleOption` function is a naive add/remove toggle. Clicking "All of the above" just adds that string to the array — it never selects the individual options. Clicking an individual option never deselects "All of the above". Same issue with "None" in dietary: selecting "Halal" does not remove "None", and selecting "None" does not clear other selections.

**Bug 2 — RecipesScreen swap cycling** (`src/frontend/src/screens/RecipesScreen.tsx:57,67-76,189-195`)
`SWAP_ALTERNATIVES` is a static reference to scenario data (line 57). `onPick` just calls `setSwappingIndex(null)` (line 192) — it closes the panel but never replaces the recipe in the RECIPES array or rotates the alternatives. The picked alternative does not swap into the selected slot.

**Bug 3 — Non-functional buttons**
- "Save plan" (`RecipesScreen.tsx:208-212`): `<button>` with no `onClick`.
- "EN/中" (`RecipesScreen.tsx:96-100`): a `<span>`, not a `<button>`, no click handler, no language context.
- "Save list" (`GroceryScreen.tsx:136-141`): `<button>` with no `onClick`.

---

## Phase 1: Toggle Logic + Swap Cycling (parallel)

### TDD 1 — RED: Clarify toggle tests

**Create:** `src/frontend/src/test/clarify-toggle.test.tsx`

**Prompt for /tdd agent:**

> Write FAILING tests (RED phase) in `src/frontend/src/test/clarify-toggle.test.tsx` for the ClarifyScreen chip toggle logic. Use the existing test patterns from `src/frontend/src/test/test-utils.tsx` (`renderWithSession`, `createMockChatService`). Import `ClarifyScreen` from `@/screens/ClarifyScreen`.
>
> **Setup context:** ClarifyScreen has two chip groups:
> - Cooking setup: "Outdoor grill", "Oven", "Stovetop", "All of the above" — "Outdoor grill" is pre-selected by default.
> - Dietary restrictions: "None", "Halal", "Vegetarian", "Vegan", "Gluten-free" — "None" is pre-selected by default.
>
> **Tests to write:**
>
> 1. Click "All of the above" → verify "Outdoor grill", "Oven", "Stovetop" all show selected styling (`bg-shoyu` class). "All of the above" itself also shows selected.
> 2. Click "All of the above", then click "Oven" to deselect it → verify "All of the above" also deselects. "Outdoor grill" and "Stovetop" remain selected.
> 3. Click "Oven" then "Stovetop" (so all three individual options are selected) → verify "All of the above" auto-selects.
> 4. Click "Halal" → verify "None" deselects (loses `bg-shoyu`, gains `bg-cream-deep`).
> 5. Click "Halal", click "Vegetarian", then click "None" → verify "Halal" and "Vegetarian" deselect, "None" is selected.
> 6. Click "Looks good, show recipes" → verify the message sent via `chatService` includes resolved option names (e.g. "Outdoor grill") not the literal string "All of the above".
>
> Use `userEvent` from `@testing-library/user-event` for interactions. Check selected state via CSS class names (`bg-shoyu` = selected, `bg-cream-deep` = deselected). All tests should FAIL against the current implementation.

**Done when:** File exists, `bun test clarify-toggle.test.tsx` runs, all tests FAIL (RED).

---

### TDD 3 — RED: Swap cycling tests (parallel with TDD 1)

**Create:** `src/frontend/src/test/recipe-swap.test.tsx`

**Prompt for /tdd agent:**

> Write FAILING tests (RED phase) in `src/frontend/src/test/recipe-swap.test.tsx` for the RecipesScreen swap cycling behavior. Use test patterns from `src/frontend/src/test/test-utils.tsx` (`renderWithSession`). Import `RecipesScreen` from `@/screens/RecipesScreen`.
>
> **Setup context:** RecipesScreen renders recipe cards from scenario data. Each card has a "Try another" button (in a dropdown menu — the test setup in `src/frontend/src/test/setup.tsx` mocks `@base-ui/react/menu` to render inline). When "Try another" is clicked, a `SwapPanel` appears with alternative recipes and a "or keep the original" link.
>
> The BBQ scenario has 3 recipe cards (Korean BBQ Pork Belly at index 0, Grilled Corn Elote at index 1, Classic Smash Burgers at index 2) and 2 swap alternatives (Asian Slaw, Spicy Cucumber Salad). The scenario data is in `src/frontend/src/mocks/bbq-weekend.ts`.
>
> **Tests to write:**
>
> 1. Click "Try another" on recipe 0 → SwapPanel opens → click "Pick Asian Slaw" (button with `aria-label="Pick Asian Slaw"`) → verify recipe 0 slot now shows "Asian Slaw" text, and "Korean BBQ Pork Belly" is no longer in slot 0.
> 2. After picking Asian Slaw into slot 0 (from test 1 setup): click "Try another" on slot 0 again → verify the alternatives list includes "Korean BBQ Pork Belly" (the displaced original) and does NOT include "Asian Slaw" (the current occupant).
> 3. Click "Try another" on recipe 0 → click "or keep the original" → verify recipe 0 still shows original name, panel closes.
> 4. Click "Try another" on recipe 0 → pick alternative → click "Try another" on recipe 1 → pick alternative → verify both slots updated independently (slot 0 and slot 1 each show their new recipe).
> 5. After a swap on recipe 0, verify recipe 1 and recipe 2 are unchanged.
>
> Use `userEvent` for interactions. Use `screen.getByText` / `screen.queryByText` to verify card content. All tests should FAIL against the current implementation.

**Done when:** File exists, `bun test recipe-swap.test.tsx` runs, all tests FAIL (RED).

---

### TDD 2 — GREEN: Fix toggle logic (after TDD 1)

**Prompt for /tdd agent:**

> Make all tests in `src/frontend/src/test/clarify-toggle.test.tsx` pass (GREEN phase).
>
> **What to change:** `src/frontend/src/screens/ClarifyScreen.tsx`, specifically the `toggleOption` function (lines 64-74).
>
> **Fix approach:** Replace the single `toggleOption` function with two dedicated handlers:
>
> ```
> toggleSetup(option: string):
>   if option === "All of the above":
>     if currently selected: deselect all
>     else: select all individual options + "All of the above"
>   else:
>     toggle the individual option
>     if all individual options now selected: auto-select "All of the above"
>     if any individual option deselected: remove "All of the above"
>
> toggleDiet(option: string):
>   if option === "None":
>     clear all others, select only "None"
>   else:
>     remove "None" from selection
>     toggle the individual option
>     if nothing selected after toggle: re-select "None"
> ```
>
> Also update the "Looks good" button handler: when sending the message, resolve "All of the above" to the actual option names before including in the message.
>
> Do not change any other files. Do not modify existing tests.

**Done when:** `bun test clarify-toggle.test.tsx` — all pass.

---

### TDD 4 — GREEN: Fix swap logic (after TDD 3)

**Prompt for /tdd agent:**

> Make all tests in `src/frontend/src/test/recipe-swap.test.tsx` pass (GREEN phase).
>
> **What to change:** `src/frontend/src/screens/RecipesScreen.tsx`
>
> **Fix approach:**
>
> 1. Add state to track recipe assignments and alternatives pool:
>    ```ts
>    const [displayedRecipes, setDisplayedRecipes] = useState<RecipeCardData[]>(RECIPES);
>    const [altPool, setAltPool] = useState<RecipeCardData[]>(SWAP_ALTERNATIVES);
>    ```
>
> 2. Replace the static `RECIPES.map(...)` render with `displayedRecipes.map(...)`.
>
> 3. Update `SwapPanel`'s `onPick` to accept the picked alternative's index:
>    ```
>    onPick(altIndex):
>      displaced = displayedRecipes[swappingIndex]
>      displayedRecipes[swappingIndex] = altPool[altIndex]
>      altPool = altPool.filter(_, i => i !== altIndex).concat(displaced)
>      setSwappingIndex(null)
>    ```
>
> 4. Pass `altPool` (not static `SWAP_ALTERNATIVES`) to `SwapPanel.alternatives`.
>
> 5. You will likely also need to update `src/frontend/src/components/SwapPanel.tsx` — the `onPick` callback currently takes no arguments. Change it to `onPick(index: number)` and wire the pick buttons to pass their index.
>
> Do not change any other files. Do not modify existing tests (except `stage3-integration.test.tsx` test #18 "SwapPanel onPick closes panel" if its assertions conflict — update it to match the new `onPick(index)` signature).

**Done when:** `bun test recipe-swap.test.tsx` — all pass. Also run `bun test stage3-integration.test.tsx` to check no regressions.

---

### Verification Gate 1

```bash
cd src/frontend
bun test src/test/clarify-toggle.test.tsx src/test/recipe-swap.test.tsx
bun test   # full suite — verify no regressions
```

---

## Phase 2: Button Wiring (sequential)

### TDD 5 — RED: Button behavior tests

**Create:** `src/frontend/src/test/button-actions.test.tsx`

**Prompt for /tdd agent:**

> Write FAILING tests (RED phase) in `src/frontend/src/test/button-actions.test.tsx` for three non-functional buttons. Use test patterns from `src/frontend/src/test/test-utils.tsx`.
>
> **Tests to write:**
>
> **"Save plan" button (RecipesScreen):**
> 1. `screen.getByRole("button", { name: /save plan/i })` exists and is a `<button>` element.
> 2. Click "Save plan" → verify `console.info` was called with a message containing "save" (spy on `console.info`).
> 3. After click, verify button shows visual feedback: text changes to "Saved!" or button gets a `data-saved="true"` attribute briefly.
>
> **"Save list" button (GroceryScreen):**
> 4. `screen.getByRole("button", { name: /save list/i })` exists.
> 5. Click "Save list" → verify `console.info` was called.
>
> **"EN/中" toggle (RecipesScreen):**
> 6. The EN/中 element is a `<button>` (not a `<span>`). Find it via `screen.getByRole("button", { name: /language/i })` or similar accessible label.
> 7. Click the toggle → verify "中" becomes bold (`font-bold` or `<b>` tag) and "EN" becomes normal weight.
> 8. Click again → verify "EN" becomes bold, "中" becomes normal.
>
> All tests should FAIL against the current implementation.

**Done when:** File exists, `bun test button-actions.test.tsx` runs, all tests FAIL (RED).

---

### TDD 6 — GREEN: Wire button stubs

**Prompt for /tdd agent:**

> Make all tests in `src/frontend/src/test/button-actions.test.tsx` pass (GREEN phase).
>
> **What to change:**
>
> **RecipesScreen.tsx (lines 208-212, 96-100):**
> - "Save plan" button: add `onClick={() => { console.info("[Stage 4 TODO] Save plan"); }}`. Add brief visual feedback (e.g., temporary text change or `aria-pressed`). Keep it minimal.
> - "EN/中" toggle: convert the `<span>` at lines 96-100 to a `<button>` with `aria-label="Toggle language"`. Add local state `const [lang, setLang] = useState<"en" | "zh">("en")`. Toggle bold between EN and 中 based on state. No actual translation needed.
>
> **GroceryScreen.tsx (lines 136-141):**
> - "Save list" button: add `onClick={() => { console.info("[Stage 4 TODO] Save list"); }}`.
>
> Do not change any other files. Do not modify existing tests.

**Done when:** `bun test button-actions.test.tsx` — all pass.

---

### Verification Gate 2

```bash
cd src/frontend
bun test src/test/button-actions.test.tsx
bun test   # full suite
```

---

## Code Review Checkpoint

**Invoke `/code-review` agent.**

**Focus areas:**
1. Toggle logic edge cases — can the user end up with zero cooking setup options? (Should be allowed — it's a preference, not a constraint.)
2. Swap state — does `altPool` reset correctly when switching scenarios? Does it leak state?
3. Button stubs — are they clearly marked as Stage 4 TODO?
4. `SwapPanel.onPick` signature change — does it break any other consumers?
5. No regressions: `bun test` must show 0 failures across all test files.

**Gate:** Full test suite green before proceeding.

```bash
cd src/frontend && bun test
```

---

## Phase 3: Multi-Step Flow Integration Tests

### TDD 7 — Write integration flow tests

**Create:** `src/frontend/src/test/flow-integration.test.tsx`

**Prompt for /tdd agent:**

> Write integration tests in `src/frontend/src/test/flow-integration.test.tsx` that verify multi-step user flows. These tests should PASS (they validate fixes from Phases 1-2). Use `renderWithSession` from test-utils and `MemoryRouter` + `Routes` for navigation.
>
> **Helper needed:** Create a `renderFullApp` function that renders all routes:
> ```tsx
> function renderFullApp(options?: { chatService?: ChatServiceHandler }) {
>   return render(
>     <ScenarioProvider>
>       <SessionProvider chatService={options?.chatService}>
>         <MemoryRouter initialEntries={["/"]}>
>           <Routes>
>             <Route path="/" element={<HomeScreen />} />
>             <Route path="/clarify" element={<ClarifyScreen />} />
>             <Route path="/recipes" element={<RecipesScreen />} />
>             <Route path="/grocery" element={<GroceryScreen />} />
>           </Routes>
>         </MemoryRouter>
>       </SessionProvider>
>     </ScenarioProvider>
>   );
> }
> ```
>
> **Tests to write:**
>
> **Flow 1 — Clarify chip resolution:**
> Render ClarifyScreen → click "All of the above" → verify all setup chips selected → click "Oven" to deselect → verify "All of the above" deselects → click "Halal" → verify "None" deselects → click "Looks good, show recipes" → verify `chatService` was called with message containing "Outdoor grill", "Stovetop" (not "All of the above") and "Halal" (not "None").
>
> **Flow 2 — Recipe swap then build list:**
> Render with Routes (Recipes + Grocery routes) → click "Try another" on recipe 0 → pick alternative → verify slot 0 updated → click "Build list" → verify `screen.getByTestId("screen-grocery")` is present.
>
> **Flow 3 — Double swap independence:**
> Render RecipesScreen → swap recipe 0 (pick first alternative) → swap recipe 1 (pick from remaining alternatives) → verify slot 0 and slot 1 each show their new recipe names, and slot 2 is unchanged.
>
> **Flow 4 — Full navigation Home → Clarify → Recipes → Grocery:**
> Render full app → type "BBQ for 8" in home input → press Enter → verify `screen.getByTestId("screen-clarify")` → click "Looks good, show recipes" → verify `screen.getByTestId("screen-recipes")` → click "Build list" → verify `screen.getByTestId("screen-grocery")`.
>
> **Also:** Fix test #10 in `src/frontend/src/test/stage3-integration.test.tsx` (the `RecipesScreen — "Build list" navigates to /grocery` test around line 443). Replace the `expect(container).toBeDefined()` assertion with a proper test using Routes:
> ```tsx
> // Render with both routes
> render(
>   <ScenarioProvider>
>     <SessionProvider>
>       <MemoryRouter initialEntries={["/recipes"]}>
>         <Routes>
>           <Route path="/recipes" element={<RecipesScreen />} />
>           <Route path="/grocery" element={<GroceryScreen />} />
>         </Routes>
>       </MemoryRouter>
>     </SessionProvider>
>   </ScenarioProvider>
> );
> await user.click(screen.getByText(/Build list/i));
> expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
> ```

**Done when:** All tests pass. `bun test flow-integration.test.tsx` green. Fixed test #10 passes.

---

### Verification Gate 3 (Final)

```bash
cd src/frontend && bun test
```

All tests pass — existing 13 files + 4 new files (`clarify-toggle`, `recipe-swap`, `button-actions`, `flow-integration`). 0 failures.

---

## New Files Created

| File | Purpose |
|------|---------|
| `src/frontend/src/test/clarify-toggle.test.tsx` | Toggle mutual exclusion tests |
| `src/frontend/src/test/recipe-swap.test.tsx` | Swap cycling tests |
| `src/frontend/src/test/button-actions.test.tsx` | Button functionality tests |
| `src/frontend/src/test/flow-integration.test.tsx` | Multi-step user flow tests |

## Files Modified

| File | Change |
|------|--------|
| `src/frontend/src/screens/ClarifyScreen.tsx` | Replace `toggleOption` with `toggleSetup` + `toggleDiet` |
| `src/frontend/src/screens/RecipesScreen.tsx` | Stateful swap logic + Save plan onClick + EN/中 button |
| `src/frontend/src/screens/GroceryScreen.tsx` | Save list onClick |
| `src/frontend/src/components/SwapPanel.tsx` | `onPick(index)` signature |
| `src/frontend/src/test/stage3-integration.test.tsx` | Fix test #10 fake assertion |

## Key References

| File | Role |
|------|------|
| `evals/UAT_result/stage3_review.md` | Bug descriptions + screenshots |
| `docs/00-specs/product-spec-v2.md` §2-§4 | Feature catalog, journeys, acceptance criteria |
| `src/frontend/src/test/test-utils.tsx` | Shared test helpers |
| `src/frontend/src/mocks/bbq-weekend.ts` | Scenario data used in tests |
| `docs/01-plans/wt2-orchestration-plan.md` | Backend plan pattern (reference) |
