# SGA V2 — Product Specification

**Last updated:** 2026-04-10
**Status:** Approved v3
**Owner:** Dako (@iDako7)

---

## 1. Product Overview

### Vision

A thinking partner that helps you cook delicious food more easily — by making smarter grocery decisions. Balances three constraints: delicious (grounded in real recipes), low effort (structural reasoning so you don't have to), low cost (Costco bulk + community market fresh produce).

**Who it's for:** Two user groups in Vancouver — immigrants exploring Western grocery items (bilingual EN/ZH support), and local Canadians exploring Asian, Mexican, Indian, and other cultural foods.

**Why existing solutions fail:** General-purpose AI improvises without structural reasoning. Recipe apps start from "pick a recipe" instead of "what do I have." Meal planners produce rigid weekly plans that break on first contact with reality.

**Scope:** The full arc from idea → assess what you have → decide what to buy → shop → cook. Leftovers and remaining ingredients loop back as starting context for the next session.

### Interaction Model

Each screen has a **canvas** (structured UI: cards, charts, checklists) and a **chat input**. Chat messages are instructions to the agent that update the canvas — not a conversation thread. The user types "I also have kimchi" → the ingredient list updates. Questions get answered inline.

Navigation is always sequential: Home → Clarify → Recipes → Grocery. Steps become thin, never skipped. The agent controls how much content each screen shows based on input confidence.

### Core Principles

- **PCV gap analysis as reasoning backbone** — Protein/Carb/Veggie structural check before creative suggestions. Sauce tracked internally, surfaced only in grocery list.
- **Real recipes over generation** — ~80% KB-grounded, ~20% LLM-generated (flagged as "AI-suggested").
- **Structure first, then inspire** — check completeness before creativity.
- **Tolerate vague input** — make reasonable assumptions, ask clarifying questions only for genuine ambiguities.
- **Grounded in real shopping** — real Costco product sizes, community market availability, store departments.
- **Suggest, don't dictate** — every suggestion dismissable, every recipe optional.

---

## 2. Feature Catalog

| ID | Screen | Feature | Definition |
|:---|:-------|:--------|:-----------|
| H1 | Home | Freeform Input | Natural language text entry |
| H2 | Home | Quick-Start Chips | Pre-built session templates |
| C1 | Clarify | Situation Summary | One-line context interpretation |
| C2 | Clarify | PCV Ingredient Display | Ingredients grouped by P/C/V with status |
| C3 | Clarify | Clarify Questions | High-impact questions via tappable chips |
| C4 | Clarify | Chat Corrections | Add/correct ingredients via chat |
| R1 | Recipes | Recipe Curation | 3-5 coherent meal cards |
| R2 | Recipes | Recipe Swap | Replace one card via chat |
| R3 | Recipes | Recipe Info | Bilingual detail bottom sheet |
| R4 | Recipes | Browse All Recipes | Searchable KB recipe list |
| R5 | Recipes | Save Meal Plan | Persist current recipe set |
| R6 | Recipes | Build Grocery List | Extract buy items → Grocery |
| G1 | Grocery | Grocery Checklist | Store-grouped list with attribution |
| G2 | Grocery | Check Off | Mark items as purchased |
| G3 | Grocery | Save Grocery List | Persist checklist to sidebar |
| S1 | Saved | Sidebar Navigation | Browse saved content by type |
| S2 | Saved | Saved Meal Plan | Expandable recipe list with instructions |
| S3 | Saved | Saved Recipe | Standalone terse cooking card |
| S4 | Saved | Saved Grocery List | Persistent checklist with manual editing |
| S5 | Saved | Remove Recipe | Delete recipe from meal plan |
| S6 | Saved | In-Place Edit | Edit recipe text directly |
| S7 | Saved | Agent Refinement | Chat modifies saved content |
| S8 | Saved | Copy to Notes | Export grocery list as plain text |
| A1 | System | Cross-Session Memory | Structured user profile across sessions |
| A2 | System | Dietary Enforcement | Hard constraints on all suggestions |
| A3 | System | Bilingual Output | EN + ZH for names and instructions |

### Home
> **Navigation:** Submit input → Clarify
> **Constraint:** No chat input on this screen

#### H1: Freeform Input
User types any intent or ingredient list ("BBQ for 8" or "I have leftover chicken wings"); system accepts freeform text and begins a session.

#### H2: Quick-Start Chips
User taps a chip (e.g., "Weekend BBQ", "Weeknight meals", "Use my leftovers"); input auto-populates and jumps to Clarify. Doubles as onboarding — users learn what the app does by tapping one.

### Clarify
> **Navigation:** "Looks good, show recipes" → Recipes
> **Constraint:** Clarify Questions section absent if no genuine ambiguities exist

#### C1: Situation Summary
User sees a one-line interpretation of their intent (e.g., "BBQ for 8 · outdoor grill · this Saturday").

#### C2: PCV Ingredient Display
User sees ingredients in a single merged view grouped by Protein/Carb/Veggie, each category with a status indicator: ✓ good, ⚠ low, ✗ gap. Example: `[✗] Veggie — almost none — need fresh options`. Sauce is tracked internally but not shown in this analysis.

#### C3: Clarify Questions
Agent presents only high-impact questions where the answer would genuinely change suggestions. Displayed as tappable chips for quick answers.

#### C4: Chat Corrections
User types corrections or additions ("I also have kimchi, forgot to mention") → ingredient list and PCV indicators update.

### Recipes
> **Navigation:** "Save plan" → Saved Meal Plan | "Build shopping list" → Grocery
> **Constraint:** Cards form a coherent set — varied sauces, cooking methods, PCV coverage

#### R1: Recipe Curation
User sees 3-5 recipe cards: name, one-line description with effort level, key flavor tags, "have" pills (ingredients on hand, green) and "buy" pills (gap items, orange). Info button on each card.

#### R2: Recipe Swap
User taps swap on a card → chat pre-fills with contextual message (e.g., "Suggest a different dish for meal 2 (congee)") → card highlights. Three paths: (1) send as-is → 1-2 alternatives inline, (2) edit for specificity ("something quicker") → targeted alternatives, (3) ignore swap and type freely ("make it all Mexican") → agent regenerates all cards.

#### R3: Recipe Info
User taps info button → bottom sheet shows bilingual name (EN + ZH), flavor tags as pills, 2-line taste description.

#### R4: Browse All Recipes
Below the curated cards, a searchable/filterable recipe list from the KB. Secondary to the curated set.

#### R5: Save Meal Plan
User taps "Save plan" → current recipe set stored as a meal plan, accessible from sidebar.

#### R6: Build Grocery List
User taps "Build shopping list" → system extracts "buy" items from all recipe cards, cross-references store data, generates store-grouped list → navigates to Grocery screen.

### Grocery
> **Navigation:** "Save list" → Saved Grocery List | Back → Recipes (for changes)
> **Constraint:** No chat input — modifications require going back to Recipes

#### G1: Grocery Checklist
User sees items grouped by store (Costco, community market), then by department. Each item shows recipe attribution: "Gochujang — for Korean BBQ pork belly."

#### G2: Check Off
User taps items to mark as purchased.

#### G3: Save Grocery List
User taps "Save list" → checklist persisted and accessible from sidebar.

### Saved Content
> **Navigation:** Sidebar (hamburger from Home) → three sections: Meal Plans, Recipes, Grocery Lists → tap item → detail view

#### S1: Sidebar Navigation
User opens sidebar and sees three sections: Meal Plans, Saved Recipes, Grocery Lists. Each section lists saved items by name/date.

#### S2: Saved Meal Plan
User sees expandable recipe rows. Tap to expand → terse cooking instructions (key ratios, prep technique, cook instruction — no paragraphs, no story). Chat input at bottom for modifications.

#### S3: Saved Recipe
User sees a standalone cooking card in terse format: ratios, temps, times, imperative steps. Like a note pinned to the fridge. Chat input at bottom.

#### S4: Saved Grocery List
User sees store-grouped checklist with check-off toggles and manual add/remove capability.

#### S5: Remove Recipe
User taps ✕ on a recipe row in a saved meal plan → recipe removed from the plan.

#### S6: In-Place Edit
User taps Edit on a saved recipe → text becomes editable in monospace → Save/Cancel. No rich text editor.

#### S7: Agent Refinement
User types in chat on a saved meal plan or recipe ("Adjust for 8 people", "Add a dessert") → agent suggests options using swap-style inline alternatives → updates content in-place.

#### S8: Copy to Notes
User taps "Copy to Notes" on a saved grocery list → list exported as plain checklist for Apple Notes or similar.

### Agent Intelligence

#### A1: Cross-Session Memory
System maintains a structured user profile: dietary restrictions, preferred cuisines, disliked ingredients, preferred stores, household size, free-text notes. Read on every interaction, updated when user mentions persistent facts ("I'm halal", "family of four"). Ensures the agent doesn't ask the same questions twice across sessions.

#### A2: Dietary Enforcement
Dietary restrictions are hard constraints. The system never presents non-compliant ingredients, substitutions, or recipes as usable options. Halal = no pork in anything suggested, even if intermediate retrieval returns broader candidates.

#### A3: Bilingual Output
When bilingual mode is active, dish names and key instructions appear in both EN and ZH. No partial output — either fully bilingual or fully monolingual.

---

## 3. User Journeys

### Journey 1: Ingredient → Recipes → Grocery → Save
> Features: H1, C1, C2, R1, R6, G1, G3

Home → type "BBQ for 8, I have pork belly and burger patties"
  → Clarify: PCV shows P=good, V=gap; agent suggests gap-filling recipes
  → Recipes: 3-5 cards with have/buy pills covering PCV gaps
  → Grocery: items grouped by store → department, each with recipe attribution
  → Save: list persisted with unique ID, viewable from sidebar

**Must be true:**
- AI responses stream via SSE, not a single block
- PCV analysis returns structured category data with gap indicators
- Grocery list derived from selected recipes' "buy" ingredients
- Save creates a real backend record with unique ID

### Journey 2: Recipe Refinement
> Features: R2, R1

Recipes → tap swap on card 2
  → Chat pre-fills "Suggest a different dish for meal 2"
  → Send → 1-2 alternative cards appear inline, original dimmed

Recipes → edit pre-fill to "something quicker" → send
  → Alternatives have lower effort than original

Recipes → type "make it all Mexican" → send
  → All cards regenerate with Mexican cuisine recipes

**Must be true:**
- Swap pre-fills chat with contextual message referencing the specific card
- Alternatives maintain PCV coverage of the overall set
- Bulk chat changes regenerate all cards, not just one

### Journey 3: Save & Resume
> Features: R5, S1, S2

Recipes → tap "Save plan" → meal plan created
  → Home sidebar: saved plans listed by name/date
  → Tap plan → expandable recipe rows with cooking instructions

**Must be true:**
- Save returns a unique ID, not hardcoded
- Sidebar lists all saved content from backend
- Saved plan loads real data by ID

### Journey 4: Saved Content Editing
> Features: S5, S6, S7, S8

Saved meal plan → type "Add a dessert" in chat
  → Agent suggests options inline → user picks → plan updated

Saved recipe → tap Edit → text becomes editable monospace
  → Modify → Save → card updates

Saved recipe → type "Adjust for 8 people" in chat
  → Agent rewrites card with updated quantities

Saved grocery list → add/remove items manually
  → Tap "Copy to Notes" → plain checklist exported

**Must be true:**
- Agent refinement modifies saved content in-place
- In-place edit preserves terse format
- Copy exports a plain-text checklist

### Journey 5: Error & Edge Cases
> Features: H1, C3, A2

Home → type extremely vague input ("food")
  → Clarify: agent asks high-impact questions to narrow intent

Home → input violates dietary restriction (halal user, pork recipe)
  → Agent enforces restriction — no pork in any suggestion

Recipes → network failure during streaming
  → Error state displayed with retry option

System → LLM unavailable
  → KB-only results served with reduced personalization

**Must be true:**
- Vague input triggers clarify questions, not empty results
- Dietary constraints enforced across all suggestions, substitutions, and recipes
- Network failures produce a visible error state, not silent failure
- LLM downtime falls back to KB-only results

---

## 4. Acceptance Criteria

### Journey 1: Ingredient → Recipes → Grocery → Save

* **[Frontend] Real-Time Streaming (C4, R1):** AI responses arrive via SSE. User sees progressive status updates during processing.
* **[Backend] PCV Analysis (C2):** Agent categorizes ingredients into P/C/V, computes gap status per category, returns structured data to frontend.
* **[Backend] Recipe Curation (R1):** Agent queries KB and returns 3-5 recipe cards forming a coherent set covering identified PCV gaps.
* **[Backend] Grocery List Generation (R6, G1):** System extracts "buy" ingredients from selected recipes, cross-references store/product data, produces store → department grouped list with recipe attribution.
* **[Frontend] Dynamic Save (G3):** "Save list" triggers backend POST, navigates to saved view using returned ID.
* **[Frontend] Saved Content Loading (S4):** Saved views fetch real data from backend by ID.

### Journey 2: Recipe Refinement

* **[Frontend] Swap Pre-fill (R2):** Tapping swap on card N pre-fills chat with "Suggest a different dish for meal N ({recipe name})" and highlights the card.
* **[Backend] Contextual Alternatives (R2):** Agent receives swap message, queries KB with constraints from the current set, returns 1-2 alternatives maintaining PCV coverage.
* **[Frontend] Inline Alternatives (R2):** Alternative cards render below the swapped card. Original card remains visible but dimmed.
* **[Backend] Bulk Regeneration (R1):** Free-text chat like "make it all Mexican" triggers full card set regeneration.

### Journey 3: Save & Resume

* **[Backend] Persist Meal Plan (R5):** POST creates a meal plan record with unique ID, stores recipe set and cooking instructions.
* **[Frontend] Sidebar Listing (S1):** Sidebar fetches and displays all saved plans/recipes/lists from backend.
* **[Frontend] Detail View (S2):** Tapping a saved item loads full content from backend by ID, renders expandable recipe rows with cooking instructions.

### Journey 4: Saved Content Editing

* **[Backend] Agent Refinement (S7):** Chat on a saved item loads the item into prompt context, agent modifies content, system persists updates in-place.
* **[Frontend] In-Place Edit (S6):** Edit mode renders recipe text as editable monospace. Save/Cancel controls. No rich text.
* **[Frontend] Manual List Editing (S4):** Saved grocery list supports manual add/remove items and check-off toggles.
* **[Frontend] Copy Export (S8):** "Copy to Notes" produces a plain-text checklist in clipboard.

### Journey 5: Error & Edge Cases

* **[Backend] Vague Input Handling (C3):** Input below confidence threshold triggers clarify questions rather than empty results.
* **[Backend] Dietary Enforcement (A2):** All tool outputs filtered against user's dietary constraints before returning to frontend.
* **[Frontend] Error States:** Network failures and timeouts display a visible error banner with retry option.
* **[Backend] Graceful Degradation:** When LLM is unavailable, system serves KB-only results with reduced personalization.

---

## 5. System Behavior

### Agent Architecture

Single conversational agent with tool-use loop (not separate REST endpoints). The agent receives freeform input, decides tool ordering per conversation. Explicit while-loop orchestration, max 10 iterations with partial result fallback.

| Tool | Purpose |
|:-----|:--------|
| `analyze_pcsv` | Categorize ingredients by Protein/Carb/Veggie/Sauce |
| `search_recipes` | Find KB recipes matching ingredients/constraints |
| `lookup_store_product` | Package sizes, departments, store availability |
| `get_substitutions` | Ingredient alternatives by reason |
| `get_recipe_detail` | Full cooking instructions for a recipe |
| `update_user_profile` | Persist learned preferences/restrictions |
| `translate_term` | EN↔ZH bilingual glossary lookup |

**Streaming:** Status strings during agent loop, typed events after completion. Event types: `thinking`, `pcsv_update`, `recipe_card`, `explanation`, `grocery_list`, `error`, `done`.

**Prompt assembly:** Rebuilt every chat call. Reads latest user profile from database. System prompt = persona + rules + tool instructions.

**Schema coercion:** `json.loads()` → Pydantic type coercion → field validators → defaults → re-prompt only as last resort.

### Knowledge Base

| Data Type | User-Facing Purpose |
|:----------|:-------------------|
| Recipes | Grounded suggestions (~80% curated from Kenji Lopez-Alt, ~20% AI-generated and flagged) |
| Products | Real store sizes, departments, availability (Costco, community market, Vancouver) |
| PCV Mappings | Structural gap detection per ingredient (some multi-role: beans = protein + carb) |
| Substitutions | "If you can't find X, use Y" with dietary constraint awareness and match quality |
| Flavor Tags | Variety matching across meals — contrast profiles across the set |
| Ingredient-Recipe Index | Reverse lookup enabling multi-preparation suggestions for bulk items |

> Full schema: `contracts/kb_schema.sql`

### Quality Boundaries

- **Recipe accuracy:** KB recipes trusted. LLM-generated flagged as "AI-suggested."
- **Dietary restrictions:** Hard constraints — never violated in any suggestion, substitution, or recipe.
- **Quantity awareness:** Don't suggest 5 recipes needing a full pack when user has one pack.
- **Bilingual consistency:** When active, every name and key instruction in both languages. No partial output.
- **Transparency:** Briefly explain why each suggestion is made ("Adding vegetables because your list is protein-heavy").
- **Graceful degradation:** LLM down → KB-only results with reduced personalization.

---

## 6. Open Questions

- **Bilingual scope:** Currently targeting English-first. Chinese planned for dish names initially. Full i18n pipeline scope TBD.
- **KB seed strategy:** How many recipes and products to index initially, which cuisines to prioritize first.
- **Vague input threshold:** Minimum information before the system generates useful suggestions. Deferred to user testing.
- **Model selection:** Mid-tier non-reasoning model likely needed for structural complexity. Depends on further evaluation.
