# Smart Grocery Assistant — Phase 1 Detailed Plan

**Date:** 2026-04-05 | **Status:** Draft | **Owner:** Dako (@iDako7)

---

## Purpose

This document expands Phase 1 from `Implementation_Plan_high_level.md` into a concrete execution plan. Phase 1 is not a single build step. It has two distinct validation loops plus a handoff step into Phase 2:

- Phase 1a proves the orchestration plumbing works end-to-end.
- Phase 1b proves the agent reasons well enough to justify productization.
- Phase 1c packages the validated prompt and harness work for integration into the real application stack.

The goal of this phase is to validate the AI layer before investing in backend infrastructure, databases, SSE delivery, or frontend implementation.

---

## Phase 1a — Build the Harness

### Objective

Prove that the end-to-end orchestration loop works with the real model API, real tool definitions, and small but realistic seed data.

### What to Build

Create a Python harness that runs the full agent loop outside the production app:

- Explicit while-loop with tool dispatch against the real Claude API, either via OpenRouter or direct provider access
- Tool handlers backed by real seed data: Costco JSON plus approximately 15 curated recipes
- PCSV mappings for relevant ingredients
- Small substitution table for common ingredient swaps
- Schema coercion layer using Pydantic models for tool inputs and outputs
- Structured JSON result printed at the end of each run for inspection

### Goal

The plumbing works. Tool definitions are well-formed, the loop terminates correctly, the LLM calls tools in a sensible order, and the final structured output parses cleanly. Both core user stories should run end-to-end and return valid JSON.

### What This Validates

- `ADR-1`: single orchestration loop over framework abstraction
- `ADR-5`: six tools with LLM-controlled sequencing
- `ADR-6`: schema coercion hierarchy over re-prompting
- Tool definition quality and handler boundaries
- Whether the initial data model is sufficient to support realistic conversations

### Exit Criteria

- The harness can execute both representative user stories without manual intervention
- Tool calls are valid and correctly parsed
- The loop terminates within the expected iteration cap
- Output JSON can be parsed and inspected reliably
- Failures are understandable enough to drive prompt or tool-design iteration

---

## Phase 1b — Prompt Engineering Iteration

### Objective

Use the Phase 1a harness as a repeatable test bench to improve reasoning quality, not just technical correctness.

### Workflow

Iterate on the AI layer using real conversations:

- Refine the system prompt, including persona, rules, and tool instructions
- Run conversations through the harness and evaluate output quality
- Build a `promptfoo` evaluation suite from real conversation logs
- Test edge cases such as vague input and dietary restrictions
- Measure cost per conversation and compare candidate models for `OQ-3`

### Goal

The agent reasons well. PCSV analysis is accurate, recipe suggestions feel contextual, explanations are helpful, and the agent handles both primary user stories with consistently high-quality output.

### Why This Is a Separate Phase

Phase 1a validates mechanics. Phase 1b validates judgment. These are different workflows and should not be conflated:

- Phase 1a asks, "Does the loop work?"
- Phase 1b asks, "Does the agent make good decisions?"

This is where `promptfoo` belongs. It is not a post-prototype add-on. It is the main iteration tool for Phase 1b.

### What This Validates

- Prompt quality and instruction clarity
- Tool descriptions and sequencing guidance
- Data adequacy for realistic reasoning
- Model choice for structural reliability, latency, and cost
- Whether the agent behavior is strong enough to move into application integration

### Exit Criteria

- The prompt produces consistently useful responses across the main user stories
- Edge cases expose manageable gaps rather than architectural blockers
- `promptfoo` evals exist for the most important recurring conversation patterns
- Cost and model trade-offs are documented well enough to resolve `OQ-3`

---

## Phase 1c — Handoff to Phase 2

### Objective

Take the validated artifacts from Phases 1a and 1b and integrate them into the deployable product architecture.

### Handoff Inputs

- Validated system prompt
- Validated tool definitions
- Working orchestration harness
- Seed data and schemas refined during testing
- `promptfoo` eval fixtures and representative conversation cases
- Model selection decision or narrowed shortlist from `OQ-3`

### Transition Outcome

Take the validated prompts and validated harness and integrate them into the Phase 2 stack:

- FastAPI backend
- Real database layers
- SSE event delivery
- Frontend rendering of structured agent output

Phase 1 should reduce uncertainty before Phase 2 begins. By the time integration starts, the team should already know that the orchestration pattern, tool set, schema strategy, and prompt direction are viable.

---

## Deliverables By End of Phase 1

- A working Python harness for end-to-end agent execution
- A validated prompt and tool instruction set
- Small but realistic seed datasets for recipes, PCSV mappings, products, and substitutions
- Structured schemas for tool I/O and final output
- A `promptfoo` evaluation suite built from real conversation logs
- Evidence for model selection and cost trade-offs
- A clear integration package for Phase 2

---

## Out of Scope

- FastAPI application wiring
- PostgreSQL and SQLite production setup
- SSE implementation details
- Frontend UI implementation
- Production auth, deployment, caching, or scaling concerns

Those belong to Phase 2 or later. Phase 1 is strictly about validating the AI layer and its supporting data/tool design.

---

## References

- `Implementation_Plan_high_level.md`
- `ai-layer-architecture-v2.md`
- `architecture-spec-v2.md`
- `product-spec-v2.md`
