// Typed test fixtures for session identifiers and conversation turns.
// Used by MSW pilot migration and future tests that need session state.

import type { ConversationTurn } from "@/types/api";

// ---------------------------------------------------------------------------
// Session IDs
// ---------------------------------------------------------------------------

/** Generic session used in most unit/integration tests. */
export const SESSION_ID_DEFAULT: string = "sess-1";

/** Session ID used in grocery-screen save-flow tests. */
export const SESSION_ID_GROCERY: string = "session-abc";

/** Session ID used in meal-plan save-flow tests. */
export const SESSION_ID_MEAL_PLAN: string = "sess-plan-1";

/** Session ID used in T16 cross-screen integration test. */
export const SESSION_ID_T16: string = "sess-t16";

/** Session ID used in T17 pill-exclusion round-trip test. */
export const SESSION_ID_T17: string = "sess-t17";

/** Session ID used in ingredient-toggle tests. */
export const SESSION_ID_TOGGLE: string = "sess-toggle";

// ---------------------------------------------------------------------------
// ConversationTurn factories
// ---------------------------------------------------------------------------

/**
 * Canonical ISO timestamps used across tests so assertions on timestamp
 * strings are stable and readable.
 */
export const TIMESTAMP_T0: string = "2026-04-11T00:00:00.000Z";
export const TIMESTAMP_T1: string = "2026-04-11T00:00:01.000Z";
export const TIMESTAMP_T2: string = "2026-04-11T00:00:02.000Z";

/** A minimal user ConversationTurn. */
export const USER_TURN_HELLO: ConversationTurn = {
  role: "user",
  content: "locally injected message",
  timestamp: TIMESTAMP_T0,
};

/** A minimal assistant ConversationTurn. */
export const ASSISTANT_TURN_INJECTED: ConversationTurn = {
  role: "assistant",
  content: "injected assistant turn",
  timestamp: TIMESTAMP_T1,
};

/** A user turn with no-chat-service content (used in addLocalTurn tests). */
export const USER_TURN_NO_SERVICE: ConversationTurn = {
  role: "user",
  content: "no chat service call",
  timestamp: TIMESTAMP_T2,
};

/**
 * Factory for a ConversationTurn with explicit overrides.
 * Defaults to a user turn with TIMESTAMP_T0.
 */
export function makeConversationTurn(
  overrides?: Partial<ConversationTurn>
): ConversationTurn {
  return {
    role: "user",
    content: "test message",
    timestamp: TIMESTAMP_T0,
    ...overrides,
  };
}
