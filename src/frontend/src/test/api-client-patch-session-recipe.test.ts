// api-client-patch-session-recipe.test.ts — TDD RED phase
//
// Tests for patchSessionRecipe(sessionId, index, recipe) in api-client.ts.
// Follows the same fetch-mock pattern as api-client-saved.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecipeSummary } from "@/types/tools";

const AUTH_RESPONSE = {
  ok: true,
  json: async () => ({ token: "test-jwt", user_id: "u1" }),
};

function okResponse<T>(body: T) {
  return { ok: true, json: async () => body };
}

const RECIPE_D: RecipeSummary = {
  id: "r_d",
  name: "Recipe D",
  name_zh: "",
  cuisine: "Chinese",
  cooking_method: "stir-fry",
  effort_level: "quick",
  flavor_tags: ["Savory"],
  serves: 2,
  pcsv_roles: {},
  ingredients: [
    { name: "tofu", amount: "200g", pcsv: ["protein"] },
    { name: "ginger", amount: "1 tsp", pcsv: ["sauce"] },
  ],
  ingredients_have: ["tofu"],
  ingredients_need: ["ginger"],
  alternatives: [],
};

const PATCH_RESPONSE = {
  session_id: "sess-1",
  screen: "recipes",
  recipes: [RECIPE_D],
  pcsv: null,
  grocery_list: null,
  conversation: [],
};

describe("patchSessionRecipe", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();
  });

  it("PATCHes /session/:id/recipes with correct body and returns updated session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(PATCH_RESPONSE))
    );

    const { patchSessionRecipe } = await import("@/services/api-client");
    const result = await patchSessionRecipe("sess-1", 0, RECIPE_D);

    expect(result).toEqual(PATCH_RESPONSE);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/session\/sess-1\/recipes$/);
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-jwt");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as { index: number; recipe: RecipeSummary };
    expect(body.index).toBe(0);
    expect(body.recipe.id).toBe("r_d");
  });

  it("passes the correct index in the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce(okResponse(PATCH_RESPONSE))
    );

    const { patchSessionRecipe } = await import("@/services/api-client");
    await patchSessionRecipe("sess-1", 2, RECIPE_D);

    const fetchMock = vi.mocked(globalThis.fetch);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { index: number };
    expect(body.index).toBe(2);
  });

  it("throws on 400 (out-of-range index)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 400 })
    );

    const { patchSessionRecipe } = await import("@/services/api-client");
    await expect(patchSessionRecipe("sess-1", 99, RECIPE_D)).rejects.toThrow("400");
  });

  it("throws on 404 (session not found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );

    const { patchSessionRecipe } = await import("@/services/api-client");
    await expect(patchSessionRecipe("no-such-session", 0, RECIPE_D)).rejects.toThrow("404");
  });

  it("throws on 422 (malformed body)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(AUTH_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 422 })
    );

    const { patchSessionRecipe } = await import("@/services/api-client");
    await expect(patchSessionRecipe("sess-1", 0, RECIPE_D)).rejects.toThrow("422");
  });
});
