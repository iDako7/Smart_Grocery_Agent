# Workflow Guide — Phase 2 Integration

**Date:** 2026-04-11 | **Status:** Active | **Owner:** Dako (@iDako7)

---

## Purpose

This document defines how each issue in `phase-2-integration-plan.md` is implemented. It covers the agent orchestration pattern, testing rules, and review process. Follow this for every issue.

---

## Per-Issue Orchestration

Claude Code Opus acts as the orchestrator within each session. It reads the issue scope, plans the work, delegates to specialized agents, and manages the workflow end-to-end.

```
Opus reads issue + specs
│
├── /plan → divide issue into tasks + test strategy
│   └── You confirm before implementation starts
│
├── Per task (parallel if tasks are independent):
│   ├── /tdd → RED (write tests) → GREEN (implement) → REFACTOR
│   │   └── if build breaks → build-error-resolver agent
│   └── /verify (per-task gate)
│       └── if fail → build-error-resolver → re-verify
│
├── /verify (integration gate — full codebase)
│   └── if fail → build-error-resolver → re-verify
│
├── For Phase B issues:
│   └── e2e-runner agent → write + run Playwright test for the user flow
│
├── /code-review (whole PR — reads full diff, not per-task fragments)
│   ├── APPROVE → proceed to PR
│   ├── REQUEST CHANGES → fix → re-verify → re-review
│   └── BLOCK → fix critical issues → re-verify → re-review
│
├── Create PR with description
│
├── You open new session → /code-review {PR number} → review + comments
│   └── Agent addresses comments → re-verify → re-review until approved
│
└── You verify (browser / curl) → merge
```

---

## Agent & Skill Reference

| Agent/Skill | When Opus Calls It | What It Does |
|-------------|-------------------|--------------|
| `/plan` | Start of issue | Creates implementation plan with tasks, test strategy. Waits for your confirmation. |
| `/tdd` | Each task from the plan | RED → GREEN → REFACTOR cycle. Tests written before implementation. 80%+ coverage. |
| `build-error-resolver` | When build or type check fails | Fixes build/type errors with minimal diffs. No refactoring. Gets the build green. |
| `/verify` | After each task + after all tasks | Runs build, type check, lint, tests. Reports pass/fail with file:line for errors. |
| `e2e-runner` | Phase B issues, after integration verify | Writes Playwright E2E tests. Uses semantic locators. Uploads artifacts. |
| `/code-review` | After all tasks pass verify | Reviews full diff. Findings by severity (CRITICAL/HIGH/MEDIUM/LOW). Verdict: APPROVE/REQUEST CHANGES/BLOCK. |

---

## Testing Rules

**Principle:** Default to integration tests. Unit tests only for pure logic. The previous implementation had too many unit tests that passed individually but missed wiring issues.

### Frontend

| Test Type | When to Write | Example |
|-----------|--------------|---------|
| **Integration** (primary) | Every user-visible behavior change | Render SavedMealPlanScreen → click x button → assert recipe removed from list |
| **Unit** (only for pure logic) | Utility functions, data transformations, complex reducers | `formatGroceryListAsText(items)` returns correct plain-text string |
| **Do NOT write** | Component render tests that just check props | "RecipeCard renders name" — covered by integration tests |

### Backend

| Test Type | When to Write | Example |
|-----------|--------------|---------|
| **Integration** (primary) | Every endpoint, every tool handler | POST `/session/{id}/grocery-list` with 3 items → returns 2 stores + Other section |
| **Unit** (only for pure logic) | Fuzzy matching scoring, prompt string assembly, grouping algorithms | `group_items_by_store(items, matches)` returns correct `GroceryStore[]` |
| **Do NOT write** | Simple CRUD wrappers | "get_user_profile returns a row" — covered by endpoint integration tests |

### Phase B: E2E

| Test Type | When to Write | Example |
|-----------|--------------|---------|
| **E2E (Playwright)** | One happy-path flow per Phase B issue | Type "BBQ for 8" → see PCV badges → see recipe cards → toggle pill → build list → see grocery screen |

### Test Strategy in /plan

Every `/plan` output must include a **Test Strategy** section listing:
1. Which tests to write (by name)
2. What type each test is (integration / unit / E2E)
3. One sentence: why that type, not another

This forces the decision at planning time, not during implementation.

---

## Verification Levels

| Level | When | What It Checks | Failure Action |
|-------|------|---------------|----------------|
| **Per-task** | After each /tdd task completes | `build + types + lint + tests` for affected area | `build-error-resolver` fixes, re-verify |
| **Integration** | After all tasks in the issue complete | Full codebase: `build + types + lint + all tests` | `build-error-resolver` fixes, re-verify |
| **E2E** | Phase B issues only, after integration verify | Playwright happy-path for the user flow | Fix failing assertions, re-run |
| **Code review** | After all verification passes | Full git diff: security, quality, patterns | Address review comments, re-verify, re-review |

---

## PR Review Process

Two sessions, separate context — the reviewer has no bias from having written the code.

**Implementation session:**
1. Opus implements all tasks
2. All verification passes
3. Opus creates PR with description

**Review session (you open a new Claude Code session):**
1. `/code-review {PR number}` — agent reads full diff, runs validation, posts findings
2. If REQUEST CHANGES — agent in implementation session fixes, re-verifies
3. Re-review until APPROVE
4. You verify manually (browser for frontend, curl for backend)
5. You merge

---

## Automation Boundaries

| Step | Automated? | Who Does It |
|------|-----------|-------------|
| /plan | No — you confirm | Interactive with Opus |
| /tdd implementation | Yes | Opus delegates to tdd-guide |
| /verify after each task | Yes | Opus runs automatically |
| /verify integration | Yes | Opus runs automatically |
| PR creation | Yes | Opus creates after verify passes |
| PR review | Semi — you spawn new session | Review agent in fresh session |
| Fix review comments | Yes | Opus in implementation session |
| Your verification | No — you do this | Browser / curl |
| Merge | No — you decide | Manual |

---

## Modification History

| Date | Version | Changes |
|:-----|:--------|:--------|
| 2026-04-11 | v1 | Initial: orchestration pattern, agent table, testing rules, verification levels, PR review process. |
