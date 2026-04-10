# Dev Log — SGA V2

## Day 1 (Apr 3) — Product vision and first prototype

- **Product spec:** Wrote `product-spec-v2.md` — locked in PCSV framework, two-trip model (Costco + community market), two canonical user stories, bilingual EN/ZH scope.
- **UI prototype:** Built 2 React artifact walkthrough — but they didn't meet my expectation, still like a sequential workflow in order system.

## Day 2 (Apr 4) — Architecture and foundational learning

- **HTML wireframe** `#important` Produced wireframe-v2.html as the final deliverable of the UX design session — 7 interactive screens covering the full Home → Clarify → Recipes → Grocery flow, with the swap+chat pattern, PCV indicators, and saved content model all built in.
- **Architecture spec:** `#important` Designed full system architecture in `architecture-spec-v2.md` — 11 decisions, phase alignment table, open questions.
- **Conceptual deep-dives:** Explored tool-use vs. RAG, SSE vs. WebSocket vs. polling, stateful vs. stateless conversation design — building genuine understanding, not just copying decisions.

## Day 3 (Apr 5) — AI layer design, doc reconciliation, and prototype

- **AI layer spec:** `#important`Designed agent internals in `ai-layer-architecture-v2.md` — 7 ADRs covering orchestration loop, SSE streaming, schema coercion, user profile memory, tool design.
- **Prototype committed:** System prompt, 7 tool definitions + handlers, Pydantic schemas, orchestration while-loop, seed data (recipes, PCSV mappings, substitutions, glossary, 443 Costco products).

## Day 4 (Apr 6) — KB refinement and eval infrastructure

- **KB improvements:** Replaced rigid cook times with effort levels, added flavor tags, added `translate_term` as 7th tool, removed out-of-scope freshness tracking. (PRs #1, #2)
- **Eval matrix:** Defined Phase 1b evaluation matrix — 14 scenarios across 3 priority tiers (HIGH/MED/LOW).
- **Test suites:** Built pytest suite for all 7 tool handlers + orchestration loop mechanics.
- **Promptfoo eval suite:** Custom Python provider, dual LLM-judge grading (Claude Opus + GPT-5.4), ~40% structural / 25% content / 35% LLM-judge assertions.

_Reflection:_

During the evaluation and review on Apr 6, I found two important gaps in my Phase 1 design.

First, the translation feature was conceptually part of the product, but it was not fully reflected in the tool design at first. After reviewing the work, this became clearer, and the Apr 6 follow-up commit updated the documented tool list to explicitly include `translate_term`. This showed me that if a capability matters to user experience, it must be represented clearly in the tool layer, not only implied in the product idea.

Second, one feature expanded beyond the real scope: in user story 2, the goal was only to help users deal with leftovers, but the agent introduced the idea that "aging ingredients should be used first." This was a mistake because there was no data source, no collection plan, and no tool support for freshness tracking. Removing it was the correct decision.

Main lesson: I should explicitly list the success matrix and what I anticipate from the tool. Another lesson is that, although I wrote a concise and explicit product specification, it was not user-friendly. It's almost like listing everything as plain tasks, which makes it difficult to focus on reading the document because you have to read all the content one sentence at a time.

Improvement: orchestration still needs a gate.

## Day 5 (Apr 7) — Architecture review, design system, and Phase 1 completion

- **Architecture review:** `#important`Updated architecture docs for Phase 2 — removed OQ-1, normalized 7 tools, confirmed frontend stack. Revised `architecture-spec-v2.md` for clarity. Added ADR-17 (screen-agnostic API), consolidated 15 ADRs into single reference doc.
- **Phase 2 plan:** `#important` Wrote `phase-2-implementation-plan.md` with frontend build strategy (static HTML -> React components -> mock state machine -> live SSE).
- **Design system:** Explored three visual directions (Editorial Cookbook, Market Receipt, Soft Bento), selected Soft Bento, produced design reference covering tokens, typography, component patterns, bilingual rules.
- **Phase 1c completion:** Produced artifact-to-Phase-2 mapping — every prototype file mapped to its Phase 2 destination. Added vegetarian KB data. Normalized chat endpoint to `POST /session/{id}/chat` across all docs. Created contract freeze protocol. Restructured `docs/` into `00-specs/`, `01-plans/`, `02-notes/`, `03-evaluations/`, `04-walkthroughs/`. Archived Phase 1b eval artifacts. (PR #4)

## Day 8 (Apr 9) — WT2 Backend + AI layer implementation

- **Full WT2 implementation:** Completed all 5 stages in a single session — DB layer, 7 tool handlers, orchestrator, API endpoints, SSE streaming. 56 files, 4213 lines. 175 tests, 80% coverage. (PR #9)

### Implementation pattern: orchestration plan + TDD + async code review

Wrote a detailed orchestration plan upfront (`wt2-orchestration-plan.md`) specifying 10 TDD calls, 3 code review checkpoints, and 5 verification gates in exact dependency order. One agent executed the plan sequentially — write tests first, implement to pass, run the gate. Code review agents ran in the background at marked checkpoints (Stages 1, 2, 4) and reported issues without blocking progress. Fixes were batched and applied before the final gate.

This pattern traded planning time for execution speed. The entire backend shipped in one session because each TDD call had zero ambiguity — file names, function signatures, test expectations, and reference code were all specified. The code reviews caught real bugs (unbound variable, list/dict mismatch, unsanitized field name) that would have been painful to debug later.

The trade-off: this only works when the design is locked. Contracts, schemas, and prototype code must exist before the plan is written. Without that, the orchestration plan would be guesswork.
