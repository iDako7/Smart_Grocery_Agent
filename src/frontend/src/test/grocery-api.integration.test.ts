// grocery-api.integration.test.ts — TDD RED phase
//
// Integration tests for postGroceryList:
//   1. Sends correct request (URL, method, auth header, body) and returns GroceryStore[]
//   2. Throws on non-ok response

import { describe, it, expect, vi, afterEach } from "vitest";
import type { GroceryListItem } from "@/types/api";
import type { GroceryStore } from "@/types/sse";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ITEMS: GroceryListItem[] = [
  { ingredient_name: "chicken breast", amount: "500g", recipe_name: "Stir Fry", recipe_id: "r1" },
  { ingredient_name: "broccoli", amount: "1 head" },
];

const GROCERY_STORES: GroceryStore[] = [
  {
    store_name: "Save-On-Foods",
    departments: [
      {
        name: "Meat & Seafood",
        items: [
          {
            id: "item-1",
            name: "chicken breast",
            amount: "500g",
            recipe_context: "Stir Fry",
            checked: false,
          },
        ],
      },
      {
        name: "Produce",
        items: [
          {
            id: "item-2",
            name: "broccoli",
            amount: "1 head",
            recipe_context: "",
            checked: false,
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Test 1: postGroceryList sends correct request and returns GroceryStore[]
// ---------------------------------------------------------------------------

describe("postGroceryList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends correct request and returns GroceryStore[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // First call: /auth/verify
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "grocery-jwt", user_id: "u1" }),
        })
        // Second call: POST /session/<id>/grocery-list
        .mockResolvedValueOnce({
          ok: true,
          json: async () => GROCERY_STORES,
        })
    );

    const { postGroceryList, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    const result = await postGroceryList("session-123", ITEMS);

    // Return value is the parsed GroceryStore[]
    expect(result).toEqual(GROCERY_STORES);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second call is the grocery-list endpoint
    const [groceryUrl, groceryInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    // Correct URL
    expect(groceryUrl).toMatch(/\/session\/session-123\/grocery-list$/);

    // Correct method
    expect(groceryInit.method).toBe("POST");

    // Correct auth header
    const headers = groceryInit.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer grocery-jwt");
    expect(headers["Content-Type"]).toBe("application/json");

    // Correct body
    const body = JSON.parse(groceryInit.body as string) as { items: GroceryListItem[] };
    expect(body).toEqual({ items: ITEMS });
  });

  // ---------------------------------------------------------------------------
  // Test 2: postGroceryList throws on non-ok response
  // ---------------------------------------------------------------------------

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // First call: /auth/verify succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: "grocery-jwt", user_id: "u1" }),
        })
        // Second call: grocery-list endpoint returns 500
        .mockResolvedValueOnce({ ok: false, status: 500 })
    );

    const { postGroceryList, resetAuthToken } = await import("@/services/api-client");
    resetAuthToken();

    await expect(postGroceryList("session-123", ITEMS)).rejects.toThrow(
      "Failed to generate grocery list: 500"
    );
  });
});
