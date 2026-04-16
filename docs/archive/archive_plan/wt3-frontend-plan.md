# WT3 Frontend — Implementation Plan

**Date:** 2026-04-08 | **Status:** Complete (merged to main 2026-04-11) | **Owner:** Dako (@iDako7)

---

## Overview

This plan covers the frontend worktree (WT3) of Phase 2. Four stages, each producing a reviewable artifact before proceeding. Stage 4 (real AI layer connection) is **out of scope** — it happens in Phase 2.2 after WT2 merges.

**Parent plan:** `docs/01-plans/phase-2-implementation-plan.md`

---

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Stage 1 output format | Single multi-screen HTML file with tab switching | Side-by-side consistency review; matches wireframe pattern |
| Recipes screen in Stage 1 | Copy from `soft-bento-preview.html`, correct if needed | Already at full fidelity; no need to regenerate |
| New component design | Design in Soft Bento style during Stage 1 | Design system doc is the authority; extend it consistently |
| Static HTML reuse | Visual specification only; Stage 2 is a clean React rewrite | HTML → React gap too large; tokens and visual patterns carry forward, markup doesn't |
| Stage 1 interactivity | Minimal JS (tab switching, checkbox, sidebar, expand/collapse) | Needed for review; treated as throwaway |
| shadcn/ui approach | Use primitives (Button, Sheet, Dialog, Input), override heavily with Soft Bento tokens | Structural reuse without fighting the design system |
| Tailwind color strategy | CSS variables mapped through Tailwind config (`bg-cream` backed by `var(--cream)`) | Clean utilities + single source of truth; matches shadcn pattern |
| Screen transitions | React Router for routes + per-screen state machine for data loading | Two navigation patterns (sequential flow vs. sidebar) need different mechanisms |
| Mock data scenarios | 2 scenarios (BBQ weekend + a second TBD) | Covers enough variety without over-investing |
| Stage 4 | Out of scope for WT3 | Happens in Phase 2.2 after WT2 merges |

---

## Stage 1 — Static HTML

**Goal:** All 7 screens rendered in Soft Bento style. One HTML file, tab-switchable. Visual review only.

**Input:**
- `docs/00-specs/soft-bento-preview.html` — design system (tokens, typography, components, bilingual rules)
- `docs/00-specs/wireframe-v2.html` — structure and interaction source of truth
- `docs/00-specs/product-spec-v2.md` — feature catalog §2, user journeys §3, acceptance criteria §4

**Output:** `src/frontend/static-preview.html` — single file, 7 screens, tab navigation.

### Screens

| # | Screen | Source structure | New components to design |
|---|---|---|---|
| 1 | Home | Wireframe S0 | Quick-start chip, sidebar menu |
| 2 | Clarify | Wireframe S1 | PCV category row (ok/warn/gap status icon + label + items) |
| 3 | Recipes | Copy from `soft-bento-preview.html` §6 render | None (already designed) |
| 4 | Grocery | Wireframe S3 | Checklist row, store section header |
| 5 | Saved Meal Plan | Wireframe S4 | Expandable recipe row, recipe detail block (JetBrains Mono) |
| 6 | Saved Recipe | Wireframe S5 | Editable recipe card (view/edit toggle) |
| 7 | Saved Grocery List | Wireframe S6 | (Reuses checklist row + store section header from Grocery) |

### Design rules (from Soft Bento §07)

- Copy the `:root` CSS variable block exactly (colors + font stacks + radius scale)
- Use component class names from the design system as-is
- New components follow Soft Bento principles: cream/paper surfaces, rounded bento blocks, semantic color discipline (jade = have, persimmon = buy, shoyu = commit)
- Bilingual: CJK on dish/recipe names only, not on functional UI (buttons, labels, hints)
- No new fonts, no new colors, no serifs
- JetBrains Mono only for terse cooking-instruction blocks (Saved Plan detail, Saved Recipe)

### Minimal JS (review convenience, not production code)

- Tab switching between 7 screens
- Sidebar open/close (Home screen)
- Checkbox toggling (Grocery, Saved Grocery List)
- Expand/collapse recipe detail (Saved Meal Plan)
- Edit/view toggle (Saved Recipe)

### Review criteria

- Every screen feels like it belongs to the Recipes screen's family
- Tokens are consistent (no custom colors, no new fonts)
- Bilingual rules followed (CJK on dish names, not on buttons)
- Layout matches wireframe structure, visual quality matches Soft Bento render

---

## Stage 2 — React + TypeScript Components

**Goal:** All 7 screens as typed React components with mock data props. No backend, no state machine.

**Input:**
- Validated Stage 1 HTML (visual specification)
- `contracts/sse_events.py` → TypeScript types
- `contracts/api_types.py` → TypeScript types
- `contracts/tool_schemas.py` → TypeScript types

**What carries forward from Stage 1:**
- Design tokens → `tailwind.config.ts` custom theme + CSS variables in `index.css`
- Visual patterns and component structure → React component hierarchy
- Layout, spacing, typography decisions → Tailwind utility classes

**What gets rewritten:**
- Repeated HTML markup → `.map()` over typed data arrays
- Inline event handlers → React state/handlers
- Flat CSS classes → Tailwind utilities + CSS variables

### Tailwind config

```ts
// Colors mapped through CSS variables (single source of truth)
colors: {
  cream:     { DEFAULT: 'var(--cream)', deep: 'var(--cream-deep)' },
  paper:     'var(--paper)',
  tofu:      'var(--tofu)',
  ink:       { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
  jade:      { DEFAULT: 'var(--jade)', soft: 'var(--jade-soft)' },
  persimmon: { DEFAULT: 'var(--persimmon)', soft: 'var(--persimmon-soft)' },
  apricot:   'var(--apricot)',
  shoyu:     'var(--shoyu)',
}

// Font families
fontFamily: {
  sans: ['DM Sans', '-apple-system', 'sans-serif'],
  cjk:  ['Noto Sans SC', 'DM Sans', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
}

// Border radius
borderRadius: {
  lg:   'var(--r-lg)',   // 24px — bento cards
  md:   'var(--r-md)',   // 16px — buttons, alt cards
  sm:   'var(--r-sm)',   // 10px — inner accents
  pill: '99px',          // tags, chips, pills
}
```

### TypeScript types

Translate Python Pydantic models from `contracts/` into TypeScript interfaces. These live in `src/frontend/src/types/`:

| Source (Python) | Target (TypeScript) | Key types |
|---|---|---|
| `tool_schemas.py` | `tools.ts` | `PCSVResult`, `RecipeSummary`, `RecipeDetail`, `Ingredient`, `PCSVStatus`, `EffortLevel` |
| `sse_events.py` | `sse.ts` | `ThinkingEvent`, `PcsvUpdateEvent`, `RecipeCardEvent`, `ExplanationEvent`, `GroceryListEvent`, `ErrorEvent`, `DoneEvent`, `SSEEvent`, `GroceryStore`, `GroceryItem` |
| `api_types.py` | `api.ts` | `ChatRequest`, `SessionStateResponse`, `SavedMealPlan`, `SavedRecipe`, `SavedGroceryList`, `Screen` |

### Component tree

```
App
├── Router (React Router)
│   ├── / → HomeScreen
│   ├── /clarify → ClarifyScreen
│   ├── /recipes → RecipesScreen
│   ├── /grocery → GroceryScreen
│   ├── /saved/plan/:id → SavedMealPlanScreen
│   ├── /saved/recipe/:id → SavedRecipeScreen
│   └── /saved/list/:id → SavedGroceryListScreen
├── Sidebar (overlay, accessed from Home hamburger)
│   ├── SidebarSection ("Meal plans")
│   ├── SidebarSection ("Saved recipes")
│   └── SidebarSection ("Grocery lists")
├── ChatInput (shared: Clarify, Recipes, SavedMealPlan, SavedRecipe)
└── InfoSheet (bottom sheet: bilingual name + flavor tags + description)
```

### shadcn/ui usage

| shadcn primitive | Used for | Override level |
|---|---|---|
| Button | Action buttons (Save plan, Build list), swap pill | Heavy (Soft Bento colors, radius, typography) |
| Sheet | Sidebar, InfoSheet bottom sheet | Moderate (cream background, custom widths) |
| Input | Chat input, text fields | Heavy (Soft Bento border, radius, font) |
| Checkbox | Grocery checklist items | Heavy (jade checkmark styling) |

### Mock data

Two scenario files in `src/frontend/src/mocks/`:

- `bbq-weekend.ts` — BBQ for 8 (matches wireframe/design reference exactly)
- `weeknight-chicken.ts` — leftover chicken wings scenario (from product spec Story 2)

Each file exports typed mock data matching the contract types: `PCSVResult`, `RecipeSummary[]`, `GroceryStore[]`, `SavedMealPlan`, `SavedRecipe`, `SavedGroceryList`.

### Review criteria

- Components render identically to Stage 1 HTML
- All props are typed (no `any`)
- Mock data matches contract types
- shadcn/ui primitives used where appropriate, overridden to match Soft Bento
- Scenario switching works (can toggle between BBQ weekend and weeknight chicken)

---

## Stage 3 — State Machine + Mock SSE

**Goal:** Full interactive flow with state machine and simulated SSE streaming. Validates navigation, loading states, and data flow.

**Input:**
- Stage 2 React components
- `docs/00-specs/architecture-spec-v2.md` §11 (state machine)
- `contracts/sse_events.py` (event types — must be frozen before this stage)

### Routing

React Router handles two navigation patterns:

1. **Core flow** (sequential): `/` → `/clarify` → `/recipes` → `/grocery`
2. **Saved content** (sidebar jump): Sidebar → `/saved/plan/:id`, `/saved/recipe/:id`, `/saved/list/:id`

### Per-screen state machine

Each screen that loads data from the AI layer uses the same state pattern:

```
IDLE → LOADING → STREAMING → COMPLETE
                    ↓
                  ERROR (with retry)
```

Implemented as `useReducer` in a shared hook (`useScreenState`):

```ts
type ScreenState = 'idle' | 'loading' | 'streaming' | 'complete' | 'error';

type ScreenAction =
  | { type: 'start_loading' }
  | { type: 'start_streaming' }
  | { type: 'receive_event'; event: SSEEvent }
  | { type: 'complete'; status: 'complete' | 'partial' }
  | { type: 'error'; message: string }
  | { type: 'reset' };
```

### Session state (Context)

A `SessionContext` accumulates SSE events into typed state slots:

```ts
type SessionData = {
  screenState: ScreenState;
  pcsv: PCSVResult | null;
  recipes: RecipeSummary[];
  groceryList: GroceryStore[];
  explanation: string;
  thinkingMessage: string;
  error: string | null;
};
```

Components render whatever state exists — no "wait for all data" gate.

### Mock SSE service

A `MockSSEService` in `src/frontend/src/mocks/mock-sse.ts` that:

1. Accepts a user message and current screen
2. Returns a sequence of typed SSE events with realistic delays
3. Emits `thinking` → typed events → `done` (matching the collect-then-emit flow from architecture spec §8)
4. Supports both scenarios (BBQ weekend, weeknight chicken)

Delays simulate real streaming:
- `thinking` events: 500ms apart
- Typed events (pcsv_update, recipe_card): 200ms apart
- `done`: 100ms after last event

### Screen behaviors

| Screen | On enter | During streaming | On complete |
|---|---|---|---|
| Home | IDLE. User types message or taps quick-start chip | N/A (no streaming) | Navigate to `/clarify` |
| Clarify | LOADING → mock SSE → STREAMING (thinking messages) → COMPLETE | Show thinking status, then PCV indicators populate | Show full PCV analysis + clarify chips + "Looks good" button |
| Recipes | LOADING → mock SSE → STREAMING → COMPLETE | Thinking status, then recipe cards appear one by one | Full meal plan with swap interaction |
| Grocery | COMPLETE (instant, derived from recipes) | N/A | Checklist rendered |
| Saved screens | COMPLETE (loaded from mock saved data) | N/A | Full CRUD interactions |

### Swap interaction (Recipes screen)

1. User taps "try another" on a dish card → card enters swapping state (dashed border, pulsing dot)
2. Chat input pre-fills with contextual message
3. User sends (or edits and sends) → LOADING → mock SSE returns 1-2 alternative recipe cards
4. Alternatives panel appears below the swapping card
5. User picks an alternative or keeps original → card updates, alternatives panel closes

### Review criteria

- Full click-through: Home → type message → Clarify → confirm → Recipes → build list → Grocery
- Loading states visible (thinking messages during LOADING/STREAMING)
- Swap flow works end-to-end on Recipes screen
- Sidebar navigation to all 3 saved content screens works
- Browser back/forward works naturally
- Both mock scenarios produce correct data
- Error state renders (simulate by adding an error scenario)
- Partial completion renders (show what's available + retry prompt)

---

## Sync Points & Dependencies

| Dependency | Required for | Status |
|---|---|---|
| `contracts/tool_schemas.py` (frozen) | Stage 2 TypeScript types | Frozen |
| `contracts/sse_events.py` (frozen) | Stage 3 state machine | Unfrozen — freezes when WT2 has `/chat` returning real events |
| `contracts/api_types.py` (frozen) | Stage 3 routing + saved content types | Unfrozen — freezes when WT2 has all endpoints scaffolded |

**Stage 1 and Stage 2 can proceed now.** `tool_schemas.py` is already frozen, which is sufficient for TypeScript types.

**Stage 3 requires frozen SSE contract.** If `sse_events.py` changes after Stage 3 starts, the mock SSE service and state machine need updating. Mitigation: start Stage 3 only after confirming with WT2 that SSE event types are stable.

---

## File Structure (projected)

```
src/frontend/
├── static-preview.html          ← Stage 1 output (review artifact, not shipped)
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts           ← Soft Bento tokens mapped
├── components.json              ← shadcn/ui config
├── src/
│   ├── main.tsx
│   ├── App.tsx                  ← Router setup
│   ├── index.css                ← CSS variables (:root), font imports
│   ├── types/
│   │   ├── tools.ts             ← from contracts/tool_schemas.py
│   │   ├── sse.ts               ← from contracts/sse_events.py
│   │   └── api.ts               ← from contracts/api_types.py
│   ├── mocks/
│   │   ├── bbq-weekend.ts
│   │   ├── weeknight-chicken.ts
│   │   └── mock-sse.ts          ← Stage 3: simulated SSE service
│   ├── hooks/
│   │   └── use-screen-state.ts  ← Stage 3: shared state machine hook
│   ├── context/
│   │   └── session-context.tsx  ← Stage 3: accumulated SSE state
│   ├── components/
│   │   ├── ui/                  ← shadcn/ui primitives (already scaffolded)
│   │   ├── chat-input.tsx
│   │   ├── info-sheet.tsx
│   │   ├── sidebar.tsx
│   │   ├── pcv-category-row.tsx
│   │   ├── recipe-card.tsx
│   │   ├── checklist-row.tsx
│   │   ├── store-section.tsx
│   │   ├── expandable-recipe.tsx
│   │   ├── quick-start-chip.tsx
│   │   └── swap-panel.tsx
│   ├── screens/
│   │   ├── home.tsx
│   │   ├── clarify.tsx
│   │   ├── recipes.tsx
│   │   ├── grocery.tsx
│   │   ├── saved-meal-plan.tsx
│   │   ├── saved-recipe.tsx
│   │   └── saved-grocery-list.tsx
│   └── lib/
│       └── utils.ts             ← already exists (shadcn cn utility)
```

---

## References

- **Design system:** `docs/00-specs/soft-bento-preview.html`
- **Wireframe:** `docs/00-specs/wireframe-v2.html`
- **Product spec:** `docs/00-specs/product-spec-v2.md` (v3 — feature catalog, journeys, acceptance criteria)
- **Architecture spec:** `docs/00-specs/architecture-spec-v2.md` (§8 SSE, §11 Frontend)
- **Phase 2 plan:** `docs/01-plans/phase-2-implementation-plan.md`
- **Contracts:** `contracts/tool_schemas.py`, `contracts/sse_events.py`, `contracts/api_types.py`
