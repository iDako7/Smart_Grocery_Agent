// handlers.ts — MSW v2 request handlers for SGA V2 frontend tests
//
// API base: http://localhost:8000 (matches getApiBase() default in api-client.ts)
//
// Handler groups:
//   - Auth       POST /auth/verify
//   - Session    POST /session, POST /session/:sessionId/chat (SSE)
//   - Grocery    POST /session/:sessionId/grocery-list
//   - Saved      GET/POST /saved/meal-plans, GET /saved/meal-plans/:id
//               GET/POST /saved/recipes,    GET /saved/recipes/:id
//               GET/POST /saved/grocery-lists, GET/PATCH /saved/grocery-lists/:id
//   - Recipe     GET /recipe/:id
//   - Session    PATCH /session/:sessionId/recipes
//
// These are intentionally minimal stubs — just enough to not break existing
// tests and to serve as extension points for B2/B3 sub-issues.

import { http, HttpResponse } from "msw";
import { BASE, SSE_HEADERS } from "./constants";
import { makeSseStream, toSseSpecs } from "./sse";
import { STORES_API_RESPONSE } from "../fixtures/grocery";
import {
  EVENT_THINKING_ANALYZING,
  EVENT_DONE_COMPLETE,
} from "../fixtures/sse-sequences";


// ---------------------------------------------------------------------------
// Minimal fixture shapes
// Cross-ref: contracts/api_types.py (SavedMealPlan, SavedGroceryList,
// SavedRecipeSummary, SavedRecipeDetail, SessionState).
// If contract schemas change, update these stubs to match.
// ---------------------------------------------------------------------------

const STUB_TIMESTAMP = "2026-04-15T00:00:00Z";

const STUB_MEAL_PLAN = {
  id: "stub-meal-plan-id",
  name: "Stub Meal Plan",
  recipes: [],
  created_at: STUB_TIMESTAMP,
  updated_at: STUB_TIMESTAMP,
};

const STUB_GROCERY_LIST = {
  id: "stub-grocery-list-id",
  name: "Stub Grocery List",
  stores: [],
  created_at: STUB_TIMESTAMP,
  updated_at: STUB_TIMESTAMP,
};

const STUB_RECIPE_SUMMARY = {
  id: "stub-recipe-id",
  recipe_name: "Stub Recipe",
  recipe_name_zh: "",
  created_at: STUB_TIMESTAMP,
  updated_at: STUB_TIMESTAMP,
};

const STUB_SAVED_RECIPE = {
  id: "stub-saved-recipe-id",
  recipe_snapshot: {
    id: "stub-recipe-id",
    name: "Stub Recipe",
    name_zh: "",
    source: "KB",
    source_url: "",
    cuisine: "Other",
    cooking_method: "other",
    effort_level: "quick",
    time_minutes: 30,
    flavor_tags: [],
    serves: 2,
    ingredients: [],
    instructions: "",
    is_ai_generated: false,
  },
  notes: "",
  created_at: STUB_TIMESTAMP,
  updated_at: STUB_TIMESTAMP,
};

const STUB_SESSION_STATE = {
  session_id: "test-session-id",
  screen: "home",
  recipes: [],
  pcsv: null,
  grocery_list: null,
  conversation: [],
};

// ---------------------------------------------------------------------------
// Default SSE events for the chat stub — derived from typed fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CHAT_SSE_EVENTS = toSseSpecs([
  EVENT_THINKING_ANALYZING,
  EVENT_DONE_COMPLETE,
]);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  // Auth — dev token endpoint
  http.post(`${BASE}/auth/verify`, () => {
    return HttpResponse.json({ token: "msw-test-jwt", user_id: "msw-user-id" });
  }),

  // Session creation
  http.post(`${BASE}/session`, () => {
    return HttpResponse.json({
      session_id: "test-session-id",
      created_at: STUB_TIMESTAMP,
    });
  }),

  // Chat (SSE stream) — returns a minimal thinking + done stream
  http.post(`${BASE}/session/:sessionId/chat`, () => {
    const stream = makeSseStream(DEFAULT_CHAT_SSE_EVENTS);
    return new HttpResponse(stream, {
      status: 200,
      headers: SSE_HEADERS,
    });
  }),

  // Grocery list generation
  http.post(`${BASE}/session/:sessionId/grocery-list`, () => {
    return HttpResponse.json(STORES_API_RESPONSE);
  }),

  // Session recipe swap
  http.patch(`${BASE}/session/:sessionId/recipes`, () => {
    return HttpResponse.json(STUB_SESSION_STATE);
  }),

  // ---------------------------------------------------------------------------
  // Saved meal plans
  // ---------------------------------------------------------------------------

  http.get(`${BASE}/saved/meal-plans`, () => {
    return HttpResponse.json([]);
  }),

  http.post(`${BASE}/saved/meal-plans`, () => {
    return HttpResponse.json(STUB_MEAL_PLAN);
  }),

  http.get(`${BASE}/saved/meal-plans/:id`, () => {
    return HttpResponse.json(STUB_MEAL_PLAN);
  }),

  http.patch(`${BASE}/saved/meal-plans/:id`, () => {
    return HttpResponse.json(STUB_MEAL_PLAN);
  }),

  http.delete(`${BASE}/saved/meal-plans/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------------------------------------------------------------------------
  // Saved recipes
  // ---------------------------------------------------------------------------

  http.get(`${BASE}/saved/recipes`, () => {
    return HttpResponse.json([STUB_RECIPE_SUMMARY]);
  }),

  http.post(`${BASE}/saved/recipes`, () => {
    return HttpResponse.json(STUB_SAVED_RECIPE);
  }),

  http.get(`${BASE}/saved/recipes/:id`, () => {
    return HttpResponse.json(STUB_SAVED_RECIPE);
  }),

  http.patch(`${BASE}/saved/recipes/:id`, () => {
    return HttpResponse.json(STUB_SAVED_RECIPE);
  }),

  http.delete(`${BASE}/saved/recipes/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------------------------------------------------------------------------
  // Saved grocery lists
  // ---------------------------------------------------------------------------

  http.get(`${BASE}/saved/grocery-lists`, () => {
    return HttpResponse.json([]);
  }),

  http.post(`${BASE}/saved/grocery-lists`, () => {
    return HttpResponse.json(STUB_GROCERY_LIST);
  }),

  http.get(`${BASE}/saved/grocery-lists/:id`, () => {
    return HttpResponse.json(STUB_GROCERY_LIST);
  }),

  http.put(`${BASE}/saved/grocery-lists/:id`, () => {
    return HttpResponse.json(STUB_GROCERY_LIST);
  }),

  http.patch(`${BASE}/saved/grocery-lists/:id`, () => {
    return HttpResponse.json(STUB_GROCERY_LIST);
  }),

  http.delete(`${BASE}/saved/grocery-lists/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------------------------------------------------------------------------
  // Recipe detail
  // ---------------------------------------------------------------------------

  http.get(`${BASE}/recipe/:id`, () => {
    return HttpResponse.json(STUB_SAVED_RECIPE.recipe_snapshot);
  }),
];
