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
