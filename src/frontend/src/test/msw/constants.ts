// Shared MSW test constants — imported by handlers.ts and test files.
// Single source of truth so B3 test files don't duplicate these inline.

export const BASE = "http://localhost:8000";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;
