---
name: Prompt engineering iteration patterns
description: Patterns learned from Phase 1b eval-driven prompt refinement — prohibition→workflow→quality bar arc, dual-grader value, assertion vs prompt fixes
type: feedback
---

When iterating on agent prompts via evals, follow the prohibition → workflow → quality bar arc:

1. **"Don't do X" is weaker than "when X happens, do Y."** Prohibitions make the agent refuse correctly but not recover helpfully. Always pair a constraint with an explicit recovery path — name the tools to call, the fallback behavior, and what the response should contain.

2. **Separate policy from mechanics.** Rules define *what* to do ("offer vegetarian alternatives"). Tool instructions define *how* ("call get_substitutions with reason=dietary, then search_recipes with compliant ingredients"). The agent needs both; without mechanics it follows policy but gets stuck on execution.

3. **Underspecified output quality is a prompt gap, not a model gap.** If the agent produces correct-but-shallow responses (3 meals for a week, "double it" instead of quantities, substitutes without flavor explanation), add explicit quality bars as one-sentence additions to existing rules.

**Why:** Discovered during Phase 1b eval iteration (29% → 86% pass rate in 3 rounds). All fixes were prompt-only — no code, schema, or data changes needed.

**How to apply:** When eval failures show the agent doing the right *kind* of thing but not well enough, diagnose which level is missing: prohibition (does it know what to avoid?), workflow (does it know what to do instead?), or quality bar (does it know what "good enough" looks like?). Fix at the right level rather than adding more prohibitions.
