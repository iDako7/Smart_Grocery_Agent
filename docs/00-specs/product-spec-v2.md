# Smart Grocery Assistant — Product Spec V2

**Last updated:** 2026-04-03
**Status:** Draft
**Owner:** Dako (@iDako7)

---

## 1. Vision

A thinking partner that helps you cook delicious food more easily — by making smarter grocery decisions. It balances three constraints: delicious enough (varied meals grounded in real recipes), low effort (structural thinking so you don't have to), and low cost (Costco bulk + community market fresh produce).

**Who it's for:** Two user groups in Vancouver — immigrants exploring Western grocery items (bilingual English/Chinese support), and local Canadians exploring Asian, Mexican, Indian, and other cultural foods.

**Why existing solutions fail:** General-purpose AI improvises without structural reasoning. Recipe apps start from "pick a recipe" instead of "what do I have." Meal planners produce rigid weekly plans that break on first contact with reality.

**Scope:** The full arc from idea → assess what you have → decide what to buy → shop → cook. Leftovers and remaining ingredients loop back as the starting context for the next session.

## 2. Core Principles

**PCV gap analysis as the reasoning backbone.** The system checks three categories — Protein, Carb, Vegetable — to find structural gaps: "heavy on protein, almost no vegetables." Sauce is tracked internally but not shown in the analysis UI; sauce suggestions appear only in the grocery list. PCV is a backend framework, not a user-facing concept.

**Real recipes, not LLM improvisation.** Suggestions grounded in curated, tested recipes (Kenji López-Alt's books as primary backbone). The LLM matches recipes to context and fills gaps — it doesn't invent from scratch. Target: ~80% curated, ~20% LLM-generated (clearly flagged).

**Structure first, then inspire.** Check structural completeness before making creative suggestions. Once PCV gaps are addressed, suggest creative ideas *within* that structure.

**Tolerate vague input.** "I have some chicken wings and rice" is valid. The system works with rough context, asks clarifying questions only for genuine ambiguities, and makes reasonable assumptions for the rest.

**Two-trip flexibility.** Suggestions have built-in buffer — they still work if reality diverges from the plan. The system adjusts on the next trip rather than breaking.

**Grounded in real shopping constraints.** The system knows Costco product sizes, community market availability, and store departments. Never suggests quantities that don't match how stores sell them.

**Suggest, don't dictate.** Every suggestion is dismissable. Every recipe is optional. This is a thinking partner, not a meal planner that demands compliance.

## 3. User Stories

Both stories follow the same arc with different starting conditions.

**Story 1: "I have a plan, help me shop smarter."** Dako is hosting a BBQ for 8. He has pork belly and burger patties. The system identifies his veggie gap, suggests Korean cucumber salad and corn from Costco, and generates a store-organized shopping list. When he cooks, he taps pork belly and sees: "slice thin, marinate 30 min in soy-gochujang mix, grill 2-3 min per side."

**Story 2: "I have leftovers, help me plan."** Dako has 3/4 of a Costco chicken wing pack, rice, soy sauce, bok choy. The system suggests three different preparations (teriyaki wings, congee, stir-fry) — same protein, different sauces and methods. For his next trip: teriyaki sauce, green onions, mushrooms.

## 4. Product Architecture

The product is a **guided agent experience**: structured screens provide the rails, the agent provides the intelligence, and chat is available on each screen as a refinement tool — not the primary interface.

### Interaction model: canvas + chat

Each screen has a **canvas** (structured UI: cards, charts, checklists) and a **chat input**. The key pattern: chat messages are *instructions to the agent* that update the canvas, not a conversation thread. The user types "I also have kimchi" → the ingredient list and PCV indicators update. Questions ("what does gochujang taste like?") get answered inline in the chat.

### Navigation: always sequential, agent controls weight

Four screens in fixed order: Home → Clarify → Recipe Selection → Grocery. Every screen is a mandatory checkpoint, but the agent controls how much content each shows. If the user arrives with high-confidence input, the Clarify screen might be a one-tap confirmation. The flow is always sequential — steps become thin, not skipped.

### Sidebar

A sidebar (hamburger menu from Home) manages saved content, organized into three sections: Meal plans, Saved recipes, Grocery lists. Similar to how Claude manages chat sessions.

### Screen 1: Home

The entry point for every session. Clean and focused on starting.

- **Text input** — freeform: "BBQ for 8 people" or "I have leftover chicken wings"
- **Quick-start chips** — pre-built session templates ("Weekend BBQ," "Weeknight meals," "Use my leftovers") that pre-populate input and jump to Clarify. These also serve as onboarding — users learn what the app does by tapping one.

No chat input on this screen.

### Screen 2: Clarify

The agent presents its understanding for the user to validate or correct.

- **Situation summary** — one-line context: "BBQ for 8 people · outdoor grill · this Saturday"
- **Ingredient list grouped by PCV category** — a single merged section (not separate "ingredients" and "analysis"). Each category row shows a status indicator (checkmark = good, warning = low, alert = gap) with ingredient names and a brief note. Example: `[!] Veggie — almost none — need fresh options`. This is the frame that helps the user see gaps at a glance without performing analysis themselves.
- **Clarify questions (conditional)** — only shown when the answer would genuinely change suggestions. Tappable chips for quick answers. If no questions needed, this section is absent.
- **Chat input** — for corrections and additions: "I also have kimchi, forgot to mention."
- **Primary action** — "Looks good, show recipes" button.

### Screen 3: Recipe selection

Where the agent delivers its core value — turning ingredients + context into an actionable meal plan.

**Card-based presentation.** The agent presents one curated set of 3-5 meal cards. Each card shows: recipe name + info button, one-line description with effort level and key flavor tags, "have" pills (ingredients on hand) and "buy" pills (gap items). The cards work as a coherent set — varied sauces, varied cooking methods, PCV coverage.

**Unified swap + chat pattern.** Each card has a "swap" button. Tapping swap does not open a separate alternatives panel — it pre-fills the chat input with a contextual message (e.g., "Suggest a different dish for meal 2 (congee)") and highlights the card being swapped. Three paths from here:

1. Send as-is → agent generates 1-2 contextual alternatives inline, user picks one or keeps original
2. Edit the pre-filled text for specificity ("...something quicker") → agent gives targeted alternatives
3. Ignore swap, type freely in chat for big changes ("make it all Mexican instead") → agent regenerates all cards

**Info button (i).** Bottom sheet with: bilingual name (English + Chinese), flavor tags displayed as pills, 2-line description of what it tastes like. Essential for both user groups discovering unfamiliar dishes.

**Browse all recipes.** A link below the cards to a searchable/filterable recipe list from the KB. Secondary to the curated set — appears after the user has seen the agent's curation.

**Actions:** "Save plan" (stores as a meal plan) or "Build shopping list" (extracts gap items → Grocery screen).

### Screen 4: Grocery

A store-grouped checklist. No chat input — if changes are needed, the user goes back to Recipe Selection.

- Items grouped by store (Costco, Community market), then by department
- Each item shows what recipe it's for: "Gochujang — for Korean BBQ pork belly"
- Check-off interaction
- "Save list" action

## 5. Saved Content

Three types of persistent content, all accessible from the sidebar.

### Saved meal plan

A set of recipes from a completed session. Each recipe row is expandable — tap to show terse cooking instructions (key ratios, prep technique, cook instruction in the compact format: no paragraphs, no story). Editable:

- **Remove** a recipe from the plan (tap ✕)
- **Add** a recipe via chat input at the bottom ("Add a dessert to this plan") — agent suggests options using the same swap-style inline alternatives
- **View** cooking instructions by expanding any recipe card

### Saved recipe

A standalone quick-reference cooking card, not tied to a session. The format is terse and scannable — ratios, temps, times, imperative steps. Like a note pinned to the fridge. Editable:

- **Edit** content in-place as plain text (tap Edit → text becomes editable in monospace → Save/Cancel). No rich text editor.
- **Remove** the recipe entirely (tap ✕)
- **Agent-assisted modification** via chat input: "Adjust this for 8 people" → agent updates the card content

### Saved grocery list

One list with store sections (not separate lists per store). Editable:

- **Check off** items (already bought)
- **Add/remove** items manually
- **Copy to Notes** — exports as a plain checklist for Apple Notes or similar

## 6. Intelligence Layer

**Agent architecture.** A single conversational agent with tool-use (not separate REST endpoints). The agent receives freeform input, decides which tools to call (KB recipe search, PCV gap analysis, store lookup, user profile update), in what order, and how many times.

**Cross-session memory.** The agent maintains a structured user profile — dietary restrictions, preferred cuisines, disliked ingredients, preferred stores, household size, and free-text notes. This profile is read on every interaction and updated during conversation when the user mentions persistent facts (e.g., "I'm halal" or "we're a family of four"). The profile ensures the agent doesn't ask the same questions twice across sessions.

**Reasoning pipeline:** LLM understands the user → KB provides the foundation → LLM reasons over KB data → LLM fills gaps as fallback.

**PCV gap analysis.** Before creative suggestions, compare user's state against Protein/Carb/Vegetable categories. Sauce tracked internally, surfaced only in grocery suggestions.

**Recipe matching over generation.** Primary mode is retrieval from curated KB. Multi-preparation awareness: bulk items get varied suggestions (different sauces, cooking methods) across meals.

## 7. Knowledge Base

- **Recipes** — Kenji López-Alt's *The Food Lab* and *The Wok* as backbone, indexed by ingredients, PCV categories, cuisine, effort level, cooking method, and flavor tags. LLM-generated recipes fill gaps, flagged as "AI-suggested."
- **Product data** — Costco and community market items with package sizes and department locations. Starting with Vancouver. No price data.
- **PCV mappings** — every ingredient mapped to its category role (some multi-role: beans = protein + carb)
- **Substitutions** — "if you can't find X, use Y" with match quality. Supports dietary restrictions and cultural bridges.
- **Ingredient-to-recipe index** — reverse lookup enabling multi-preparation suggestions
- **Flavor tags** — multi-dimensional taste and sensory descriptors (e.g., `[sweet, umami, rich]` for teriyaki; `[sour, fresh, herbal]` for Vietnamese salad). Used for variety matching across meals: if tonight's dish is `[sweet, umami]`, the agent suggests a contrasting profile like `[sour, fresh]` tomorrow. Cuisine remains a separate dimension — flavor tags describe *how a dish tastes*, cuisine describes *where it comes from*.

## 8. Quality Boundaries

- **Recipe accuracy:** KB recipes are trusted. LLM-generated recipes are flagged as "AI-suggested."
- **Dietary restrictions are strict response constraints.** The agent must not present non-compliant ingredients, substitutions, or recipes as usable options in its response. Example: halal means no pork in anything the user is told they can make or buy, even if intermediate retrieval returns broader candidates.
- **Quantity awareness:** Don't suggest 5 recipes needing a full pack when the user has one pack.
- **Bilingual consistency:** When bilingual mode is on, every name and key instruction appears in both languages. No partial output.
- **Transparency:** Briefly explain why each suggestion is made. "Adding vegetables because your list is protein-heavy."
- **Graceful degradation:** If KB has no match, LLM fills gaps (flagged). If LLM is down, serve KB-only results with reduced personalization.

## 9. Open Questions

- **OQ-2: KB seed strategy.** How many recipes and products to index initially, which cuisines to prioritize first.
- **OQ-3: Model selection.** Mid-tier non-reasoning model likely needed for the agent's structural complexity. Depends on further evaluation.
- **OQ-4: Extremely vague input.** Minimum information threshold before the system can generate useful suggestions. Deferred to user testing.
