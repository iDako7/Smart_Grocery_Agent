// api-client.ts — low-level HTTP helpers for SGA V2 frontend
//
// All endpoints talk to the FastAPI backend.
// Auth header: Bearer JWT obtained from POST /auth/verify (dev credentials).

import type { GroceryListItem } from "@/types/api";
import type { GroceryStore } from "@/types/sse";

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

export function getApiBase(): string {
  return (import.meta.env as Record<string, string>).VITE_API_BASE ?? "http://localhost:8000";
}

// ---------------------------------------------------------------------------
// Auth token — cached module-level promise, reset between tests via resetAuthToken()
// ---------------------------------------------------------------------------

let _tokenPromise: Promise<string> | null = null;

/**
 * Obtain a dev-mode JWT. Phase 2 placeholder — hardcoded credentials.
 * The backend rejects this call in production mode (SGA_AUTH_MODE=prod → 501).
 * Phase 3 replaces this with real magic-link auth (Issue TBD).
 */
export function getAuthToken(): Promise<string> {
  if (!_tokenPromise) {
    _tokenPromise = (async () => {
      const url = `${getApiBase()}/auth/verify`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dev@sga.local", code: "000000" }),
      });
      if (!response.ok) {
        _tokenPromise = null;
        throw new Error(`Auth failed: ${response.status}`);
      }
      const data = (await response.json()) as { token: string; user_id: string };
      return data.token;
    })();
  }
  return _tokenPromise;
}

/** Reset cached auth token — for testing only. */
export function resetAuthToken(): void {
  _tokenPromise = null;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export async function createSession(): Promise<{
  session_id: string;
  created_at: string;
}> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/session`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }

  return response.json() as Promise<{ session_id: string; created_at: string }>;
}

// ---------------------------------------------------------------------------
// Grocery list generation
// ---------------------------------------------------------------------------

export async function postGroceryList(
  sessionId: string,
  items: GroceryListItem[]
): Promise<GroceryStore[]> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/session/${sessionId}/grocery-list`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    throw new Error(`Failed to generate grocery list: ${response.status}`);
  }
  return response.json() as Promise<GroceryStore[]>;
}
