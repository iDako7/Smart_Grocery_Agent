# Open Questions

## OQ-WT2-01: `session_update` SSE event

**Status:** Deferred to Stage 4 integration
**Date:** 2026-04-09

After the orchestration loop completes, emit the new screen state so the frontend can update its state machine without a separate `GET /session/{id}` call.

**Proposed payload:**

```json
{
  "event_type": "session_update",
  "screen": "<Screen literal>",
  "session_id": "<uuid>"
}
```

This avoids a round-trip after every chat. The addition is additive and non-breaking to `contracts/sse_events.py`.

**Decision:** Work with current SSE event definitions as-is. Only add `session_update` if it proves needed during Stage 4 (end-to-end frontend integration).

---

## OQ-CI-01: E2E in CI policy

**Status:** Parked until the 6-issue cleanup sequence completes
**Date:** 2026-04-12

E2E is currently disabled in CI (bypassed during the PR #32/#33 merge sequence). Re-enabling it is deferred until after the scenario-cleanup + screen-rebuild issues land, because the current test suite would all need rewriting to make E2E meaningful.

**Proposed approach (when re-enabling):**

- Use a **mock-backed** E2E, not real-backend. Real OpenRouter is slow, flaky, and expensive per run.
- The mock SSE layer must mimic production timing: deliberate delay before the first event, events emitted in real order (`thinking` → `pcsv_update` → `recipe_card` → `explanation` → `done`).
- Without realistic timing, the loading-state bugs that slipped through PR #32/#33 would slip through again — synchronous mocks never transition `screenState` through `loading`/`streaming`.
- Real-backend E2E never goes in CI. Manual UAT (per `workflow-guide-v2.md` §"UAT Confirmation") is the substitute.

**Decision point:** after Issue #6 (the last of the 6-issue cleanup) merges, revisit whether to enable mock-backed E2E as a mandatory CI gate. Implementation agents do not need to care about this until then.

---

## OQ-AGENT-01: Subagent model selection note

There are two problems with config in the orchestration pattern:

1. When I told the agent to act as an orchestrator, it didn't follow my instruction strictly.
2. I want to understand when to use an orchestrator. The second question is: do the ops, by default, use the same model as a parent model? For soft task ops, it is not that necessary, so I want to figure out how to configure this. If I config this in the cloud, I'm worried that I lose some kind of detail. Currently, Claude has lots of models, and I'm worried that using Claude directly will consume my token quickly and make me lose awareness of the harness under the hook.

> /btw which model you choosed for subagent? why
>
> I did not specify a model override for either subagent — I called Agent with only subagent_type: "general-purpose" and omitted the model parameter.
>
> Per the Agent tool spec, when model is omitted the agent "uses the agent definition's model, or inherits from the parent." The parent (me) is Claude Opus 4.7, so both subagents should inherit Opus 4.7 unless the general-purpose agent definition specifies otherwise (I don't have that definition in context to confirm).
>
> Why I didn't override: for the two fix tasks (ARM64 Fargate switch + CloudFront terraform), the work is concrete, file-scoped, and verification-heavy — each agent has explicit file lists, exact terraform snippets, and verification commands. Opus (inherited) is strong enough; Sonnet 4.6 would also have been fine and cheaper. In hindsight, model: "sonnet" would have been a reasonable cost optimization given how prescribed the prompts are. I defaulted to inheritance rather than thinking about it explicitly — that's a miss worth flagging for next time.
