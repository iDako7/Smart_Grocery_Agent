// auth-header.integration.test.ts — TDD RED phase
//
// Tests for auth header wiring:
//   1. getAuthToken calls POST /auth/verify and returns a JWT string
//   2. createSession includes Authorization header in fetch call
//   3. createRealSSEService handler includes Authorization header in chat fetch call

import { describe, it, expect, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helper: build SSE response body
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

function sseBlock(eventType: string, data: object): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

const DONE_BLOCK = sseBlock("done", {
  event_type: "done",
  status: "complete",
  reason: null,
});

// ---------------------------------------------------------------------------
// Test 1: getAuthToken calls POST /auth/verify and returns a JWT string
// ---------------------------------------------------------------------------

describe("getAuthToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /auth/verify with dev credentials and returns the token string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "test-jwt-abc", user_id: "u1" }),
      })
    );

    const { getAuthToken, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const token = await getAuthToken();

    expect(token).toBe("test-jwt-abc");

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/verify$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as { email: string; code: string };
    expect(body.email).toBe("dev@sga.local");
    expect(body.code).toBe("000000");
  });

  it("returns cached token on second call without a new fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "cached-jwt", user_id: "u1" }),
      })
    );

    const { getAuthToken, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const first = await getAuthToken();
    const second = await getAuthToken();

    expect(first).toBe("cached-jwt");
    expect(second).toBe("cached-jwt");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
  });

  it("resets and retries after a failed auth call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "retry-jwt", user_id: "u1" }),
        })
    );

    const { getAuthToken, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    await expect(getAuthToken()).rejects.toThrow("Auth failed: 401");

    // After failure the cache is cleared — next call should retry
    const token = await getAuthToken();
    expect(token).toBe("retry-jwt");
  });
});

// ---------------------------------------------------------------------------
// Test 2: createSession includes Authorization header
// ---------------------------------------------------------------------------

describe("createSession with auth header", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Authorization: Bearer <token> in the session creation fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // First call: /auth/verify
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "session-jwt", user_id: "u1" }),
        })
        // Second call: /session
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ session_id: "s1", created_at: "2026-04-11T00:00:00.000Z" }),
        })
    );

    const { createSession, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const result = await createSession();

    expect(result.session_id).toBe("s1");

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second call is /session — must carry the Authorization header
    const [sessionUrl, sessionInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(sessionUrl).toMatch(/\/session$/);
    expect((sessionInit.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer session-jwt"
    );
  });

  it("throws when session creation returns non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "t", user_id: "u1" }),
        })
        .mockResolvedValueOnce({ ok: false, status: 503 })
    );

    const { createSession, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    await expect(createSession()).rejects.toThrow("Failed to create session: 503");
  });
});

// ---------------------------------------------------------------------------
// Test 3: createRealSSEService handler includes Authorization header in chat fetch
// ---------------------------------------------------------------------------

describe("createRealSSEService — auth header in chat fetch", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("sends Authorization: Bearer <token> in the chat POST fetch", async () => {
    const sseBody = makeSseBody([DONE_BLOCK]);

    const fetchMock = vi.fn()
      // Call 1: /auth/verify
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "chat-jwt", user_id: "u1" }),
      })
      // Call 2: POST /session
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: "chat-session", created_at: "2026-04-11T00:00:00.000Z" }),
      })
      // Call 3: POST /session/<id>/chat
      .mockResolvedValueOnce({
        ok: true,
        body: sseBody,
        json: async () => ({}),
      });

    vi.stubGlobal("fetch", fetchMock);

    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const { createRealSSEService } = await import("@/services/real-sse");
    const service = createRealSSEService();

    await new Promise<void>((resolve) => {
      service(
        "what should I cook?",
        "home",
        vi.fn(),
        () => {
          resolve();
        },
        vi.fn()
      );
    });

    // The third call should be the chat endpoint with the Authorization header
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    const chatCall = calls.find(([url]) => typeof url === "string" && url.includes("/chat"));
    expect(chatCall).toBeDefined();

    const chatInit = chatCall![1];
    const headers = chatInit.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer chat-jwt");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
