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
