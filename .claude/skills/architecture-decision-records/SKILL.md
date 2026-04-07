---
name: architecture-decision-records
description: Capture architectural decisions as structured ADRs during coding sessions. Auto-detects decision moments, records context, alternatives considered, and rationale.
origin: ECC (adapted for SGA V2)
---

# Architecture Decision Records

Capture architectural decisions as they happen during coding sessions. Instead of decisions living only in conversation history, this skill produces structured ADR documents that live alongside the code.

## Existing ADR Location

This project stores ADRs inline within architecture docs (not in a separate `docs/adr/` directory):

- **ADR-1 through ADR-4:** `docs/ai-layer-architecture-v2.md` (orchestration loop, collect-then-emit, structured profile, two databases)
- **ADR-5 through ADR-7:** `docs/ai-layer-architecture-v2.md` (six tools, schema coercion, SSE)

New ADRs follow the same inline format within the relevant architecture doc, or in a new `docs/adr/` directory if the decision doesn't belong to an existing doc.

## When to Activate

- User explicitly says "let's record this decision" or "ADR this"
- User chooses between significant alternatives (framework, library, pattern, database, API design)
- User says "we decided to..." or "the reason we're doing X instead of Y is..."
- User asks "why did we choose X?" (read existing ADRs)
- During planning phases when architectural trade-offs are discussed

## ADR Format

Follow the format already established in this project:

```markdown
### ADR-N: [Decision title]

**Decision:** [What we're choosing]

**Context:** [What problem prompted this, 2-5 sentences]

**Why:** [Rationale for the choice]

**Alternatives considered:**
- *[Alternative 1]* — [why not chosen]
- *[Alternative 2]* — [why not chosen]

**Risk:** [What could go wrong and mitigation]
```

## Workflow

### Capturing a New ADR

1. **Check existing ADRs** — read `docs/ai-layer-architecture-v2.md` and `docs/architecture-spec-v2.md` for ADR-1 through ADR-7
2. **Number sequentially** — next ADR is ADR-8
3. **Identify the right location** — if the decision relates to the AI layer, add to `ai-layer-architecture-v2.md`. If it relates to system architecture, add to `architecture-spec-v2.md`. If neither fits, create `docs/adr/NNNN-decision-title.md`
4. **Draft the ADR** — use the format above
5. **Present to user** — wait for explicit approval before writing
6. **Check for conflicts** — flag if the new decision supersedes or conflicts with an existing ADR

### Reading Existing ADRs

When a user asks "why did we choose X?":

1. Search `docs/ai-layer-architecture-v2.md` and `docs/architecture-spec-v2.md` for relevant ADRs
2. Present the Context and Decision sections
3. If no match, respond: "No ADR found for that decision. Would you like to record one now?"

## Decision Detection Signals

**Explicit signals:**
- "Let's go with X"
- "We should use X instead of Y"
- "The trade-off is worth it because..."
- "Record this as an ADR"

**Implicit signals** (suggest recording — do not auto-create):
- Comparing two approaches and reaching a conclusion
- Making a database schema design choice with stated rationale
- Choosing between architectural patterns
- Deciding on authentication/authorization strategy

## What Makes a Good ADR

### Do
- Be specific — "Use SQLite for read-only KB" not "use a database"
- Record the why — the rationale matters more than the what
- Include rejected alternatives — future developers need to know what was considered
- State consequences honestly — every decision has trade-offs
- Keep it short — readable in 2 minutes

### Don't
- Record trivial decisions — variable naming doesn't need ADRs
- Write essays — if the context exceeds 10 lines, it's too long
- Omit alternatives — "we just picked it" is not valid rationale
- Backfill without marking it — note the original date if recording a past decision

## Integration with Other Agents

- **Architect agent:** Primary producer of ADRs — the architect evaluates trade-offs and generates ADRs as output
- **Planner agent:** When the planner proposes changes that affect system boundaries, suggest creating an ADR
- **Code reviewer agent:** Flag PRs that introduce architectural changes without a corresponding ADR
