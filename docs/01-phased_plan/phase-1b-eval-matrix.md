# Phase 1b — Eval Matrix

**Date:** 2026-04-06 | **Status:** Active | **Owner:** Dako (@iDako7)

This document defines what to test and how to assert it. An agent consumes this to write pytest tests (tool handlers, orchestration) and promptfoo evals (reasoning quality). Use Sonnet (`anthropic/claude-sonnet-4`) for all evals.

---

## Testing Layers


| Layer             | Framework | Covers                                                                                            |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Tool handlers     | pytest    | Deterministic I/O correctness for each of the 7 tool functions                                    |
| Orchestration     | pytest    | Loop mechanics: termination, dispatch routing, malformed JSON, iteration cap                      |
| Reasoning quality | promptfoo | Agent decision-making: tool sequencing, gap detection, constraint enforcement, bilingual behavior |


---

## enforcedTool Handler Tests (pytest)

Each tool has a known-input → expected-output contract against the seed data.


| Tool                   | Test cases                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyze_pcsv`         | `["chicken wings", "rice"]` → protein=low, carb=low, veggie=gap, sauce=gap. `["tofu", "bok choy", "soy sauce"]` → protein=low, carb=gap, veggie=low, sauce=low. Empty list → all gaps. Partial match: `"chicken"` matches `"chicken wings"` mapping. |
| `search_recipes`       | `["pork belly", "gochujang"]` → r001 ranked first (highest overlap). Cuisine filter: `cuisine="Korean"` excludes non-Korean. `max_time=20` excludes recipes over 20 min. Zero overlap ingredients → empty results.                                 |
| `lookup_store_product` | `"chicken thighs"` → returns product with package_size and department. Unknown item → graceful empty/not-found response.                                                                                                                           |
| `get_substitutions`    | `"gochujang"` → returns at least one substitute. `reason="dietary"` → substitutes respect the constraint. Unknown ingredient → empty or not-found.                                                                                                 |
| `get_recipe_detail`    | `"r001"` → returns full recipe with instructions, ingredients, source. Invalid ID → not-found response.                                                                                                                                            |
| `update_user_profile`  | Setting `dietary_restrictions=["vegetarian"]` persists on profile object. Setting `household_size=4` updates integer field.                                                                                                                        |
| `translate_term`       | `"chicken wings"` → zh=`"鸡翅"`, match_type=exact. `"鸡翅"` with direction=auto → en=`"chicken wings"`. `"xyznotfood"` → match_type=none. Partial: `"chicken"` → matches an entry.                                                                     |


---

## Reasoning Quality Evals (promptfoo)

### Effort tiers

All tiers are must-pass. The tier signals complexity and how much the implementing agent should invest in coverage and iteration.

- **High effort:** Vague input, dietary restriction enforcement, substitution scenarios — these are agent differentiators and harder to get right. Expect more iteration.
- **Medium effort:** Core user stories (Story 1, Story 2), multi-preparation variety — important happy paths, more straightforward once high-effort behaviors are solid.
- **Low effort:** Bilingual input, translate_term usage — LLMs handle this well already. Confirm it works, don't stress-test.

### Scenarios

#### HIGH-01: Vague input handling

- **Input:** `"I have some stuff for dinner"`
- **Profile:** default
- **Valid paths:** (a) Ask clarifying questions without calling any tools, OR (b) call `analyze_pcsv` with assumed/empty ingredients and proceed.
- **Content:** Response either asks for clarification OR makes reasonable assumptions and states them explicitly. Agent MUST NOT jump to recipe suggestions without establishing what the user has.

#### HIGH-02: Vague input with partial ingredients

- **Input:** `"maybe some chicken and rice, not sure what else"`
- **Profile:** default
- **Valid paths:** (a) Call `analyze_pcsv` with at least `["chicken", "rice"]` then proceed, OR (b) ask what else the user has before analyzing.
- **Content:** If the agent proceeds to suggestions, it identifies veggie gap and suggests specific items to fill it. If it asks first, the question is relevant and not redundant.

#### HIGH-03: Dietary restriction — hard constraint

- **Input:** `"BBQ for 4, I have pork belly and burger patties"`
- **Profile:** `dietary_restrictions: ["vegetarian"]`
- **Valid paths:** (a) Flag the conflict immediately and ask how to proceed, OR (b) exclude the non-vegetarian ingredients and search for vegetarian alternatives.
- **Content:** Response MUST NOT suggest pork belly or burger patties as usable ingredients. Response MUST acknowledge the conflict between the user's ingredients and their vegetarian restriction.
- **LLM-judge:** Does the agent handle the conflict helpfully — offering a path forward rather than just refusing?

#### HIGH-04: Dietary restriction — no violations in final response

- **Input:** `"Help me plan meals for the week with what I have: tofu, rice, bok choy, soy sauce"`
- **Profile:** `dietary_restrictions: ["vegetarian"]`
- **Note:** `search_recipes` does not filter by dietary restriction — the agent is responsible for excluding non-compliant results before presenting them to the user.
- **Content:** The final response MUST NOT recommend any recipe containing meat or seafood. Every suggested recipe must be vegetarian-compatible.
- **LLM-judge:** Are the suggestions genuinely useful vegetarian meals, not just the only results that happened to lack meat?

#### HIGH-05: Substitution — unavailable ingredient

- **Input:** `"I want to make Korean BBQ pork belly but I can't find gochujang anywhere"`
- **Profile:** default
- **Structural:** Agent calls `get_substitutions` for gochujang at some point during the conversation.
- **Content:** Response provides at least one alternative and explains how it changes the dish.

#### HIGH-06: Substitution — dietary reason

- **Input:** `"What can I use instead of fish sauce? I'm vegetarian"`
- **Profile:** `dietary_restrictions: ["vegetarian"]`
- **Structural:** Agent calls `get_substitutions` for fish sauce at some point.
- **Content:** Every substitute suggested is vegetarian-compatible. Response does not suggest any animal-derived alternative.

#### MED-01: User Story 1 — planned meal shopping

- **Input:** `"I'm hosting a BBQ for 8 people this Saturday. I have pork belly and burger patties."`
- **Profile:** default
- **Structural:** Agent uses `analyze_pcsv` and `search_recipes` at some point. Agent uses `lookup_store_product` at least once for items the user needs to buy.
- **Content:** Response identifies veggie gap. Suggests at least 2 recipes. Mentions specific Costco products with package sizes for items to buy.
- **LLM-judge:** Are the suggestions coherent as a BBQ menu (not random unrelated dishes)?

#### MED-02: User Story 2 — leftover planning

- **Input:** `"I have 3/4 of a Costco chicken wing pack, rice, soy sauce, bok choy"`
- **Profile:** default
- **Structural:** Agent uses `analyze_pcsv` and `search_recipes` at some point.
- **Content:** Suggests at least 2 different preparations for the chicken wings. Mentions varied cooking methods or sauces across suggestions.
- **LLM-judge:** Do the suggestions feel like varied meals rather than the same dish repeated?

#### LOW-01: Bilingual input — Chinese

- **Input:** `"我有鸡翅和大米，还有酱油"`
- **Profile:** default
- **Structural:** Agent correctly identifies the ingredients (chicken wings, rice, soy sauce) — via `translate_term`, direct interpretation, or both.
- **Content:** Response correctly works with the identified ingredients. If suggesting dishes, bilingual names are a plus but not required unless the user has indicated bilingual preference.

#### LOW-02: Bilingual input — mixed language

- **Input:** `"I have some 五花肉 and rice, want to do Korean style"`
- **Profile:** default
- **Structural:** Agent recognizes 五花肉 as pork belly (via `translate_term` or directly). Agent calls `search_recipes` with `cuisine="Korean"`.
- **Content:** Response treats 五花肉 as pork belly in analysis and suggestions.

#### LOW-03: translate_term vs recipe KB names

- **Input:** `"What's gochujang in Chinese?"`
- **Profile:** default
- **Structural:** Agent calls `translate_term` with `term="gochujang"`. Agent MUST NOT call `search_recipes` for a simple translation question.
- **Content:** Response includes the Chinese translation.

#### MED-03: Multi-preparation variety

- **Input:** `"I bought a huge pack of chicken thighs from Costco. Give me ideas for the whole week."`
- **Profile:** `household_size: 2`
- **Structural:** Agent uses `search_recipes` at some point.
- **Content:** At least 3 different recipes suggested. Recipes use different cooking methods or sauce profiles.
- **LLM-judge:** Do the suggestions cover enough variety for a week, or would the user get bored?

---

## Assertion Type Guidance


| Type       | Use when                                                                                 | Ratio target | promptfoo mapping                                   |
| ---------- | ---------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| Structural | Behavior is binary: tool called or not, order correct or not, constraint violated or not | ~50%         | `javascript` or `python` assertion on tool call log |
| Content    | Expected keywords, phrases, or absence of forbidden content in response text             | ~30%         | `contains`, `not-contains`, `icontains`, regex      |
| LLM-judge  | Subjective quality only — helpfulness, coherence, variety                                | ~20%         | `llm-rubric` with specific criteria                 |


Structural assertions are the backbone. They catch the most critical failures (wrong tool order, dietary violations, missing tool calls) and cost nothing to run. Add LLM-judge only when you cannot express the criteria as structural or content checks.

---

## Future: Model Comparison (OQ-3)

Deferred to a later phase. The matrix is designed to be re-runnable against any model by changing the `MODEL` variable in the harness. When ready:

- Pick a representative subset of scenarios (suggest: HIGH-03, MED-01, MED-02, LOW-01) rather than the full matrix
- Compare on: assertion pass rate, token usage, latency, cost per conversation
- Decision criteria documented in `ai-layer-architecture-v2.md` under OQ-3

