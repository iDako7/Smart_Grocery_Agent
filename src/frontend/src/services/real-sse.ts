// real-sse.ts — real SSE client for SGA V2 frontend
//
// Implements ChatServiceHandler using the actual FastAPI backend.
// Session ID is maintained in closure — lazy creation on first call.
// Auth header: Bearer JWT obtained from getAuthToken() in api-client.
//
// Wire format from backend:
//   event: thinking
//   data: {"event_type":"thinking","message":"Running analyze_pcsv..."}
//
//   event: done
//   data: {"event_type":"done","status":"complete","reason":null}

import type { ChatServiceHandler } from "@/context/session-context";
import type { SSEEvent, ErrorEvent } from "@/types/sse";
import { getApiBase, createSession, getAuthToken } from "@/services/api-client";
import type { Screen } from "@/types/api";

// ---------------------------------------------------------------------------
// SSE stream parser
// Buffers incoming chunks, splits on \n\n block boundaries, and dispatches
// each block's event_type + data payload to the appropriate callback.
// ---------------------------------------------------------------------------

function parseSseBlock(block: string): { eventType: string; data: unknown } | null {
  const lines = block.split("\n").filter((l) => l.trim() !== "");

  let eventType = "";
  let dataStr = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const chunk = line.slice("data:".length).trim();
      dataStr = dataStr ? `${dataStr}\n${chunk}` : chunk;
    }
  }

  if (!eventType || !dataStr) return null;

  try {
    return { eventType, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: SSEEvent) => void,
  onDone: (status: "complete" | "partial", reason: string | null) => void,
  onError: (message: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  // Tracks whether a terminal event (done or non-recoverable error) was received.
  // If the stream closes without one, we report an unexpected connection drop.
  let completed = false;

  try {
    while (true) {
      if (signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double-newline SSE block boundaries
      const blocks = buffer.split("\n\n");
      // Last element may be incomplete — keep it in the buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;

        const parsed = parseSseBlock(block);
        if (!parsed) continue;

        const { eventType, data } = parsed;
        const payload = data as Record<string, unknown>;

        if (eventType === "done") {
          completed = true;
          onDone(
            payload.status as "complete" | "partial",
            (payload.reason as string | null) ?? null
          );
          return;
        }

        if (eventType === "error") {
          const errEvent = data as ErrorEvent;
          if (!errEvent.recoverable) {
            completed = true;
            onError(errEvent.message);
            return;
          }
          // Recoverable error — route through onEvent
          onEvent(data as SSEEvent);
          continue;
        }

        // All other events — route to onEvent
        onEvent(data as SSEEvent);
      }
    }

    // Stream closed without a terminal event — report unexpected drop
    // (unless the caller aborted intentionally)
    if (!completed && !signal.aborted) {
      onError("Connection closed unexpectedly");
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface SSEServiceOptions {
  onSessionCreated?: (id: string) => void;
}

export interface SSEService {
  handler: ChatServiceHandler;
  resetSession: () => void;
}

export function createRealSSEService(options?: SSEServiceOptions): SSEService {
  // Session ID lives in closure — shared across all calls from this service instance.
  let sessionIdPromise: Promise<string> | null = null;
  // Guards against stale onSessionCreated firing after resetSession() is called
  // while a session creation fetch is still in-flight.
  let generation = 0;

  function getOrCreateSession(): Promise<string> {
    if (!sessionIdPromise) {
      const thisGeneration = generation;
      sessionIdPromise = createSession()
        .then((r) => {
          if (thisGeneration === generation) {
            options?.onSessionCreated?.(r.session_id);
          }
          return r.session_id;
        })
        .catch((err) => {
          sessionIdPromise = null; // reset so next call retries
          return Promise.reject(err);
        });
    }
    return sessionIdPromise;
  }

  function resetSession(): void {
    sessionIdPromise = null;
    generation++;
  }

  const handler: ChatServiceHandler = function(
    message: string,
    screen: Screen,
    onEvent: (event: SSEEvent) => void,
    onDone: (status: "complete" | "partial", reason: string | null) => void,
    onError: (message: string) => void
  ): { cancel: () => void } {
    const abort = new AbortController();

    // Async work runs in IIFE; cancel() is available synchronously via abort.
    (async () => {
      try {
        const sessionId = await getOrCreateSession();

        if (abort.signal.aborted) return;

        const token = await getAuthToken();
        const url = `${getApiBase()}/session/${sessionId}/chat`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message, screen }),
          signal: abort.signal,
        });

        if (!response.ok) {
          console.error(`[real-sse] chat request failed: ${response.status}`);
          onError("Something went wrong. Please try again.");
          return;
        }

        if (!response.body) {
          onError("No response body from server");
          return;
        }

        await consumeSseStream(response.body, abort.signal, onEvent, onDone, onError);
      } catch (err) {
        if (abort.signal.aborted) return;
        console.error("[real-sse] connection error:", err);
        onError("Network error");
      }
    })();

    return { cancel: () => abort.abort() };
  };

  return { handler, resetSession };
}
