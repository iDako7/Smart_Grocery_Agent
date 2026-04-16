// sse.ts — SSE stream helper for MSW handlers
//
// Produces a ReadableStream<Uint8Array> that emits SSE-formatted blocks
// consumable by the real-sse.ts client parser.
//
// Wire format expected by consumeSseStream() in real-sse.ts:
//   event: <eventType>\ndata: <json>\n\n
//
// The client splits on "\n\n" to get blocks, then splits each block on "\n"
// and looks for lines prefixed with "event:" and "data:".

export type SseEventSpec = {
  /** SSE event type (maps to `event:` line). */
  event: string;
  /** Payload — serialized as JSON on the `data:` line. */
  data: unknown;
};

/**
 * Encodes a single SSE event as a UTF-8 Uint8Array block.
 * Format: "event: {event}\ndata: {json}\n\n"
 */
function encodeSseBlock(spec: SseEventSpec): Uint8Array {
  const json = typeof spec.data === "string" ? spec.data : JSON.stringify(spec.data);
  const block = `event: ${spec.event}\ndata: ${json}\n\n`;
  return new TextEncoder().encode(block);
}

/**
 * Returns a ReadableStream that emits each event as an SSE block and then
 * closes. All chunks are enqueued synchronously so the stream terminates
 * deterministically in test environments (no timers needed).
 *
 * Usage in an MSW handler:
 *   const stream = makeSseStream([
 *     { event: "thinking", data: { event_type: "thinking", message: "..." } },
 *     { event: "done",     data: { event_type: "done", status: "complete", reason: null, error_category: null } },
 *   ]);
 *   return new HttpResponse(stream, { headers: { "Content-Type": "text/event-stream" } });
 */
export function makeSseStream(events: SseEventSpec[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const spec of events) {
        controller.enqueue(encodeSseBlock(spec));
      }
      controller.close();
    },
  });
}

/**
 * Returns a deferred SSE stream with manual push/close control.
 * Use for tests that need to assert intermediate states (loading, streaming)
 * before the stream terminates.
 *
 * Usage:
 *   const { stream, push, close } = makeDeferredSseStream();
 *   server.use(http.post(..., () => new HttpResponse(stream, { headers: SSE_HEADERS })));
 *   // ... trigger fetch ...
 *   push({ event: "thinking", data: { event_type: "thinking", message: "..." } });
 *   // ... assert intermediate state ...
 *   push({ event: "done", data: { ... } });
 *   close();
 */
export function makeDeferredSseStream(): {
  stream: ReadableStream<Uint8Array>;
  push: (spec: SseEventSpec) => void;
  close: () => void;
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  return {
    stream,
    push(spec: SseEventSpec) {
      controller.enqueue(encodeSseBlock(spec));
    },
    close() {
      controller.close();
    },
  };
}
