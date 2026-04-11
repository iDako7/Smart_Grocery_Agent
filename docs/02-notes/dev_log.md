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

The trade-off: this only works when the design is locked. Contracts, schemas, and prototype code must exist before the plan is written.

## Day 9 (Apr 9)

### Post-merge fixes: orchestrated subagent pattern

- **WT2 verification:** Confirmed all WT2 deliverables complete against the Phase 2 plan. Found 2 issues: 7 stale WT1 data tests (KB expansion changed row counts) and missing LLM retry-with-backoff (plan specified it, code didn't have it).
- **Fixes shipped:** Updated test assertions, implemented `_llm_call_with_retry()` with parametrized tests for all 4 retryable error types. 181 tests pass, 0 failures. (PR #10)

### Orchestration pattern: Plan → Parallel Subagents → Verify → Review

Used Claude Code skills as specialized subagents, orchestrated by the main conversation.

```
Round 1:
  /plan          → scoped 2 issues, 4 phases, got CONFIRM
  /build-fix     ─┐ parallel — fix 7 stale test assertions
  /tdd           ─┘ parallel — RED (3 retry tests) → GREEN (_llm_call_with_retry)
  /verify        → 178 passed, 0 failed (gate)
  /code-review   → approved, flagged 2 MEDIUM

Round 2 (address review findings):
  /tdd           ─┐ parallel — parametrize 4 error types + assert backoff delay
  /build-fix     ─┘ parallel — fix traceback preservation
  /verify        → 181 passed, 0 failed (gate)
  /code-review   → approved, 0 blocking issues
```

**Key properties:**

1. **Independent phases run in parallel** — `/build-fix` and `/tdd` never touch the same files, so they execute concurrently.
2. **Verify gates review** — don't review broken code. `/verify` must pass before `/code-review` runs.
3. **Review findings loop back** — same pattern at smaller scope. MEDIUM findings from Round 1 became Round 2 inputs.
4. **Self-contained subagent briefs** — each agent gets exact file paths, line numbers, expected values, constructor signatures. No ambiguity.
5. **Orchestrator does synthesis** — reads subagent results, decides what's next, writes the next prompt. Never delegates understanding.

**When this works:** Design is locked (contracts, schemas, existing tests all exist). Each subagent prompt can be fully specified upfront.

**When this doesn't work:** Exploratory work where the next step depends on what you discover. In that case, use a single agent with broader scope instead of trying to parallelize. Without that, the orchestration plan would be guesswork.

## Day 10 (Apr 10) — Stage 3 UAT review + test strategy diagnosis

### Background

WT3 Stage 3 UAT found 3 critical interaction bugs despite ~4500 test assertions across 13 test files:
1. Clarify page "All of the above" / "None" toggle has no mutual exclusion logic — clicking "All" just adds the string, doesn't select individual options.
2. Recipe swap cycling broken — `onPick` closes the panel but never replaces the recipe in the array or rotates alternatives.
3. Non-functional buttons — "Save plan", "EN/中", "Save list" render but have no onClick handlers.

Diagnosed why the same `/tdd` agent produced high-quality integration tests for backend but shallow unit tests for frontend.

### Root cause: test quality is determined by the orchestration plan, not the agent

The backend orchestration plan (`wt2-orchestration-plan.md`) specified:
- Exact integration test file names (`test_session_lifecycle.py`, `test_chat_e2e.py`, `test_saved_content_integration.py`)
- Exact behaviors to verify ("multi-turn context includes previous turns", "save from session, verify independence")
- Real infrastructure in tests (PostgreSQL via tx-rollback, SQLite KB, ASGI transport)

The frontend plan (`wt3-frontend-plan.md`) specified:
- Human review criteria ("full click-through: Home → Clarify → Recipes → Grocery")
- No test file list, no behavior specs, no multi-step flow requirements

The `/tdd` agent defaulted to unit tests because that's the path of least resistance when the plan doesn't demand integration tests by name. The frontend "integration" tests (`stage3-integration.test.tsx`) each test ONE screen, ONE action, ONE assertion — never a multi-step flow. One test's assertion was literally `expect(container).toBeDefined()` (always passes).

### Takeaways

1. **The agent does what the plan tells it to — no more.** Test quality is a planning problem, not an execution problem. The `/tdd` agent doesn't decide what kind of tests to write. The orchestration plan does.

2. **The orchestrator pattern requires one more translation step** for frontend work:
   ```
   Product spec (human behavior)
       → Orchestration plan (test file names + behavior assertions)
           → /tdd agent (writes code)
   ```
   The middle step was thorough for backend, thin for frontend. That's the gap.

### Fix plan

Wrote `docs/01-plans/frontend-fix-orchestration-plan.md` — 7 TDD calls, 4 new test files, 1 code review checkpoint, explicit behavior assertions for each bug. Also wrote a backend live-LLM test prompt (single test file, no plan needed).

## Day 10 (Apr 10) — Product spec v3 rewrite + process reflection

### What happened

Preparing for Phase 2.2 integration, ran a gap analysis comparing the product spec against the codebase. Found significant gaps on both frontend (7 issues) and backend (5 issues) — features described in prose but never built, hardcoded IDs, empty data pipelines, stubbed buttons.

Diagnosed the root cause: the product spec itself. Written as dense prose, it was hard for both agents and humans to extract discrete features, behavioral expectations, and test criteria. The agents had to interpret paragraphs and translate them into feature definitions — a lossy process that produced gaps.

Rewrote `product-spec-v2.md` as a structured, agent-friendly format (Approved v3):
- **Feature catalog** — 26 features with IDs (H1-H2, C1-C4, R1-R6, G1-G3, S1-S8, A1-A3), grouped by screen
- **User journeys** — 5 end-to-end flows in compact notation with "must be true" assertions
- **Acceptance criteria** — per-journey FE/BE behavioral requirements, each tagged with feature IDs for traceability

### Reflection: prototypes prevent gaps, specs must meet human standards

**Prototype as full-scope reference.** In an earlier project I used Claude artifacts (full JSX prototypes) as the reference for coding agents. The agent could refer to the artifact directly and complete the full scope — no gaps. This project used an HTML wireframe instead, because the product was too complex for a single artifact. The wireframe worked for visual design but lacked the behavioral detail that a runnable prototype provides.

The lesson: a prototype is not just a frontend reference — it's a critical backend reference too. A full-scope prototype in a single code space means one agent session has seen the entire product. That's the best way to prevent gaps between frontend and backend. Next time: draw wireframes in Figma → let Claude Code Desktop generate a full artifact from the wireframe + product spec → use that artifact as the single source of truth for the implementation plan.

**Specs must meet human standards, not agent standards.** I had a persistent feeling the product spec wasn't good enough, but assumed the agent would handle the ambiguity. It didn't — the agent produced exactly what the spec described, including the vagueness. The spec is the command system I build for the agents. If I can't use it to clearly verify what's right and what's wrong, neither can the agent. The standard for documentation is not "can an agent parse this" — it's "can I, as the commander, use this to know where things stand at a glance."
