// Integration tests for createRealSSEService — migrated from vi.stubGlobal("fetch")
// to MSW handlers (issue #90).
//
// Tests for:
//   - src/services/real-sse.ts    (createRealSSEService)
//   - session-context.tsx         (F12 — explanationRef integration)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";
import { http, HttpResponse, delay } from "msw";

import { server } from "@/test/msw/server";
import { makeSseStream, makeDeferredSseStream, toSseSpecs } from "@/test/msw/sse";
import { createRealSSEService } from "@/services/real-sse";
import { resetAuthToken } from "@/services/api-client";

const BASE = "http://localhost:8000";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// ---------------------------------------------------------------------------
// Typed SSE events — used to build MSW chat handler responses
// ---------------------------------------------------------------------------

const THINKING_EVENT = { event_type: "thinking", message: "Running analyze_pcsv..." };

const PCSV_EVENT = {
  event_type: "pcsv_update",
  pcsv: {
    protein: ["chicken"],
    carb: [],
    veggie: [],
    sauce: [],
    gaps: ["carb", "veggie"],
  },
};

const RECIPE_CARD_EVENT = {
  event_type: "recipe_card",
  recipe: {
    id: "r001",
    name: "Chicken Stir Fry",
    name_zh: "鸡肉炒",
    cuisine: "Chinese",
    cooking_method: "stir-fry",
    effort_level: "medium",
    flavor_tags: ["savory"],
    serves: 2,
    pcsv_roles: {},
    ingredients: [
      { name: "chicken", amount: "400g", pcsv: ["protein"] },
      { name: "soy sauce", amount: "2 tbsp", pcsv: ["sauce"] },
    ],
    ingredients_have: ["chicken"],
    ingredients_need: ["soy sauce"],
  },
};

const EXPLANATION_TEXT = "Here are your recipes";
const EXPLANATION_EVENT = { event_type: "explanation", text: EXPLANATION_TEXT };

const DONE_EVENT = { event_type: "done", status: "complete", reason: null };

const ERROR_NON_RECOVERABLE_EVENT = {
  event_type: "error",
  message: "some error message",
  code: "TOOL_ERROR",
  recoverable: false,
};

const ERROR_RECOVERABLE_EVENT = {
  event_type: "error",
  message: "recoverable warning",
  code: "WARN",
  recoverable: true,
};

// ---------------------------------------------------------------------------
// Helper: override the chat endpoint with a specific SSE sequence
// ---------------------------------------------------------------------------

function overrideChatWithEvents(events: Record<string, unknown>[]) {
  const specs = toSseSpecs(events as { event_type: string }[]);
  server.use(
    http.post(`${BASE}/session/:sessionId/chat`, () => {
      return new HttpResponse(makeSseStream(specs), {
        status: 200,
        headers: SSE_HEADERS,
      });
    })
  );
}

// ---------------------------------------------------------------------------
// Cleanup — reset auth token cache between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAuthToken();
});

// ---------------------------------------------------------------------------
// Test 1: Happy path — all event types dispatched in order
// ---------------------------------------------------------------------------

describe("createRealSSEService — happy path", () => {
  it("dispatches thinking, pcsv_update, recipe_card, explanation in order and calls onDone", async () => {
    overrideChatWithEvents([
      THINKING_EVENT,
      PCSV_EVENT,
      RECIPE_CARD_EVENT,
      EXPLANATION_EVENT,
      DONE_EVENT,
    ]);

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedDone = (status: "complete" | "partial", reason: string | null) => {
        onDone(status, reason);
        resolve();
      };
      service("what should I cook?", "home", onEvent, wrappedDone, onError);
    });

    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(onEvent.mock.calls[0][0].event_type).toBe("thinking");
    expect(onEvent.mock.calls[1][0].event_type).toBe("pcsv_update");
    expect(onEvent.mock.calls[2][0].event_type).toBe("recipe_card");
    expect(onEvent.mock.calls[3][0].event_type).toBe("explanation");
    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith("complete", null);
    expect(onError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Network failure triggers onError
// ---------------------------------------------------------------------------

describe("createRealSSEService — network failure", () => {
  it("calls onError and never calls onDone when fetch rejects", async () => {
    server.use(
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        return HttpResponse.error();
      })
    );

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedError = (msg: string) => {
        onError(msg);
        resolve();
      };
      service("hello", "home", onEvent, onDone, wrappedError);
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3: Non-recoverable error event routes to onError
// ---------------------------------------------------------------------------

describe("createRealSSEService — non-recoverable error event", () => {
  it("routes non-recoverable error to onError and never calls onEvent", async () => {
    overrideChatWithEvents([ERROR_NON_RECOVERABLE_EVENT]);

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedError = (msg: string) => {
        onError(msg);
        resolve();
      };
      service("hello", "home", onEvent, onDone, wrappedError);
    });

    expect(onError).toHaveBeenCalledWith("some error message");
    expect(onEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Recoverable error event routes to onEvent
// ---------------------------------------------------------------------------

describe("createRealSSEService — recoverable error event", () => {
  it("routes recoverable error to onEvent and then calls onDone", async () => {
    overrideChatWithEvents([ERROR_RECOVERABLE_EVENT, DONE_EVENT]);

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedDone = (status: "complete" | "partial", reason: string | null) => {
        onDone(status, reason);
        resolve();
      };
      service("hello", "home", onEvent, wrappedDone, onError);
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "error", recoverable: true })
    );
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Session created on first call
// ---------------------------------------------------------------------------

describe("createRealSSEService — session creation", () => {
  it("calls POST /session before POST /session/.../chat on first call", async () => {
    let sessionCreated = false;
    let chatCalled = false;
    let sessionBeforeChat = false;

    server.use(
      http.post(`${BASE}/session`, () => {
        sessionCreated = true;
        return HttpResponse.json({
          session_id: "test-session-123",
          created_at: "2026-04-11T00:00:00.000Z",
        });
      }),
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        chatCalled = true;
        sessionBeforeChat = sessionCreated;
        return new HttpResponse(
          makeSseStream(toSseSpecs([DONE_EVENT as { event_type: string }])),
          { status: 200, headers: SSE_HEADERS }
        );
      })
    );

    const { handler: service } = createRealSSEService();
    const onDone = vi.fn();

    await new Promise<void>((resolve) => {
      service("hello", "home", vi.fn(), (_s, _r) => { onDone(_s, _r); resolve(); }, vi.fn());
    });

    expect(sessionCreated).toBe(true);
    expect(chatCalled).toBe(true);
    expect(sessionBeforeChat).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Session reused on second call
// ---------------------------------------------------------------------------

describe("createRealSSEService — session reuse", () => {
  it("calls POST /session exactly once across two sendMessage calls", async () => {
    let sessionCreateCount = 0;
    let chatCallCount = 0;

    server.use(
      http.post(`${BASE}/session`, () => {
        sessionCreateCount++;
        return HttpResponse.json({
          session_id: "test-session-123",
          created_at: "2026-04-11T00:00:00.000Z",
        });
      }),
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        chatCallCount++;
        return new HttpResponse(
          makeSseStream(toSseSpecs([DONE_EVENT as { event_type: string }])),
          { status: 200, headers: SSE_HEADERS }
        );
      })
    );

    const { handler: service } = createRealSSEService();

    // First call
    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    // Second call
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    expect(sessionCreateCount).toBe(1);
    expect(chatCallCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Cancel calls abort
// ---------------------------------------------------------------------------

describe("createRealSSEService — cancel / abort", () => {
  it("cancel() aborts the in-flight chat request", async () => {
    // Synchronize: resolve when the chat handler is entered
    let capturedSignal: AbortSignal | undefined;
    let handlerReached: () => void;
    const handlerReachedPromise = new Promise<void>((r) => { handlerReached = r; });

    server.use(
      http.post(`${BASE}/session/:sessionId/chat`, async ({ request }) => {
        capturedSignal = request.signal;
        handlerReached();
        await delay("infinite");
        return new HttpResponse(null, { status: 200 });
      })
    );

    const { handler: service } = createRealSSEService();
    const onDone = vi.fn();

    const { cancel } = service("hello", "home", vi.fn(), onDone, vi.fn());

    // Wait until the chat handler is actually entered — no arbitrary timeout
    await handlerReachedPromise;

    cancel();

    // One microtask tick for abort to propagate
    await new Promise((r) => setTimeout(r, 0));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 8: Stream closes without done event → onError is called
// ---------------------------------------------------------------------------

describe("createRealSSEService — stream closes without done event", () => {
  it("calls onError with 'Connection closed unexpectedly' when stream closes without a done event", async () => {
    // Stream emits thinking then closes — no done event
    overrideChatWithEvents([THINKING_EVENT]);

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedError = (msg: string) => {
        onError(msg);
        resolve();
      };
      service("what should I cook?", "home", onEvent, onDone, wrappedError);
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("Connection closed unexpectedly");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("does NOT call onError or onDone when stream closes after cancel()", async () => {
    // Use a deferred stream so we can close it AFTER cancel — exercises the
    // post-cancel stream-close path that the old test covered.
    const deferred = makeDeferredSseStream();
    let handlerReached: () => void;
    const handlerReachedPromise = new Promise<void>((r) => { handlerReached = r; });

    server.use(
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        handlerReached();
        return new HttpResponse(deferred.stream, {
          status: 200,
          headers: SSE_HEADERS,
        });
      })
    );

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const { cancel } = service("what should I cook?", "home", onEvent, onDone, onError);

    // Wait until the handler has returned the stream
    await handlerReachedPromise;
    // One tick for the service to start reading the stream
    await new Promise((r) => setTimeout(r, 0));

    // Cancel first, then close the stream to unblock the reader
    cancel();
    deferred.close();

    // Let the async IIFE settle
    await new Promise((r) => setTimeout(r, 10));

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 9: onSessionCreated callback fires with session ID
// ---------------------------------------------------------------------------

describe("createRealSSEService — onSessionCreated callback", () => {
  it("calls onSessionCreated with the session ID after first message", async () => {
    server.use(
      http.post(`${BASE}/session`, () => {
        return HttpResponse.json({
          session_id: "session-for-callback-test",
          created_at: "2026-04-11T00:00:00.000Z",
        });
      })
    );
    overrideChatWithEvents([DONE_EVENT]);

    const onSessionCreated = vi.fn();
    const { handler: service } = createRealSSEService({ onSessionCreated });

    await new Promise<void>((resolve) => {
      service("hello", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    expect(onSessionCreated).toHaveBeenCalledOnce();
    expect(onSessionCreated).toHaveBeenCalledWith("session-for-callback-test");
  });

  it("calls onSessionCreated only once across two messages (session reuse)", async () => {
    let chatCallCount = 0;

    server.use(
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        chatCallCount++;
        return new HttpResponse(
          makeSseStream(toSseSpecs([DONE_EVENT as { event_type: string }])),
          { status: 200, headers: SSE_HEADERS }
        );
      })
    );

    const onSessionCreated = vi.fn();
    const { handler: service } = createRealSSEService({ onSessionCreated });

    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    expect(onSessionCreated).toHaveBeenCalledOnce();
    expect(chatCallCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 10: resetSession causes new POST /session on next call
// ---------------------------------------------------------------------------

describe("createRealSSEService — resetSession", () => {
  it("creates a new session after resetSession is called", async () => {
    let sessionCreationCount = 0;

    server.use(
      http.post(`${BASE}/session`, () => {
        sessionCreationCount++;
        return HttpResponse.json({
          session_id: "test-session-123",
          created_at: "2026-04-11T00:00:00.000Z",
        });
      }),
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        return new HttpResponse(
          makeSseStream(toSseSpecs([DONE_EVENT as { event_type: string }])),
          { status: 200, headers: SSE_HEADERS }
        );
      })
    );

    const onSessionCreated = vi.fn();
    const { handler: service, resetSession } = createRealSSEService({ onSessionCreated });

    // First message — creates session
    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    expect(onSessionCreated).toHaveBeenCalledOnce();

    // Reset — clears cached session
    resetSession();

    // Second message — should create a new session
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    // onSessionCreated called twice (once per session creation)
    expect(onSessionCreated).toHaveBeenCalledTimes(2);
    expect(sessionCreationCount).toBe(2);
  });

  it("does not fire onSessionCreated for a stale session when resetSession interrupts in-flight creation", async () => {
    let resolveSession: ((value: Response) => void) | null = null;
    let sessionHandlerReached: () => void;
    const sessionHandlerPromise = new Promise<void>((r) => { sessionHandlerReached = r; });
    const chatReached = vi.fn();

    server.use(
      http.post(`${BASE}/session`, () => {
        sessionHandlerReached();
        // Return a promise that hangs until we manually resolve it
        return new Promise<Response>((resolve) => {
          resolveSession = (val) => resolve(val);
        });
      }),
      // If the stale session leaks through, this handler would fire — proves
      // the first service() call is truly abandoned after resetSession().
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        chatReached();
        return new HttpResponse(
          makeSseStream(toSseSpecs([DONE_EVENT as { event_type: string }])),
          { status: 200, headers: SSE_HEADERS }
        );
      })
    );

    const onSessionCreated = vi.fn();
    const { handler: service, resetSession } = createRealSSEService({ onSessionCreated });

    // Start first message — session creation is pending (intentionally untracked)
    service("first", "home", vi.fn(), vi.fn(), vi.fn());

    // Wait until the session handler is actually entered — no arbitrary timeout
    await sessionHandlerPromise;
    expect(resolveSession).not.toBeNull();

    // Reset BEFORE the session creation resolves
    resetSession();

    // Now resolve the stale session creation
    resolveSession!(
      HttpResponse.json({
        session_id: "test-session-123",
        created_at: "2026-04-11T00:00:00.000Z",
      })
    );

    // Let the promise chain settle
    await new Promise((r) => setTimeout(r, 10));

    // onSessionCreated must NOT have been called — the generation was invalidated
    expect(onSessionCreated).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 11 (F12): explanation text in assistant turn (SessionProvider integration)
// ---------------------------------------------------------------------------

describe("F12 — SessionProvider stores explanation in assistant turn", () => {
  it("assistant turn content equals the explanation event text", async () => {
    const { SessionProvider, useSession } = await import("@/context/session-context");

    // Stub chatService that emits explanation then done
    const stubService = (
      _message: string,
      _screen: unknown,
      onEvent: (e: { event_type: string; text?: string }) => void,
      onDone: (status: "complete" | "partial", reason: string | null) => void
    ) => {
      // Use microtask to simulate async emission
      Promise.resolve().then(() => {
        onEvent({ event_type: "explanation", text: EXPLANATION_TEXT });
        onDone("complete", null);
      });
      return { cancel: () => {} };
    };

    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(SessionProvider, { chatService: stubService as unknown as Parameters<typeof SessionProvider>[0]["chatService"], children });

    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => {
      result.current.sendMessage("what should I cook?");
      // Wait for microtask queue to flush
      await new Promise((r) => setTimeout(r, 0));
    });

    const history = result.current.conversationHistory;
    // Should have user turn + assistant turn
    expect(history.length).toBeGreaterThanOrEqual(2);
    const assistantTurn = history.find((t) => t.role === "assistant");
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn!.content).toBe(EXPLANATION_TEXT);
  });
});

// ---------------------------------------------------------------------------
// Test 12: chat 404 → "Session expired" error + sessionIdPromise reset
// ---------------------------------------------------------------------------

describe("createRealSSEService — chat 404 handling", () => {
  it("calls onError with session-expired message when chat returns 404", async () => {
    server.use(
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

    const { handler: service } = createRealSSEService();
    const onError = vi.fn();

    await new Promise<void>((resolve) => {
      service("hello", "home", vi.fn(), vi.fn(), (msg) => {
        onError(msg);
        resolve();
      });
    });

    expect(onError).toHaveBeenCalledWith(
      "Session expired. Please refresh and try again."
    );
  });

  it("resets sessionIdPromise after 404 so next call creates a fresh session", async () => {
    let sessionCreationCount = 0;
    let chatCallCount = 0;

    server.use(
      http.post(`${BASE}/session`, () => {
        sessionCreationCount++;
        return HttpResponse.json({
          session_id: "test-session-123",
          created_at: "2026-04-11T00:00:00.000Z",
        });
      }),
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        chatCallCount++;
        if (chatCallCount === 1) {
          return new HttpResponse(null, { status: 404 });
        }
        return new HttpResponse(
          makeSseStream(toSseSpecs([DONE_EVENT as { event_type: string }])),
          { status: 200, headers: SSE_HEADERS }
        );
      })
    );

    const { handler: service } = createRealSSEService();

    // First call → 404
    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), vi.fn(), () => resolve());
    });

    expect(sessionCreationCount).toBe(1);

    // Second call → must create a NEW session (sessionIdPromise was reset on 404)
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), () => resolve(), vi.fn());
    });

    expect(sessionCreationCount).toBe(2);
  });
});
