---
description: Analyze system architecture, evaluate trade-offs, and produce ADRs. Use for system-level design decisions, not feature-level planning.
---

# Architect Command

This command invokes the **architect** agent for system-level architectural analysis and decision-making.

## What This Command Does

1. **Review current architecture** — read existing docs and ADRs
2. **Analyze trade-offs** — evaluate competing approaches with pros/cons
3. **Produce ADRs** — document decisions in the project's established format
4. **Wait for confirmation** — MUST receive user approval before finalizing

## When to Use

Use `/architect` when:
- Designing how components interact across the system
- Evaluating whether to change an existing architectural decision
- Adding a new component that affects system boundaries
- Making trade-off decisions that span multiple layers (frontend, backend, databases, LLM)

Use `/plan` instead when:
- Implementing a specific feature step by step
- Breaking down a known task into phases with file paths
- The system shape is already decided and you need an execution plan

## How It Works

The architect agent will:

1. **Read project docs** — architecture spec, AI layer architecture, product spec, implementation plan
2. **Check existing ADRs** — ADR-1 through ADR-7 for conflicts or relevant context
3. **Analyze the question** — evaluate options against project constraints and phase boundaries
4. **Present recommendation** — with trade-off analysis and formal ADR if significant
5. **Wait for confirmation** — before finalizing any decision

## Example Usage

```
User: /architect Should we add Redis caching for KB queries?

Agent (architect):
# Architecture Analysis: KB Query Caching

## Context
KB queries hit SQLite (read-only, local file). Question is whether
adding Redis improves performance enough to justify the complexity.

## Analysis
- SQLite reads are already fast (~1ms for indexed queries)
- Adding Redis means a new infrastructure dependency
- Phase 2 targets a single VPS with Docker Compose
- No usage data yet to identify actual bottlenecks

## Recommendation
**Do not add Redis in Phase 2.** SQLite's read performance is sufficient
for validation. This is a Phase 3 decision that should be driven by
real latency data from production usage.

This aligns with:
- ADR-1 (no framework abstraction — keep it simple)
- ADR-4 (two-database split — SQLite is already optimized for reads)
- Implementation plan (Phase 3: "optimize with evidence")

## Impact
No changes needed. Revisit when Phase 2 usage data shows KB query
latency as a bottleneck.

**WAITING FOR CONFIRMATION**: Agree with this assessment? (yes/no/modify)
```

## Integration with Other Commands

- Use `/architect` first for system-level decisions, then `/plan` to implement
- Use `/code-review` after implementation to verify architectural alignment
- Use `/tdd` to implement with test-driven development

## Related Agents

This command invokes the `architect` agent.
Source file: `agents/architect.md`
