# Workflow Guide v2 — Phase 2 Integration

**Date:** 2026-04-12 | **Status:** Active | **Owner:** Dako (@iDako7) | **Supersedes:** `workflow-guide.md` (v1)

---

## Purpose

How each issue in `phase-2-integration-plan.md` is implemented. Covers agent orchestration, the empty-shell TDD rule, testing requirements, and review. Follow this for every issue.

**What changed from v1:** target-shape agent selection, empty-shell TDD rule, mock-data ban, state-machine test requirement, UAT confirmation clause. The orchestration skeleton is unchanged.

---

## Orchestrator Rules

Opus is a **judge and commander — never a competitor.** It reads, plans, delegates, and verifies, but does not implement.

- **MUST NOT** use `Edit`/`Write`/`Bash` to modify source files. All implementation goes through sub-agents.
- **MAY** use `Read`, `Grep`, `Glob`, read-only `Bash`, and `/verify` directly — these are observation.
- **MAY** create PRs and write PR descriptions — these are orchestration artifacts.

---

## Agent Selection — by target shape, not task type

| Target shape | Use | Why |
|---|---|---|
| Empty file or blank function + written spec | `/tdd` | Red→green loop works: the failing test genuinely fails. |
| Existing code needing new behavior | `/plan` → implementer → `/code-review` | TDD against live code produces characterization tests that lock in bugs. |
| Existing code to be deleted | implementer directly, no TDD | Nothing to test. Verify via build + typecheck + manual walkthrough. |
| Build/type errors | `build-error-resolver` | Minimal diffs, no refactoring. |
| Phase B happy-path E2E | `e2e-runner` | Playwright journeys. |
| Multi-file research | `Explore` subagent | Read-only investigation. |

**Load-bearing rule:** TDD is only appropriate when the target is empty. If code already exists, delete it first (creating an empty shell) or use a non-TDD agent. Violating this rule is how PR #32/#33 shipped green tests that locked in 9 UAT bugs.

---

## Per-Issue Orchestration

```
Opus reads issue + specs
│
├── /plan → tasks + test strategy + target-shape check
│   └── You confirm before implementation
│
├── Per task:
│   ├── If target is empty shell → /tdd (RED → GREEN → REFACTOR)
│   ├── If target is existing code → planner + implementer + /code-review
│   ├── If task is deletion → implementer directly
│   └── /verify after each task → build-error-resolver on fail
│
├── /verify (integration gate — full codebase)
├── Phase B only: e2e-runner writes Playwright happy path
├── code-reviewer (mandatory pre-PR gate, all severities)
├── UAT confirmation (you, in browser, one-line result in PR description)
└── Create PR → you merge
```

---

## Testing Rules

**Principle:** default to integration tests. Unit tests only for pure logic. Every screen with a `screenState` union is tested in each state it reaches in real use.

### Frontend

| Test type | When | Example |
|---|---|---|
| **Integration** (primary) | Every user-visible behavior change | Render screen → simulate action → assert DOM content (not just `testid` presence) |
| **State-machine** (required for screens) | Any screen with a `screenState` union | Render in `idle`, `loading`, `streaming`, `complete`, `error` — assert each state shows the right UI |
| **Unit** (narrow) | Pure utilities, reducers, data transforms | `formatGroceryListAsText(items)` → plain-text output |
| **Do NOT write** | Prop-check render tests, tests that render a component without a real session provider | "RecipeCard renders name" — covered by integration |

### Backend

| Test type | When | Example |
|---|---|---|
| **Integration** (primary) | Every endpoint, every tool handler | POST `/session/{id}/grocery-list` → returns grouped stores |
| **Unit** (narrow) | Fuzzy scoring, prompt assembly, grouping | `group_items_by_store(items, matches)` |
| **Do NOT write** | Simple CRUD wrappers | Covered by endpoint integration |

### Phase B E2E

| Test type | When | Example |
|---|---|---|
| **E2E (Playwright)** | One happy-path per Phase B issue | "BBQ for 8" → PCV → cards → pill → list → grocery |

### Test Strategy in /plan

Every `/plan` output must list:
1. Tests to write (by name)
2. Type (integration / state-machine / unit / E2E)
3. One sentence: why that type

---

## Mock Data Policy

**No scenario/mock data in production code paths.** The Stage 2 `scenario-context` system was removed in Issue #1. Do not reintroduce fallback patterns like `?? scenario.*`, `|| scenario.*`, or `useScenario()` in production components.

**Preview data:** if a screen needs example content for design review, gate it behind an **explicit prop or env flag**, never a fallback chain. Fallbacks silently mask missing real-data paths and make tests lie.

**Fallback-branch detection (code-review rule):** any `?? X`, `|| default`, or `if (!data) return MOCK` in a component is a code smell. During review, require one of: (a) removed, (b) gated behind an explicit preview flag, (c) two tests that force each branch and assert different rendered content.

---

## UAT Confirmation (mandatory before PR)

Before opening any PR that touches a user-facing screen, the implementer must:

1. Run the app locally against a realistic backend (real API or mock with SSE delays mimicking prod timing).
2. Walk the user journey the issue implements — idle → loading → streaming → complete.
3. Paste a one-line UAT result into the PR description (e.g., *"UAT: Home → Clarify → Recipes → Grocery walked with real backend, empty states render, no scenario data visible."*).

No PR merges without this line. A code-reviewer approval is not a substitute — reviewers read diffs, not screens.

---

## Verification Levels

| Level | When | Checks | On fail |
|---|---|---|---|
| **Per-task** | After each implementation task | `build + types + lint + affected tests` | `build-error-resolver` |
| **Integration** | After all tasks complete | Full codebase: `build + types + lint + all tests` | `build-error-resolver` |
| **E2E** | Phase B issues only | Playwright happy-path | Fix assertions, re-run |
| **Code review** | After integration passes | Full git diff, all severities | Delegate fixes, re-verify, re-review |
| **UAT** | After code review passes | Manual journey walk in browser | Fix or file follow-up issue |

---

## Modification History

| Date | Version | Changes |
|:---|:---|:---|
| 2026-04-11 | v1 | Initial: orchestration, agent table, testing rules, verification, PR review. |
| 2026-04-12 | v2 | Target-shape agent selection; empty-shell TDD rule; mock data policy; state-machine tests required; UAT confirmation clause. Root cause: PR #32/#33 UAT — see `docs/02-notes/pr32-pr33-uat-investigation.md`. |
