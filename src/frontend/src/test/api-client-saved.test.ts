// api-client-saved.test.ts — TDD RED phase
//
// Integration tests for saved content API client functions.
// Each test:
//   1. Mocks fetch — auth call first, then endpoint call
//   2. Calls the function under test
//   3. Asserts fetch was called with correct URL, method, headers, and body
//   4. Asserts the return value matches the mocked response

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SavedMealPlan,
  SavedMealPlanSummary,
  SavedRecipe,
  SavedRecipeSummary,
  SavedGroceryList,
  SavedGroceryListSummary,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_RESPONSE = {
  ok: true,
  json: async () => ({ token: "test-jwt", user_id: "u1" }),
};

const MEAL_PLAN: SavedMealPlan = {
  id: "mp-1",
  name: "Week 1",
  recipes: [],
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const MEAL_PLAN_SUMMARY: SavedMealPlanSummary = {
  id: "mp-1",
  name: "Week 1",
  recipe_count: 3,
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const SAVED_RECIPE: SavedRecipe = {
  id: "sr-1",
  recipe_snapshot: {
    id: "r-1",
    name: "Mapo Tofu",
    name_zh: "麻婆豆腐",
    source: "KB",
    source_url: "",
    cuisine: "Chinese",
    cooking_method: "stir-fry",
    effort_level: "medium",
    time_minutes: 30,
    flavor_tags: [],
    serves: 4,
    ingredients: [],
    instructions: "",
    is_ai_generated: false,
  },
  notes: "Great with rice",
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const SAVED_RECIPE_SUMMARY: SavedRecipeSummary = {
  id: "sr-1",
  recipe_name: "Mapo Tofu",
  recipe_name_zh: "麻婆豆腐",
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const GROCERY_LIST: SavedGroceryList = {
  id: "gl-1",
  name: "This week",
  stores: [],
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const GROCERY_LIST_SUMMARY: SavedGroceryListSummary = {
  id: "gl-1",
  name: "This week",
  item_count: 5,
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse<T>(body: T) {
  return { ok: true, json: async () => body };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saveMealPlan", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("POSTs to /saved/meal-plans with correct body and returns SavedMealPlan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(MEAL_PLAN))
    );

    const { saveMealPlan } = await import("@/services/api-client");
    const result = await saveMealPlan("Week 1", "session-abc");

    expect(result).toEqual(MEAL_PLAN);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/meal-plans$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as { name: string; session_id: string };
    expect(body.name).toBe("Week 1");
    expect(body.session_id).toBe("session-abc");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 500 })
    );

    const { saveMealPlan } = await import("@/services/api-client");
    await expect(saveMealPlan("Week 1", "session-abc")).rejects.toThrow("500");
  });
});

describe("saveGroceryList", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("POSTs to /saved/grocery-lists with correct body and returns SavedGroceryList", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(GROCERY_LIST))
    );

    const { saveGroceryList } = await import("@/services/api-client");
    const result = await saveGroceryList("This week", "session-xyz");

    expect(result).toEqual(GROCERY_LIST);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/grocery-lists$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as { name: string; session_id: string };
    expect(body.name).toBe("This week");
    expect(body.session_id).toBe("session-xyz");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 422 })
    );

    const { saveGroceryList } = await import("@/services/api-client");
    await expect(saveGroceryList("This week", "session-xyz")).rejects.toThrow("422");
  });
});

describe("listSavedMealPlans", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("GETs /saved/meal-plans and returns SavedMealPlanSummary[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse([MEAL_PLAN_SUMMARY]))
    );

    const { listSavedMealPlans } = await import("@/services/api-client");
    const result = await listSavedMealPlans();

    expect(result).toEqual([MEAL_PLAN_SUMMARY]);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/meal-plans$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 503 })
    );

    const { listSavedMealPlans } = await import("@/services/api-client");
    await expect(listSavedMealPlans()).rejects.toThrow("503");
  });
});

describe("listSavedRecipes", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("GETs /saved/recipes and returns SavedRecipeSummary[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse([SAVED_RECIPE_SUMMARY]))
    );

    const { listSavedRecipes } = await import("@/services/api-client");
    const result = await listSavedRecipes();

    expect(result).toEqual([SAVED_RECIPE_SUMMARY]);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/recipes$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );

    const { listSavedRecipes } = await import("@/services/api-client");
    await expect(listSavedRecipes()).rejects.toThrow("404");
  });
});

describe("listSavedGroceryLists", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("GETs /saved/grocery-lists and returns SavedGroceryListSummary[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse([GROCERY_LIST_SUMMARY]))
    );

    const { listSavedGroceryLists } = await import("@/services/api-client");
    const result = await listSavedGroceryLists();

    expect(result).toEqual([GROCERY_LIST_SUMMARY]);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/grocery-lists$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 500 })
    );

    const { listSavedGroceryLists } = await import("@/services/api-client");
    await expect(listSavedGroceryLists()).rejects.toThrow("500");
  });
});

describe("getSavedMealPlan", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("GETs /saved/meal-plans/:id and returns SavedMealPlan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(MEAL_PLAN))
    );

    const { getSavedMealPlan } = await import("@/services/api-client");
    const result = await getSavedMealPlan("mp-1");

    expect(result).toEqual(MEAL_PLAN);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/meal-plans\/mp-1$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );

    const { getSavedMealPlan } = await import("@/services/api-client");
    await expect(getSavedMealPlan("mp-missing")).rejects.toThrow("404");
  });
});

describe("getSavedRecipe", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("GETs /saved/recipes/:id and returns SavedRecipe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(SAVED_RECIPE))
    );

    const { getSavedRecipe } = await import("@/services/api-client");
    const result = await getSavedRecipe("sr-1");

    expect(result).toEqual(SAVED_RECIPE);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/recipes\/sr-1$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );

    const { getSavedRecipe } = await import("@/services/api-client");
    await expect(getSavedRecipe("sr-missing")).rejects.toThrow("404");
  });
});

describe("getSavedGroceryList", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("GETs /saved/grocery-lists/:id and returns SavedGroceryList", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(GROCERY_LIST))
    );

    const { getSavedGroceryList } = await import("@/services/api-client");
    const result = await getSavedGroceryList("gl-1");

    expect(result).toEqual(GROCERY_LIST);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/saved\/grocery-lists\/gl-1$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );

    const { getSavedGroceryList } = await import("@/services/api-client");
    await expect(getSavedGroceryList("gl-missing")).rejects.toThrow("404");
  });
});
