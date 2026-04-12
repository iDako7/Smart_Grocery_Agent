# Workflow Guide — Phase 2 Integration

**Date:** 2026-04-11 | **Status:** Active | **Owner:** Dako (@iDako7)

---

## Purpose

This document defines how each issue in `phase-2-integration-plan.md` is implemented. It covers the agent orchestration pattern, testing rules, and review process. Follow this for every issue.

---

## Orchestrator Rules

Opus is a **judge and commander — never a competitor.** It reads, plans, delegates, and verifies, but does not implement.

- **MUST NOT** use `Edit`, `Write`, or `Bash` to modify source files. All implementation goes through sub-agents (`/tdd`, `build-error-resolver`, `e2e-runner`).
- **MAY** use `Read`, `Grep`, `Glob`, `Bash` (read-only commands), and `/verify` directly — these are observation, not implementation.
- **MAY** create PRs and write PR descriptions — these are orchestration artifacts, not source code.
- If Opus catches itself about to edit a file, it must stop and delegate to the appropriate agent instead.

---

## Per-Issue Orchestration

```
Opus reads issue + specs
│
├── /plan → divide issue into tasks + test strategy
│   └── You confirm before implementation starts
│
├── Per task (parallel if tasks are independent):
│   ├── /tdd agent → RED (write tests) → GREEN (implement) → REFACTOR
│   │   Input: task description, file paths, contract refs, acceptance criteria, test type
│   │   Output: pass/fail, changed files, coverage
│   └── /verify (Opus runs directly — read-only checks)
│       └── if fail → Opus spawns build-error-resolver → re-verify
│
├── /verify (integration gate — full codebase)
│   └── if fail → Opus spawns build-error-resolver → re-verify
│
├── For Phase B issues:
│   └── e2e-runner agent → write + run Playwright test for the user flow
│
├── code-reviewer agent (mandatory — all severities, no exceptions)
│   ├── APPROVE → proceed to PR
│   ├── REQUEST CHANGES → Opus delegates fix to /tdd → re-verify → re-review
│   └── BLOCK → Opus delegates fix to /tdd → re-verify → re-review
│
├── Create PR with description
│
└── You verify (browser / curl) → merge
```

---

## Agent & Skill Reference

| Agent/Skill | Who Runs It | What It Does |
|-------------|------------|--------------|
| `/plan` | Opus directly | Creates implementation plan with tasks + test strategy. Waits for your confirmation. |
| `/tdd` (agent) | Opus spawns | RED → GREEN → REFACTOR. Opus passes: task desc, file paths, contract refs, acceptance criteria, test type. |
| `build-error-resolver` (agent) | Opus spawns | Fixes build/type errors only. Minimal diffs. Opus spawns when `/verify` fails. |
| `/verify` (skill) | Opus directly | Runs build, type check, lint, tests. Read-only — no source changes. Reports pass/fail with file:line. |
| `e2e-runner` (agent) | Opus spawns | Phase B only. Writes Playwright E2E tests after integration verify passes. |
| `code-reviewer` (agent) | Opus spawns | Mandatory pre-PR gate. Reviews full git diff, all severities. Verdict: APPROVE/REQUEST CHANGES/BLOCK. |

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
| **Code review** | After all verification passes | Full git diff: all severities, mandatory | Opus delegates fixes to /tdd, re-verify, re-review |

---

## PR Review Process

Single session — code-reviewer agent acts as mandatory gate before PR creation.

1. All tasks complete, integration `/verify` passes
2. Opus spawns `code-reviewer` agent on full git diff — all severities, no exceptions
3. If APPROVE → Opus creates PR
4. If REQUEST CHANGES or BLOCK → Opus delegates fixes to `/tdd` → re-verify → re-review until APPROVE
5. You verify manually (browser for frontend, curl for backend)
6. You merge

---

## Automation Boundaries

| Step | Automated? | Who Does It |
|------|-----------|-------------|
| /plan | No — you confirm | Opus directly |
| /tdd implementation | Yes — delegated | Opus spawns tdd-guide agent |
| /verify after each task | Yes | Opus runs directly (read-only) |
| /verify integration | Yes | Opus runs directly (read-only) |
| build-error-resolver | Yes — on verify fail | Opus spawns agent |
| code-reviewer (pre-PR gate) | Yes — mandatory | Opus spawns agent, all severities |
| PR creation | Yes | Opus creates after reviewer approves |
| Fix review findings | Yes — delegated | Opus spawns tdd-guide agent |
| Your verification | No — you do this | Browser / curl |
| Merge | No — you decide | Manual |

---

## Modification History

| Date | Version | Changes |
|:-----|:--------|:--------|
| 2026-04-11 | v1 | Initial: orchestration pattern, agent table, testing rules, verification levels, PR review process. |
