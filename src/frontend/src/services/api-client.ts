// api-client.ts — low-level HTTP helpers for SGA V2 frontend
//
// All endpoints talk to the FastAPI backend.
// Auth header: Bearer JWT obtained from POST /auth/verify (dev credentials).

import type {
  GroceryListItem,
  SavedMealPlan,
  SavedMealPlanSummary,
  SavedRecipe,
  SavedRecipeSummary,
  SavedGroceryList,
  SavedGroceryListSummary,
} from "@/types/api";
import type { GroceryStore } from "@/types/sse";
import type { RecipeDetail } from "@/types/tools";

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

// ---------------------------------------------------------------------------
// Saved content — POST (create from session)
// ---------------------------------------------------------------------------

export async function saveMealPlan(name: string, sessionId: string): Promise<SavedMealPlan> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/meal-plans`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, session_id: sessionId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save meal plan: ${response.status}`);
  }
  return response.json() as Promise<SavedMealPlan>;
}

export async function saveGroceryList(name: string, sessionId: string): Promise<SavedGroceryList> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/grocery-lists`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, session_id: sessionId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save grocery list: ${response.status}`);
  }
  return response.json() as Promise<SavedGroceryList>;
}

// ---------------------------------------------------------------------------
// Saved content — GET list
// ---------------------------------------------------------------------------

export async function listSavedMealPlans(): Promise<SavedMealPlanSummary[]> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/meal-plans`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to list saved meal plans: ${response.status}`);
  }
  return response.json() as Promise<SavedMealPlanSummary[]>;
}

export async function listSavedRecipes(): Promise<SavedRecipeSummary[]> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/recipes`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to list saved recipes: ${response.status}`);
  }
  return response.json() as Promise<SavedRecipeSummary[]>;
}

export async function listSavedGroceryLists(): Promise<SavedGroceryListSummary[]> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/grocery-lists`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to list saved grocery lists: ${response.status}`);
  }
  return response.json() as Promise<SavedGroceryListSummary[]>;
}

// ---------------------------------------------------------------------------
// Saved content — GET by ID
// ---------------------------------------------------------------------------

export async function getSavedMealPlan(id: string): Promise<SavedMealPlan> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/meal-plans/${id}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to get saved meal plan: ${response.status}`);
  }
  return response.json() as Promise<SavedMealPlan>;
}

export async function getSavedRecipe(id: string): Promise<SavedRecipe> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/recipes/${id}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to get saved recipe: ${response.status}`);
  }
  return response.json() as Promise<SavedRecipe>;
}

// ---------------------------------------------------------------------------
// Recipe detail — GET /recipe/{id}
// ---------------------------------------------------------------------------

export class RecipeNotFoundError extends Error {
  recipeId: string;
  constructor(recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = "RecipeNotFoundError";
    this.recipeId = recipeId;
  }
}

export async function getRecipeDetail(recipeId: string): Promise<RecipeDetail> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/recipe/${encodeURIComponent(recipeId)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    throw new RecipeNotFoundError(recipeId);
  }
  if (!response.ok) {
    throw new Error(`Failed to get recipe detail: ${response.status}`);
  }
  return response.json() as Promise<RecipeDetail>;
}

export async function getSavedGroceryList(id: string): Promise<SavedGroceryList> {
  const token = await getAuthToken();
  const url = `${getApiBase()}/saved/grocery-lists/${id}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to get saved grocery list: ${response.status}`);
  }
  return response.json() as Promise<SavedGroceryList>;
}
