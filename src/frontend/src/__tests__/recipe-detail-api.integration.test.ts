// recipe-detail-api.integration.test.ts
//
// Integration tests for getRecipeDetail:
//   1. Sends correct URL + Authorization header and returns parsed RecipeDetail
//   2. Throws RecipeNotFoundError on 404
//   3. Throws generic Error on 500

import { describe, it, expect, vi, afterEach } from "vitest";
import type { RecipeDetail } from "@/types/tools";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const RECIPE_DETAIL: RecipeDetail = {
  id: "r001",
  name: "Chicken Stir Fry",
  name_zh: "鸡肉炒菜",
  source: "kb",
  source_url: "",
  cuisine: "chinese",
  cooking_method: "stir-fry",
  effort_level: "quick",
  time_minutes: 20,
  flavor_tags: ["savory"],
  serves: 2,
  ingredients: [
    { name: "chicken breast", amount: "500g", pcsv: ["protein"] },
    { name: "broccoli", amount: "1 head", pcsv: ["veggie"] },
  ],
  instructions: "1. Heat oil. 2. Stir fry chicken. 3. Add broccoli.",
  is_ai_generated: false,
};

// ---------------------------------------------------------------------------
// Test 1: sends correct request and returns RecipeDetail
// ---------------------------------------------------------------------------

describe("getRecipeDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends correct URL + auth header and returns parsed RecipeDetail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // First call: /auth/verify
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "recipe-jwt", user_id: "u1" }),
        })
        // Second call: GET /recipe/r001
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => RECIPE_DETAIL,
        })
    );

    const { getRecipeDetail, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const result = await getRecipeDetail("r001");

    expect(result).toEqual(RECIPE_DETAIL);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [recipeUrl, recipeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(recipeUrl).toMatch(/\/recipe\/r001$/);

    const headers = recipeInit.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer recipe-jwt");
  });

  // ---------------------------------------------------------------------------
  // Test 2: throws RecipeNotFoundError on 404
  // ---------------------------------------------------------------------------

  it("throws RecipeNotFoundError on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "recipe-jwt", user_id: "u1" }),
        })
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );

    const { getRecipeDetail, resetAuthToken, RecipeNotFoundError } = await import(
      "@/services/api-client"
    );
    resetAuthToken();

    await expect(getRecipeDetail("missing")).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  // ---------------------------------------------------------------------------
  // Test 3: throws generic Error on 500
  // ---------------------------------------------------------------------------

  it("throws generic Error on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "recipe-jwt", user_id: "u1" }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 })
    );

    const { getRecipeDetail, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    await expect(getRecipeDetail("r001")).rejects.toThrow("Failed to get recipe detail: 500");
  });
});
