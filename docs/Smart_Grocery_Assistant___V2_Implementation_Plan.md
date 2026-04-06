# Smart Grocery Assistant — V2 Implementation Plan

**Date:** 2026-04-03 | **Status:** Active | **Owner:** Dako (@iDako7)

------

## Context

V1 built the AI service as six separate REST endpoints, each with an isolated prompt. This revealed three fundamental issues: the system mixed LLM responsibilities with Python logic (e.g., requiring booleans from generated content), related endpoints like clarify and suggest couldn't share conversational context, and each prompt was unique with no modular structure for user profile handling. V2 replaces this architecture entirely.

## Architecture Decision

V2's AI layer is a **single conversational agent with tool-use**, not a collection of REST endpoints or a RAG pipeline. The agent receives the user's freeform input, decides which tools to call (KB recipe search, PCSV gap analysis, store lookup), in what order, and how many times — adapting its workflow to each conversation rather than following a hardcoded sequence. This eliminates the rigid endpoint routing of V1, where the client had to orchestrate calls between separate endpoints that couldn't share context.

## Phase Plan

### Phase 1 — Prove the Agent Works

**Goal:** Validate that the agent's reasoning (PCSV analysis, recipe matching, waste-aware suggestions) delivers real value through actual conversations.

**Scope:** Build a Claude artifact that calls the real Claude API with the product spec's logic embedded as a system prompt and tool definitions. Tools return mock KB data. Have real conversations to test the agent's decision-making, then refine the system prompt and tool designs based on what fails. Build promptfoo evals from real conversation logs.

**Output:** A validated system prompt, tool definitions, and eval fixtures.

**Not in scope:** Backend infrastructure, database, deployment.

### Phase 2 — Minimum Backend

**Goal:** Ship a deployable app that real users in Vancouver can use.

**Scope:** One FastAPI service with a `/chat` endpoint, tool-use enabled via OpenRouter, SQLite knowledge base (recipes, PCSV mappings, store data), PostgreSQL for conversation sessions and user profiles (dietary restrictions, preferred cuisines, disliked ingredients), and a frontend that renders the agent's structured output as the polished UI (PCSV charts, recipe cards, store-organized checklists). The agent reads the user profile on every call and updates it during conversation via a dedicated tool.

**Output:** A working product end-to-end.

**Not in scope:** Caching, model routing, rate limiting, queue systems, microservice separation.

### Phase 3 — Optimize with Evidence

**Goal:** Improve performance, cost, and reliability based on real usage data.

**Scope:** Determined by what Phase 2 reveals — likely includes progressive SSE streaming (emitting typed events during the tool-use loop instead of after), cache layers for frequent KB queries, model tier routing for simple vs. complex turns, automated user profile extraction from conversation history, and scaling infrastructure. Decisions are made from evidence (usage patterns, latency data, cost breakdowns), not speculation.

**Output:** A production-hardened system.

## References

- **Product spec:** `product-spec-v2.md` — full product vision, user stories, intelligence layer design
- **Architecture spec:** `architecture-spec-v2.md` — system architecture and design decisions
- **AI layer architecture:** `ai-layer-architecture-v2.md` — agent internals and ADRs
- **Agent architecture patterns:** [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- **Tool design guide:** [Anthropic — Writing Effective Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)