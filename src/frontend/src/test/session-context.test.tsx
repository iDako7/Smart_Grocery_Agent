// session-context.test.tsx — screen-level behavioral tests (MSW pilot, issue #89)
//
// Tests user-observable flows by rendering actual screens with MSW intercepting
// the real SSE service. No vi.mock, no serviceSpy, no result.current.screenState.
//
// Interpretation A + split:
//   This file: screen-level DOM tests (HomeScreen → ClarifyScreen flows)
//   session-context.hooks.test.tsx: pure hook/reducer tests (renderHook)

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { http, HttpResponse } from "msw";

import { SessionProvider } from "@/context/session-context";
import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { server } from "@/test/msw/server";
import { makeSseStream } from "@/test/msw/sse";
import {
  EVENT_THINKING_ANALYZING,
  EVENT_CLARIFY_TURN,
  EVENT_ERROR_GENERIC,
  EVENT_DONE_COMPLETE,
} from "@/test/fixtures/sse-sequences";
import type { SseEventSpec } from "@/test/msw/sse";

// ---------------------------------------------------------------------------
// Render helper — wraps HomeScreen + ClarifyScreen in MemoryRouter + SessionProvider.
// Does NOT pass chatService — the real SSE service is used, intercepted by MSW.
// ---------------------------------------------------------------------------

function renderApp(initialRoute = "/") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/clarify" element={<ClarifyScreen />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Helper: converts typed SSEEvent array to SseEventSpec[] for makeSseStream
// ---------------------------------------------------------------------------

function toSseSpecs(
  events: { event_type: string; [key: string]: unknown }[]
): SseEventSpec[] {
  return events.map((e) => ({ event: e.event_type, data: e }));
}

// ---------------------------------------------------------------------------
// Helper: builds a deferred SSE stream — the controller is returned so the
// caller can push events and close the stream at any point from the test.
// Used for tests that need to assert on intermediate states (loading, streaming)
// before the stream terminates.
// ---------------------------------------------------------------------------

function makeDeferredSseStream(): {
  stream: ReadableStream<Uint8Array>;
  push: (spec: SseEventSpec) => void;
  close: () => void;
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  function push(spec: SseEventSpec) {
    const json =
      typeof spec.data === "string" ? spec.data : JSON.stringify(spec.data);
    const block = `event: ${spec.event}\ndata: ${json}\n\n`;
    controller.enqueue(encoder.encode(block));
  }

  function close() {
    controller.close();
  }

  return { stream, push, close };
}

// SSE response headers used in all chat handler overrides
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// ---------------------------------------------------------------------------
// 1. Happy path: submit → loading → complete
// ---------------------------------------------------------------------------

describe("screen-level: happy path submit", () => {
  it("navigates to clarify screen and shows loading spinner after submitting a message", async () => {
    // Use a deferred stream so the loading state is stable while we assert
    const deferred = makeDeferredSseStream();

    server.use(
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        () =>
          new HttpResponse(deferred.stream, { status: 200, headers: SSE_HEADERS })
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "I have chicken and rice");
    await user.keyboard("{Enter}");

    // Push a thinking event so the screen transitions to loading/streaming
    deferred.push({
      event: "thinking",
      data: { event_type: "thinking", message: "Analyzing your request..." },
    });

    // Loading spinner should appear
    const spinner = await screen.findByTestId("clarify-loading-spinner");
    expect(spinner).toBeInTheDocument();
    expect(
      screen.getByText("Checking your ingredients for balance…")
    ).toBeInTheDocument();

    // Clean up — close the stream with a done event
    deferred.push({
      event: "done",
      data: {
        event_type: "done",
        status: "complete",
        reason: null,
        error_category: null,
      },
    });
    deferred.close();
  });

  it("shows completion state (clarify heading) after SSE stream finishes", async () => {
    server.use(
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        () =>
          new HttpResponse(
            makeSseStream(
              toSseSpecs([
                EVENT_THINKING_ANALYZING,
                EVENT_CLARIFY_TURN,
                EVENT_DONE_COMPLETE,
              ])
            ),
            { status: 200, headers: SSE_HEADERS }
          )
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "BBQ for 8 people");
    await user.keyboard("{Enter}");

    // The heading is split across elements: "Here's what I " + <span>see</span> + "."
    // Use getByRole('heading') to find it regardless of internal markup
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: /here's what i see/i,
    });
    expect(heading).toBeInTheDocument();

    // Spinner must be gone
    expect(screen.queryByTestId("clarify-loading-spinner")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. MSW request body assertion
// ---------------------------------------------------------------------------

describe("screen-level: MSW request body assertion", () => {
  it("sends correct message and screen in POST body", async () => {
    let capturedBody: { message?: string; screen?: string } = {};

    server.use(
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        async ({ request }) => {
          capturedBody = (await request.json()) as {
            message?: string;
            screen?: string;
          };
          return new HttpResponse(
            makeSseStream([
              {
                event: "thinking",
                data: { event_type: "thinking", message: "..." },
              },
              {
                event: "done",
                data: {
                  event_type: "done",
                  status: "complete",
                  reason: null,
                  error_category: null,
                },
              },
            ]),
            { status: 200, headers: SSE_HEADERS }
          );
        }
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "I have chicken, rice, and broccoli");
    await user.keyboard("{Enter}");

    // Wait for the stream to complete and completion state to appear
    await screen.findByRole(
      "heading",
      { level: 1, name: /here's what i see/i },
      { timeout: 5000 }
    );

    expect(capturedBody.message).toBe("I have chicken, rice, and broccoli");
    expect(capturedBody.screen).toBe("clarify");
  });
});

// ---------------------------------------------------------------------------
// 3. Error flow
// ---------------------------------------------------------------------------

describe("screen-level: error flow", () => {
  it("shows ErrorBanner with role=alert when SSE returns an error event", async () => {
    server.use(
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        () =>
          new HttpResponse(
            makeSseStream(
              toSseSpecs([EVENT_THINKING_ANALYZING, EVENT_ERROR_GENERIC])
            ),
            { status: 200, headers: SSE_HEADERS }
          )
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "Plan dinner");
    await user.keyboard("{Enter}");

    // ErrorBanner has role="alert"
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(EVENT_ERROR_GENERIC.message);
  });
});

// ---------------------------------------------------------------------------
// 4. Empty/whitespace message rejected
// ---------------------------------------------------------------------------

describe("screen-level: whitespace message rejected", () => {
  it("stays on home screen when only whitespace is submitted", async () => {
    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "   ");
    await user.keyboard("{Enter}");

    // Home screen stays visible
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
    // Clarify screen NOT rendered
    expect(screen.queryByTestId("screen-clarify")).not.toBeInTheDocument();
  });

  it("stays on home screen when input is empty (just Enter)", async () => {
    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.click(input);
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-clarify")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. SSE streaming events visible
// ---------------------------------------------------------------------------

describe("screen-level: SSE streaming events visible", () => {
  it("shows clarify questions after SEQUENCE_THINKING_CLARIFY completes", async () => {
    server.use(
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        () =>
          new HttpResponse(
            makeSseStream(
              toSseSpecs([
                EVENT_THINKING_ANALYZING,
                EVENT_CLARIFY_TURN,
                EVENT_DONE_COMPLETE,
              ])
            ),
            { status: 200, headers: SSE_HEADERS }
          )
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "Weekend BBQ for 8");
    await user.keyboard("{Enter}");

    // Wait for clarify questions from EVENT_CLARIFY_TURN fixture
    await screen.findByText(EVENT_CLARIFY_TURN.questions[0].text);
    expect(
      screen.getByText(EVENT_CLARIFY_TURN.questions[1].text)
    ).toBeInTheDocument();

    // "Looks good, show recipes" CTA appears
    expect(screen.getByText(/Looks good, show recipes/)).toBeInTheDocument();
  });

  it("shows loading spinner while stream is processing (deferred stream)", async () => {
    const deferred = makeDeferredSseStream();

    server.use(
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        () =>
          new HttpResponse(deferred.stream, { status: 200, headers: SSE_HEADERS })
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "I have leftover chicken");
    await user.keyboard("{Enter}");

    // Push a thinking event to ensure loading/streaming state
    deferred.push({
      event: "thinking",
      data: { event_type: "thinking", message: "Analyzing your request..." },
    });

    // Spinner appears during loading/streaming
    await screen.findByTestId("clarify-loading-spinner");
    expect(
      screen.getByText("Checking your ingredients for balance…")
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    // Clean up
    deferred.push({
      event: "done",
      data: {
        event_type: "done",
        status: "complete",
        reason: null,
        error_category: null,
      },
    });
    deferred.close();
  });
});

// ---------------------------------------------------------------------------
// 6. Session creation — POST /session is called before chat
// ---------------------------------------------------------------------------

describe("screen-level: session creation", () => {
  it("calls POST /session before the chat endpoint", async () => {
    let sessionCreated = false;
    let chatCalledAfterSession = false;

    server.use(
      http.post("http://localhost:8000/session", () => {
        sessionCreated = true;
        return HttpResponse.json({
          session_id: "test-session-id",
          created_at: "2026-04-15T00:00:00Z",
        });
      }),
      http.post(
        "http://localhost:8000/session/:sessionId/chat",
        () => {
          chatCalledAfterSession = sessionCreated;
          return new HttpResponse(
            makeSseStream([
              {
                event: "thinking",
                data: { event_type: "thinking", message: "..." },
              },
              {
                event: "done",
                data: {
                  event_type: "done",
                  status: "complete",
                  reason: null,
                  error_category: null,
                },
              },
            ]),
            { status: 200, headers: SSE_HEADERS }
          );
        }
      )
    );

    const user = userEvent.setup();
    renderApp("/");

    const input = screen.getByPlaceholderText(
      "BBQ for 8, or I have leftover chicken..."
    );
    await user.type(input, "Test message");
    await user.keyboard("{Enter}");

    // Wait for completion state
    await screen.findByRole(
      "heading",
      { level: 1, name: /here's what i see/i },
      { timeout: 5000 }
    );

    expect(sessionCreated).toBe(true);
    expect(chatCalledAfterSession).toBe(true);
  });
});
