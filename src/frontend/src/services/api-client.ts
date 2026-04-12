// api-client.ts — low-level HTTP helpers for SGA V2 frontend
//
// All endpoints talk to the FastAPI backend.
// No auth header needed — backend runs in dev mode (SGA_AUTH_MODE=dev).

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

export function getApiBase(): string {
  return (import.meta.env as Record<string, string>).VITE_API_BASE ?? "http://localhost:8000";
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export async function createSession(): Promise<{
  session_id: string;
  created_at: string;
}> {
  const url = `${getApiBase()}/session`;
  const response = await fetch(url, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }

  return response.json() as Promise<{ session_id: string; created_at: string }>;
}
