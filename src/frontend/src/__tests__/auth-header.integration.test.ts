// auth-header.integration.test.ts
//
// Tests for auth header wiring — migrated from vi.stubGlobal("fetch") to MSW (issue #103).
//
//   1. getAuthToken calls POST /auth/verify and returns a JWT string
//   2. createSession includes Authorization header in fetch call
//   3. createRealSSEService handler includes Authorization header in chat fetch call

import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/msw/server";
import { BASE, SSE_HEADERS } from "@/test/msw/constants";
import { makeSseStream } from "@/test/msw/sse";

// ---------------------------------------------------------------------------
// Helper: build SSE event specs for the chat endpoint override
// ---------------------------------------------------------------------------

function sseBlock(eventType: string, data: object): { event: string; data: unknown } {
  return { event: eventType, data };
}

const DONE_SPEC = sseBlock("done", {
  event_type: "done",
  status: "complete",
  reason: null,
});

// ---------------------------------------------------------------------------
// Test 1: getAuthToken calls POST /auth/verify and returns a JWT string
// ---------------------------------------------------------------------------

describe("getAuthToken", () => {
  it("calls POST /auth/verify with dev credentials and returns the token string", async () => {
    const captured: Request[] = [];
    server.use(
      http.post(`${BASE}/auth/verify`, async ({ request }) => {
        captured.push(request.clone());
        return HttpResponse.json({ token: "test-jwt-abc", user_id: "u1" });
      })
    );

    const { getAuthToken, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const token = await getAuthToken();

    expect(token).toBe("test-jwt-abc");
    expect(captured.length).toBe(1);
    expect(captured[0].url).toMatch(/\/auth\/verify$/);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.get("Content-Type")).toBe("application/json");

    const body = await captured[0].json() as { email: string; code: string };
    expect(body.email).toBe("dev@sga.local");
    expect(body.code).toBe("000000");
  });

  it("returns cached token on second call without a new fetch", async () => {
    let callCount = 0;
    server.use(
      http.post(`${BASE}/auth/verify`, () => {
        callCount++;
        return HttpResponse.json({ token: "cached-jwt", user_id: "u1" });
      })
    );

    const { getAuthToken, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const first = await getAuthToken();
    const second = await getAuthToken();

    expect(first).toBe("cached-jwt");
    expect(second).toBe("cached-jwt");
    expect(callCount).toBe(1);
  });

  it("resets and retries after a failed auth call", async () => {
    let callCount = 0;
    server.use(
      http.post(`${BASE}/auth/verify`, () => {
        callCount++;
        if (callCount === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ token: "retry-jwt", user_id: "u1" });
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
  it("sends Authorization: Bearer <token> in the session creation fetch", async () => {
    const capturedSession: Request[] = [];
    server.use(
      http.post(`${BASE}/auth/verify`, () => {
        return HttpResponse.json({ token: "session-jwt", user_id: "u1" });
      }),
      http.post(`${BASE}/session`, async ({ request }) => {
        capturedSession.push(request.clone());
        return HttpResponse.json({ session_id: "s1", created_at: "2026-04-11T00:00:00.000Z" });
      })
    );

    const { createSession, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const result = await createSession();

    expect(result.session_id).toBe("s1");
    expect(capturedSession.length).toBe(1);
    expect(capturedSession[0].url).toMatch(/\/session$/);
    expect(capturedSession[0].headers.get("Authorization")).toBe("Bearer session-jwt");
  });

  it("throws when session creation returns non-ok status", async () => {
    server.use(
      http.post(`${BASE}/auth/verify`, () => {
        return HttpResponse.json({ token: "t", user_id: "u1" });
      }),
      http.post(`${BASE}/session`, () => {
        return new HttpResponse(null, { status: 503 });
      })
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
  it("sends Authorization: Bearer <token> in the chat POST fetch", async () => {
    const capturedChat: Request[] = [];

    server.use(
      http.post(`${BASE}/auth/verify`, () => {
        return HttpResponse.json({ token: "chat-jwt", user_id: "u1" });
      }),
      http.post(`${BASE}/session`, () => {
        return HttpResponse.json({
          session_id: "chat-session",
          created_at: "2026-04-11T00:00:00.000Z",
        });
      }),
      http.post(`${BASE}/session/:id/chat`, async ({ request }) => {
        capturedChat.push(request.clone());
        const stream = makeSseStream([DONE_SPEC]);
        return new HttpResponse(stream, { status: 200, headers: SSE_HEADERS });
      })
    );

    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const { createRealSSEService } = await import("@/services/real-sse");
    const { handler: service } = createRealSSEService();

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

    expect(capturedChat.length).toBe(1);
    expect(capturedChat[0].headers.get("Authorization")).toBe("Bearer chat-jwt");
    expect(capturedChat[0].headers.get("Content-Type")).toBe("application/json");
  });
});
