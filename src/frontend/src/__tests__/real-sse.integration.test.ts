// TDD RED phase — tests written before implementation.
// Tests for:
//   - src/services/api-client.ts  (getApiBase, createSession)
//   - src/services/real-sse.ts    (createRealSSEService)
//   - session-context.tsx         (F12 — explanationRef integration)

import { describe, it, expect, vi, afterEach } from "vitest";
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

const SESSION_RESPONSE = {
  session_id: "test-session-123",
  created_at: "2026-04-11T00:00:00.000Z",
};

function mockFetchWithSessionAndChat(sseBody: ReadableStream<Uint8Array>) {
  return vi.fn().mockImplementation((url: string) => {
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
  afterEach(() => {
    vi.unstubAllGlobals();
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

    const service = createRealSSEService();
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls onError and never calls onDone when fetch rejects", async () => {
    // Session creation succeeds; chat fetch fails
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: session creation
          return Promise.resolve({
            ok: true,
            body: null,
            json: async () => SESSION_RESPONSE,
          });
        }
        // Second call: chat — network error
        return Promise.reject(new Error("Network error"));
      })
    );

    // Re-import to get a fresh closure (session state is fresh per module load)
    const { createRealSSEService } = await import("@/services/real-sse");

    const service = createRealSSEService();
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes non-recoverable error to onError and never calls onEvent", async () => {
    const sseBody = makeSseBody([ERROR_NON_RECOVERABLE_BLOCK]);
    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

    const service = createRealSSEService();
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes recoverable error to onEvent and then calls onDone", async () => {
    const sseBody = makeSseBody([ERROR_RECOVERABLE_BLOCK, DONE_BLOCK]);
    vi.stubGlobal("fetch", mockFetchWithSessionAndChat(sseBody));

    const { createRealSSEService } = await import("@/services/real-sse");

    const service = createRealSSEService();
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /session before POST /session/.../chat on first call", async () => {
    const sseBody = makeSseBody([DONE_BLOCK]);
    const fetchMock = mockFetchWithSessionAndChat(sseBody);
    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");

    const service = createRealSSEService();
    const onDone = vi.fn();

    await new Promise<void>((resolve) => {
      service("hello", "home", vi.fn(), (_s: "complete" | "partial", _r: string | null) => { onDone(_s, _r); resolve(); }, vi.fn());
    });

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // First call must be session creation
    const firstUrl = calls[0][0];
    expect(firstUrl).toMatch(/\/session$/);
    expect(calls[0][1]?.method).toBe("POST");

    // Second call must be the chat endpoint
    const secondUrl = calls[1][0];
    expect(secondUrl).toMatch(/\/session\/.+\/chat/);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Session reused on second call
// ---------------------------------------------------------------------------

describe("createRealSSEService — session reuse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /session exactly once across two sendMessage calls", async () => {
    const makeDoneBody = () => makeSseBody([DONE_BLOCK]);

    let chatCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
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
    const service = createRealSSEService();

    // First call
    await new Promise<void>((resolve) => {
      service("first", "home", vi.fn(), (_s: "complete" | "partial", _r: string | null) => { resolve(); }, vi.fn());
    });

    // Second call
    await new Promise<void>((resolve) => {
      service("second", "home", vi.fn(), (_s: "complete" | "partial", _r: string | null) => { resolve(); }, vi.fn());
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passing cancel() causes fetch to be called with an AbortSignal that was aborted", async () => {
    // fetch never resolves — we cancel immediately
    let capturedSignal: AbortSignal | null = null;
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal) {
        capturedSignal = init.signal as AbortSignal;
      }
      // Return a promise that resolves but with a stream that never sends data
      return Promise.resolve({
        ok: true,
        body: new ReadableStream<Uint8Array>({ start(_controller: ReadableStreamDefaultController<Uint8Array>) {} }), // never closes
        json: async () => SESSION_RESPONSE,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { createRealSSEService } = await import("@/services/real-sse");
    const service = createRealSSEService();

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
// Test 8 (F12): explanation text in assistant turn (SessionProvider integration)
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
      onDone: (status: "complete" | "partial", reason: string | null) => void,
      _onError: (msg: string) => void
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
