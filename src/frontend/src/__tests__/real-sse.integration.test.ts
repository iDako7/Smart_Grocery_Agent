// TDD RED phase — tests written before implementation.
// Tests for:
//   - src/services/api-client.ts  (getApiBase, createSession)
//   - src/services/real-sse.ts    (createRealSSEService)
//   - session-context.tsx         (F12 — explanationRef integration)

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";

// ---------------------------------------------------------------------------
// Helper: build SSE response body from pre-formatted blocks
// Each block must already end with \n\n
// ---------------------------------------------------------------------------

function makeSseBody(blocks: string[]): ReadableStream<Uint8Array> {
  const text = blocks.join("");
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: build a well-formed SSE block
// ---------------------------------------------------------------------------

function sseBlock(eventType: string, data: object): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Sample event payloads
// ---------------------------------------------------------------------------

const THINKING_BLOCK = sseBlock("thinking", {
  event_type: "thinking",
  message: "Running analyze_pcsv...",
});

const PCSV_BLOCK = sseBlock("pcsv_update", {
  event_type: "pcsv_update",
  pcsv: {
    protein: ["chicken"],
    carb: [],
    veggie: [],
    sauce: [],
    gaps: ["carb", "veggie"],
  },
});

const RECIPE_CARD_BLOCK = sseBlock("recipe_card", {
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
    ingredients_have: ["chicken"],
    ingredients_need: ["soy sauce"],
  },
});

const EXPLANATION_TEXT = "Here are your recipes";
const EXPLANATION_BLOCK = sseBlock("explanation", {
  event_type: "explanation",
  text: EXPLANATION_TEXT,
});

const DONE_BLOCK = sseBlock("done", {
  event_type: "done",
  status: "complete",
  reason: null,
});

const ERROR_NON_RECOVERABLE_BLOCK = sseBlock("error", {
  event_type: "error",
  message: "some error message",
  code: "TOOL_ERROR",
  recoverable: false,
});

const ERROR_RECOVERABLE_BLOCK = sseBlock("error", {
  event_type: "error",
  message: "recoverable warning",
  code: "WARN",
  recoverable: true,
});

// ---------------------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------------------

const AUTH_RESPONSE = { token: "test-jwt", user_id: "u1" };

const SESSION_RESPONSE = {
  session_id: "test-session-123",
  created_at: "2026-04-11T00:00:00.000Z",
};

/**
 * Builds a fetch mock that handles all three calls in order:
 *   1. POST /auth/verify  → AUTH_RESPONSE
 *   2. POST /session      → SESSION_RESPONSE
 *   3. POST /session/.../chat → sseBody
 *
 * URL-based matching used so that session-reuse tests (which skip call 2 on
 * the second message) still resolve correctly.
 */
function mockFetchWithSessionAndChat(sseBody: ReadableStream<Uint8Array>) {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/auth/verify")) {
      return Promise.resolve({
        ok: true,
        body: null,
        json: async () => AUTH_RESPONSE,
      });
    }
    if (typeof url === "string" && url.includes("/session") && !url.includes("/chat")) {
      return Promise.resolve({
        ok: true,
        body: null,
        json: async () => SESSION_RESPONSE,
      });
    }
    return Promise.resolve({
      ok: true,
      body: sseBody,
      json: async () => ({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Test 1: Happy path — all event types dispatched in order
// ---------------------------------------------------------------------------

describe("createRealSSEService — happy path", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("dispatches thinking, pcsv_update, recipe_card, explanation in order and calls onDone", async () => {
    const sseBody = makeSseBody([
      THINKING_BLOCK,
      PCSV_BLOCK,
      RECIPE_CARD_BLOCK,
      EXPLANATION_BLOCK,
      DONE_BLOCK,
    ]);

    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

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
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("calls onError and never calls onDone when fetch rejects", async () => {
    // Auth succeeds, session creation succeeds, chat fetch fails
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (typeof url === "string" && url.includes("/auth/verify")) {
          return Promise.resolve({
            ok: true,
            body: null,
            json: async () => AUTH_RESPONSE,
          });
        }
        if (callCount === 2) {
          // Second call: session creation
          return Promise.resolve({
            ok: true,
            body: null,
            json: async () => SESSION_RESPONSE,
          });
        }
        // Third call: chat — network error
        return Promise.reject(new Error("Network error"));
      })
    );

    // Re-import to get a fresh closure (session state is fresh per module load)
    const { createRealSSEService } = await import("@/services/real-sse");

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
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("routes non-recoverable error to onError and never calls onEvent", async () => {
    const sseBody = makeSseBody([ERROR_NON_RECOVERABLE_BLOCK]);
    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

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
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("routes recoverable error to onEvent and then calls onDone", async () => {
    const sseBody = makeSseBody([ERROR_RECOVERABLE_BLOCK, DONE_BLOCK]);
    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

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
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("calls POST /session before POST /session/.../chat on first call", async () => {
    const sseBody = makeSseBody([DONE_BLOCK]);
    const fetchMock = mockFetchWithSessionAndChat(sseBody);
    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");

    const { handler: service } = createRealSSEService();
    const onDone = vi.fn();

    await new Promise<void>((resolve) => {
      service("hello", "home", vi.fn(), (_s: "complete" | "partial", _r: string | null) => { onDone(_s, _r); resolve(); }, vi.fn());
    });

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Find session creation call (not /auth/verify, not /chat)
    const sessionCall = calls.find(
      ([url]) => typeof url === "string" && /\/session$/.test(url)
    );
    expect(sessionCall).toBeDefined();
    expect(sessionCall![1]?.method).toBe("POST");

    // Find chat call
    const chatCall = calls.find(
      ([url]) => typeof url === "string" && url.includes("/chat")
    );
    expect(chatCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 6: Session reused on second call
// ---------------------------------------------------------------------------

describe("createRealSSEService — session reuse", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("calls POST /session exactly once across two sendMessage calls", async () => {
    const makeDoneBody = () => makeSseBody([DONE_BLOCK]);

    let chatCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/auth/verify")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => AUTH_RESPONSE,
        });
      }
      if (typeof url === "string" && url.includes("/session") && !url.includes("/chat")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => SESSION_RESPONSE,
        });
      }
      chatCallCount++;
      return Promise.resolve({
        ok: true,
        body: makeDoneBody(),
        json: async () => ({}),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");
    const { handler: service } = createRealSSEService();

    // First call
    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    // Second call
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    // Count how many times /session (not /chat) was called
    const sessionCreationCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(
      ([url]) => typeof url === "string" && /\/session$/.test(url)
    );
    expect(sessionCreationCalls).toHaveLength(1);
    expect(chatCallCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Cancel calls abort
// ---------------------------------------------------------------------------

describe("createRealSSEService — cancel / abort", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("passing cancel() causes fetch to be called with an AbortSignal that was aborted", async () => {
    // fetch never resolves — we cancel immediately
    let capturedSignal: AbortSignal | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/auth/verify")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => AUTH_RESPONSE,
        });
      }
      if (typeof url === "string" && url.includes("/session") && !url.includes("/chat")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => SESSION_RESPONSE,
        });
      }
      // Chat fetch — capture the signal, never resolves
      if (init?.signal) {
        capturedSignal = init.signal as AbortSignal;
      }
      return Promise.resolve({
        ok: true,
        body: new ReadableStream<Uint8Array>({ start() {} }), // never closes
        json: async () => SESSION_RESPONSE,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");
    const { handler: service } = createRealSSEService();

    const { cancel } = service("hello", "home", vi.fn(), vi.fn(), vi.fn());

    // Give the IIFE a tick to call session creation fetch + chat fetch
    await new Promise((r) => setTimeout(r, 50));

    cancel();

    // Wait a tick for abort to propagate
    await new Promise((r) => setTimeout(r, 10));

    // At least one fetch call should have received a signal
    const chatFetchCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(
      ([url]) => typeof url === "string" && url.includes("/chat")
    );
    expect(chatFetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 8: Stream closes without done event → onError is called
// ---------------------------------------------------------------------------

describe("createRealSSEService — stream closes without done event", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("calls onError with 'Connection closed unexpectedly' when stream closes without a done event", async () => {
    // Stream emits a thinking event then closes — no done event
    const encoder = new TextEncoder();
    const sseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(THINKING_BLOCK));
        controller.close(); // closes without emitting done
      },
    });

    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

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
    // Stream that never closes on its own — we cancel before it ends
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const encoder = new TextEncoder();
    const sseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encoder.encode(THINKING_BLOCK));
        // Does NOT call controller.close() — the test closes it after cancel
      },
    });

    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

    const { handler: service } = createRealSSEService();
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const { cancel } = service("what should I cook?", "home", onEvent, onDone, onError);

    // Give the IIFE time to reach consumeSseStream and block on reader.read()
    await new Promise((r) => setTimeout(r, 30));

    // Cancel first, then close the stream to unblock the reader
    cancel();
    streamController!.close();

    // Wait for the async IIFE to settle
    await new Promise((r) => setTimeout(r, 30));

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 9: onSessionCreated callback fires with session ID
// ---------------------------------------------------------------------------

describe("createRealSSEService — onSessionCreated callback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("calls onSessionCreated with the session ID after first message", async () => {
    const sseBody = makeSseBody([DONE_BLOCK]);
    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

    const onSessionCreated = vi.fn();
    const { handler: service } = createRealSSEService({ onSessionCreated });

    await new Promise<void>((resolve) => {
      service("hello", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    expect(onSessionCreated).toHaveBeenCalledOnce();
    expect(onSessionCreated).toHaveBeenCalledWith("test-session-123");
  });

  it("calls onSessionCreated only once across two messages (session reuse)", async () => {
    const makeDoneBody = () => makeSseBody([DONE_BLOCK]);

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/auth/verify")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => AUTH_RESPONSE,
        });
      }
      if (typeof url === "string" && url.includes("/session") && !url.includes("/chat")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => SESSION_RESPONSE,
        });
      }
      return Promise.resolve({
        ok: true,
        body: makeDoneBody(),
        json: async () => ({}),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");

    const onSessionCreated = vi.fn();
    const { handler: service } = createRealSSEService({ onSessionCreated });

    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), () => { resolve(); }, vi.fn());
    });

    expect(onSessionCreated).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test 10: resetSession causes new POST /session on next call
// ---------------------------------------------------------------------------

describe("createRealSSEService — resetSession", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("creates a new session after resetSession is called", async () => {
    const makeDoneBody = () => makeSseBody([DONE_BLOCK]);

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/auth/verify")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => AUTH_RESPONSE,
        });
      }
      if (typeof url === "string" && url.includes("/session") && !url.includes("/chat")) {
        return Promise.resolve({
          ok: true,
          body: null,
          json: async () => SESSION_RESPONSE,
        });
      }
      return Promise.resolve({
        ok: true,
        body: makeDoneBody(),
        json: async () => ({}),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");

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

    // POST /session called twice
    const sessionCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(
      ([url]) => typeof url === "string" && /\/session$/.test(url)
    );
    expect(sessionCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test 11 (F12): explanation text in assistant turn (SessionProvider integration)
// ---------------------------------------------------------------------------

describe("F12 — SessionProvider stores explanation in assistant turn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
