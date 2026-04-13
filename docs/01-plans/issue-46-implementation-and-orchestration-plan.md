## Implementation Plan + Orchestration Plan — Issue #46

*Archived for reference on 2026-04-13 after PR #53 (prototype archival) merged. This captures the execution plan agreed before PR 1 starts.*

---

# Part 1 — Implementation Plan

## PR 1 — Contract changes

**Base:** `main` (post-PR-0 merge). **Branch:** `contracts/clarify-turn`. **Target:** `main`.

### Why standalone
`contracts/tool_schemas.py` is frozen per repo protocol. Adding a tool means a PR to `main` with a `CHANGELOG.md` entry before any code can import the new types. Standalone isolates the hardest constraint (unfreeze) into a low-risk additive diff.

### Tasks

| # | File | Change |
|---|---|---|
| 1.1 | `contracts/tool_schemas.py` | Add `ClarifyOption`, `ClarifyQuestion`, `ClarifyTurnPayload` Pydantic models. |
| 1.2 | `contracts/tool_schemas.py` | Add `emit_clarify_turn` entry to `TOOLS` list. Update header comment from `frozen` to `frozen (additive changes permitted per CHANGELOG 2026-04-XX)`. |
| 1.3 | `contracts/sse_events.py` | Add `ClarifyTurnEvent` and update `SSEEvent` discriminated union. Import `ClarifyQuestion` from `tool_schemas`. |
| 1.4 | `contracts/CHANGELOG.md` | Dated entry noting the additive unfreeze + new event + `explanation` event no longer emitted on Clarify screen (replaced by `clarify_turn`). |

### Test strategy

| Test | Type | Why |
|---|---|---|
| `test_clarify_turn_payload_roundtrip` — roundtrip with 0/1/2/3 questions, single/multi modes, is_exclusive true/false | Contract unit | Pure schema validation, catches Pydantic misconfiguration before consumers depend on it. |
| `test_clarify_turn_payload_rejects_too_many_questions` — >3 questions raises validation error | Contract unit | Hard cap lives in the contract, not just the prompt. |
| `test_clarify_turn_event_in_sse_union` — JSON payload with `event_type: "clarify_turn"` parses via SSEEvent union | Contract unit | Discriminated union must route correctly; regressions silently drop events. |
| `test_emit_clarify_turn_in_tools_list` — `emit_clarify_turn` present in TOOLS with correct schema | Contract unit | Catches drift between Pydantic model and hand-written TOOLS dict. |

**No integration tests in PR 1** — backend can't import the new types until PR 1 merges.

### Risks

| Risk | Mitigation |
|---|---|
| Reviewer objects to unfreezing `tool_schemas.py` mid-Phase-2 | Additive-only, documented in CHANGELOG; `sse_events.py` precedent supports it. |
| `ClarifyQuestion` location debate (`tool_schemas.py` vs `sse_events.py`) | Place in `tool_schemas.py`; re-import from `sse_events.py`. One-line move if reviewer prefers. |
| Generated JSON schema doesn't match OpenRouter function-calling format | Follow the other 7 tools' exact pattern. Test 4 catches drift. |

### Gate to PR 2
All 4 contract tests green → code-reviewer → user merges PR 1 → worktree rebases onto updated main.

---

## PR 2 — Issue #46 feature

**Base:** `main` (post-PR-1). **Branch:** `worktree-issue-46-dynamic-clarify-questions`. **Draft PR opened after Phase 2a lands.**

### Commit map
```
commit 1  Phase 2a — Cleanup (delete chip code + rule #9 + chat-input wiring)
commit 2  Phase 2b — Backend emit_clarify_turn tool handler + orchestrator dispatch
commit 3  Phase 2c — Orchestrator terminal recognition + SSE emission + rule #9 rewrite + tests
commit 4  Phase 2d — Frontend ScreenData.clarifyTurn + session context wiring
commit 5  Phase 2e — TDD dynamic chip section (ChipQuestion component)
commit 6  Phase 2f — Loading spinner + chat input gating + state-machine tests
commit 7  Phase 2g — Integration fixes from /verify + code-reviewer findings
```

### Phase 2a — Cleanup (commit 1)

**Target shape:** deletion. No TDD.

| # | File | Delete |
|---|---|---|
| 2a.1 | `src/frontend/src/screens/ClarifyScreen.tsx` | `COOKING_SETUP_OPTIONS`, `DIETARY_OPTIONS`, `INDIVIDUAL_SETUP_OPTIONS`; `selectedSetup`/`selectedDiet` state; `toggleSetup`/`toggleDiet`; static chip `<div>` blocks; `handleLooksGood`'s hardcoded `Setup:`/`Dietary:` clauses; 3-bar loading skeleton; always-on ChatInput wiring |
| 2a.2 | `src/frontend/**/*.test.{ts,tsx}` | Any test asserting chip presence/text, toggle handler behavior, or hardcoded message format |
| 2a.3 | `src/ai/prompt.py` | Delete rule #9 (replacement written in Phase 2c) |
| 2a.4 | `tests/backend/**/*.py` and `evals/` | Any test asserting current `response_text` shape on Clarify screen (excluding `archive/prototype/`) |

No new tests. `/verify` gates on build + types + lint staying green.

### Phase 2b — Backend tool handler (commit 2)

**Target shape:** existing code, new behavior.

| # | File | Change |
|---|---|---|
| 2b.1 | `src/ai/tools/emit_clarify_turn.py` (new) | Handler that validates via `ClarifyTurnPayload` and returns unchanged. No DB, kb, or side effects. |
| 2b.2 | `src/ai/tools/__init__.py` | Export handler. |
| 2b.3 | `src/ai/orchestrator.py` | Register in `_TOOL_REGISTRY` as `("emit_clarify_turn", ClarifyTurnPayload, "none")`. Add dispatch branch. Add `"none"` as third db_type alongside `"kb"`/`"pg"`. |

| Test | Type | Why |
|---|---|---|
| `test_emit_clarify_turn_handler_validates_payload` | Unit | Pure data transformation, unit is right granularity. |
| `test_emit_clarify_turn_handler_empty_questions` | Unit | "0 questions" case must be representable. |
| `test_orchestrator_dispatches_emit_clarify_turn` | Integration (orchestrator) | Exercises registry + dispatch routing without real LLM. |

### Phase 2c — Terminal recognition + prompt rewrite (commit 3)

**Target shape:** existing code, new behavior.

| # | File | Change |
|---|---|---|
| 2c.1 | `src/ai/orchestrator.py` | After successful dispatch, if tool name is `emit_clarify_turn`: stash payload on result, end loop. Agent never produces post-tool response_text on Clarify. |
| 2c.2 | `src/ai/types.py` | Add `clarify_turn: ClarifyTurnPayload \| None = None` to `AgentResult`. |
| 2c.3 | `src/backend/api/sessions.py` (or `src/ai/sse.py`) | When `clarify_turn is not None`, emit `ClarifyTurnEvent`, suppress `ExplanationEvent` for that turn. Other screens unchanged. |
| 2c.4 | `src/ai/prompt.py` | Rewrite rule #9: "On Clarify screen, final action MUST be `emit_clarify_turn(explanation, questions)`. `explanation` ≤30 words, plain text, one directional sentence. `questions` max 3; may be 0; must materially affect recipe recommendations; skip any already in profile; new users with empty profile usually asked about dietary/allergy if not stated in message." |

| Test | Type | Why |
|---|---|---|
| `test_orchestrator_terminates_on_emit_clarify_turn` | Integration | Terminal-tool contract is core new behavior. |
| `test_chat_endpoint_emits_clarify_turn_event_not_explanation` | Integration (API) | Validates "replaces explanation on Clarify" at HTTP boundary. |
| `test_chat_endpoint_emits_explanation_on_non_clarify_screen` | Integration (API) | Regression guard for Home/Recipes/Grocery flows. |
| `test_rule_9_canonical_a_vague_empty_profile` | Integration (LLM-in-loop) | Prompt behavior needs real LLM — nightly CI. |
| `test_rule_9_canonical_b_specific_dietary_stated` | Integration (LLM-in-loop) | Profile-aware skip verification. |
| `test_rule_9_canonical_c_vague_full_profile` | Integration (LLM-in-loop) | Profile skip is input-invariant. |

**Risk — LLM sometimes fails to call the tool:** consider `tool_choice: "required"` for Clarify screen in orchestrator; planner to assess.

### Phase 2d — Frontend type + session context (commit 4)

**Target shape:** existing code, new behavior.

| # | File | Change |
|---|---|---|
| 2d.1 | `src/frontend/src/types/sse.ts` | Add TS types for `ClarifyTurnEvent`, `ClarifyQuestion`, `ClarifyOption` mirroring Pydantic. |
| 2d.2 | `src/frontend/src/context/session-context.tsx` | Add `clarifyTurn: { explanation, questions } \| null` to `ScreenData`. Handle `clarify_turn` event in reducer. |
| 2d.3 | Same file | Remove old `explanation` handling on Clarify path; keep for other screens (introduce per-screen branch if needed). |

| Test | Type | Why |
|---|---|---|
| `test_session_reducer_clarify_turn_event` | Unit (reducer) | Pure function. |
| `test_session_reducer_explanation_event_on_home_screen_still_works` | Unit (reducer) | Regression guard. |

### Phase 2e — TDD dynamic chip section (commit 5)

**Target shape:** empty shell (after 2a deleted old chips). Use `/tdd-workflow`.

| # | File | Change |
|---|---|---|
| 2e.1 | `src/frontend/src/components/chip-question.tsx` (new) | Props: `question`, `selected`, `onChange`. Handles `single`/`multi` + per-option `is_exclusive`. |
| 2e.2 | `ClarifyScreen.tsx` | Render one `<ChipQuestion>` per question. Track selection as `Record<questionId, string[]>`. |
| 2e.3 | `ClarifyScreen.tsx` | Rebuild `handleLooksGood`: build message from dynamic question text + selections. |

| Test | Type | Why |
|---|---|---|
| `test_chip_question_single_mode_selecting_b_deselects_a` | Integration (component) | Core single semantic. |
| `test_chip_question_multi_mode_a_and_b_both_selectable` | Integration (component) | Core multi semantic. |
| `test_chip_question_multi_mode_exclusive_option_clears_others` | Integration (component) | "None" → clear-all case. |
| `test_chip_question_multi_mode_selecting_non_exclusive_clears_exclusive` | Integration (component) | Inverse direction. |
| `test_clarify_screen_renders_questions_from_clarify_turn` | Integration (screen) | Context → DOM binding. |
| `test_clarify_screen_looks_good_builds_dynamic_message` | Integration (screen) | Replaces hardcoded message builder. |

### Phase 2f — Loading spinner + chat input gating (commit 6)

**Target shape:** existing code, new behavior (ClarifyScreen just rebuilt in 2e).

| # | File | Change |
|---|---|---|
| 2f.1 | `ClarifyScreen.tsx` | During `loading`/`streaming`: hide all clarify card content except centered spinner + "Checking your ingredients for balance…". Nav, step progress, gradients, footer remain. |
| 2f.2 | `ChatInput` in ClarifyScreen | Disable when `screenState !== "complete"`. Add `disabled` prop if missing. |
| 2f.3 | `ClarifyScreen.tsx` | "Looks good" CTA hidden/disabled until `complete`. |

| Test | Type | Why |
|---|---|---|
| `test_clarify_screen_state_idle` | State-machine | Required per workflow-guide. |
| `test_clarify_screen_state_loading_shows_spinner_only` | State-machine | Whole point of layout change. |
| `test_clarify_screen_state_streaming_still_shows_spinner` | State-machine | Same as loading. |
| `test_clarify_screen_state_complete_shows_all_content` | State-machine | Atomic reveal contract. |
| `test_clarify_screen_state_error_shows_error_banner_no_chips` | State-machine | Fallback path. |
| `test_clarify_screen_chat_input_disabled_during_loading` | Integration | Gating requirement. |
| `test_clarify_screen_chat_input_enabled_on_complete` | Integration | Inverse gate. |
| `test_clarify_screen_fallback_missing_clarify_turn` | Integration | Paranoid guard that deleted constants never resurface. |

### Phase 2g — Integration + review + UAT (commit 7 + merge)

1. `/verify` full codebase (integration gate)
2. Fix failures via `build-error-resolver` if needed
3. Flip draft PR to ready-for-review
4. Spawn `code-reviewer` sub-agent on full PR 2 diff
5. Fix review findings via `/tdd-workflow` sub-agent (new commit per round, never amend)
6. Re-verify + re-review loop
7. **STOP for manual UAT** — user walks flow in browser, sends 3 canonical messages
8. **User writes UAT confirmation line** in PR description
9. User merges PR 2

---

## Cross-cutting risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| PR 1 contract review delays | Medium | Trivially small PR, should merge same-day |
| LLM canonical tests flaky on CI | Medium | Nightly-only, tolerant assertions |
| Terminal-tool change regresses other screens | Low | Explicit `test_chat_endpoint_emits_explanation_on_non_clarify_screen` |
| Phase 2d reducer refactor scope creeps | Medium | Sub-agent escalates before expanding |
| Frontend tests green but UI broken | Medium | Phase 2f requires in-browser walk as DoD + final UAT |
| Rebase conflicts after PR 1 | Low | PR 1 touches only `contracts/` |

---

## Dependencies

```
PR 0 ──merges──► PR 1 ──merges──► PR 2 Phase 2a ──► 2b ──► 2c ──► 2d ──► 2e ──► 2f ──► 2g ──► merges
 │                │                                                                          │
 │                │                                                                          ▼
 └── orthogonal ──┴─ blocks all of PR 2 ──────────────────────────── issue #46 closed
```

**Hard dependencies:**
- PR 1 merges before Phase 2b and 2d (imports the new types)
- Phase 2a completes before Phase 2e (TDD needs empty shell)
- Phase 2b completes before Phase 2c (terminal recognition uses handler)
- Phase 2d completes before Phase 2e (ChipQuestion needs TS types)
- Phase 2e completes before Phase 2f

---

# Part 2 — Orchestration Plan

## Opus role (orchestrator)

- **Observation only** on source: `Read`, `Grep`, `Glob`, `/verify`. Never `Edit`/`Write`/`Bash` on source files.
- **Allowed direct actions:** read files, run `/verify`, read-only git commands, GitHub operations (via `gh` CLI per user preference), `git push`.
- **Delegation contract:** each task below names a specific agent type and model. Opus spawns with self-contained prompt, waits for report, runs `/verify`, escalates or continues.
- **Stop points:** before PR 1 merge, before Phase 2a starts, before PR 2 flips from draft, before PR 2 merge.

## Per-phase orchestration

### PR 1 — Contracts

| Phase | Target shape | Agent | Model |
|---|---|---|---|
| 1.1–1.4 schemas + TOOLS + event + CHANGELOG | Existing code, additive | general-purpose sub-agent | Sonnet |
| PR creation | — | Opus → `gh pr create` | — |
| Post-PR review | — | `code-reviewer` sub-agent | Sonnet |
| Fix review findings | Existing code, new behavior | `tdd-workflow` sub-agent | Sonnet |
| Re-verify + re-review loop | — | Opus → `/verify` | — |
| Merge | — | **User** after confirming | — |
| Rebase worktree | — | Opus → `git fetch + rebase` | — |

### PR 2 — Issue #46 feature

PR 2 opens as **draft PR** after Phase 2a commit lands. Each subsequent phase lands as a new commit on the same branch. Flip to ready-for-review only after 2g `/verify` green.

| Phase | Target shape | Agent | Model | Why |
|---|---|---|---|---|
| **2a** Cleanup | Deletion | implementer sub-agent, no TDD | Sonnet | Workflow-guide: deletion skips TDD |
| Open draft PR | — | Opus → `gh pr create --draft` | — | — |
| **2b** Backend tool handler | Existing code, new behavior | planner → implementer | Sonnet | No empty shell (handler trivial) |
| **2c** Terminal recognition + prompt | Existing code, new behavior | planner → implementer | Sonnet | Long pole is LLM tests |
| **2d** Session context | Existing code, new behavior | planner → implementer | Sonnet | Reducer needs planner to check patterns |
| **2e** Dynamic chip section | **Empty shell** (after 2a) | `/tdd-workflow` sub-agent | Sonnet | Workflow-guide: empty shell → TDD |
| **2f** Spinner + gating + tests | Existing code, new behavior | planner → implementer + in-browser walk | Sonnet | Not empty after 2e; TDD would lock in 2e structure |
| **2g.1** Integration `/verify` | — | Opus → `/verify` | — | — |
| **2g.2** Fix `/verify` failures | Build/type errors | `build-error-resolver` sub-agent | Sonnet | Minimal-diff fixes only |
| **2g.3** Flip draft → ready | — | Opus → `gh pr ready` | — | — |
| **2g.4** Post-PR code review | — | `code-reviewer` sub-agent | Sonnet | **After PR creation, never before** |
| **2g.5** Fix review findings | Existing code, new behavior | `tdd-workflow` sub-agent | Sonnet | Per user rule: tdd-workflow for review fixes |
| **2g.6** Re-verify + re-review loop | — | Opus → `/verify` + re-spawn reviewer | — | — |
| **2g.7** STOP for manual UAT | — | **User** | — | Browser walk, 3 canonical messages |
| **2g.8** UAT confirmation line | — | **User writes it** | — | Per `feedback_uat_line_author.md` |
| **2g.9** Merge | — | **User** after confirming | — | — |

## Cross-phase rules

### `/verify` cadence
- After every sub-agent task, before next delegation
- At integration gate (2g.1), full codebase
- Failure → `build-error-resolver`, never continue on red

### Code review placement
- **After PR creation, not before**
- Fixes via `tdd-workflow` sub-agent, not generic implementer
- Loop until clean or explicitly deferred with rationale in PR

### Stop-for-confirmation points
1. Before spawning PR 1 sub-agent (plan approval — DONE)
2. Before merging PR 1 (user merges)
3. Before spawning Phase 2a (confirm PR 1 merged + rebase complete)
4. Before flipping PR 2 to ready-for-review (integration gate status)
5. Before merging PR 2 (UAT + confirmation line + confirm)

### Hard rules
- No mock/scenario data in production code
- No `/tdd` on existing code — only Phase 2e qualifies (post-Phase-2a empty shell)
- No features/refactors/cleanup beyond the stated task per phase
- No backwards-compatibility shims for impossible scenarios
- Ask before destructive or shared-state actions
- Stop and ask on unexpected state

### Sub-agent prompt contract
Every delegation prompt must contain: mission, context, exact file+change list, test requirements (name+type+why), hard constraints, verification checklist, report format, escalation trigger.

---

*See issue body for the feature spec. See workflow-guide-v2.md for the agent-selection rules referenced throughout.*
