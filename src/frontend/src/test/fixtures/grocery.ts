// Typed test fixtures for grocery list data.
// Consolidates GroceryStore[] shapes that appear across grocery-screen.test.tsx,
// recipes-screen.test.tsx, and grocery-api.integration.test.ts.

import type { GroceryStore, GroceryItem, GroceryDepartment } from "@/types/sse";
import type { GroceryListItem } from "@/types/api";

// ---------------------------------------------------------------------------
// Individual GroceryItem entries
// ---------------------------------------------------------------------------

export const ITEM_CHICKEN_BREAST: GroceryItem = {
  id: "i1",
  name: "chicken breast",
  amount: "500g",
  recipe_context: "Stir Fry",
  checked: false,
};

export const ITEM_BROCCOLI: GroceryItem = {
  id: "i2",
  name: "broccoli",
  amount: "1 head",
  recipe_context: "",
  checked: false,
};

export const ITEM_OLIVE_OIL: GroceryItem = {
  id: "i3",
  name: "olive oil",
  amount: "3L",
  recipe_context: "",
  checked: false,
};

export const ITEM_SCALLION: GroceryItem = {
  id: "i4",
  name: "scallion",
  amount: "1 bunch",
  recipe_context: "Garlic Shrimp Stir-Fry",
  checked: false,
};

export const ITEM_BOK_CHOY: GroceryItem = {
  id: "i5",
  name: "bok choy",
  amount: "1 head",
  recipe_context: "Garlic Shrimp Stir-Fry",
  checked: false,
};

export const ITEM_CHIPOTLE: GroceryItem = {
  id: "i6",
  name: "chipotle",
  amount: "2 cans",
  recipe_context: "Chicken Tinga Tacos",
  checked: false,
};

// ---------------------------------------------------------------------------
// GroceryItem factory — use instead of duplicating base items with different ids
// ---------------------------------------------------------------------------

const defaultGroceryItem: GroceryItem = {
  id: "item-1",
  name: "grocery item",
  amount: "1",
  recipe_context: "",
  checked: false,
};

export function makeGroceryItem(
  overrides?: Partial<GroceryItem>
): GroceryItem {
  return { ...defaultGroceryItem, ...overrides };
}

// For grocery-api.integration.test.ts canonical shape
export const ITEM_CHICKEN_BREAST_CANONICAL: GroceryItem = makeGroceryItem({
  id: "item-1",
  name: "chicken breast",
  amount: "500g",
  recipe_context: "Stir Fry",
});

export const ITEM_BROCCOLI_CANONICAL: GroceryItem = makeGroceryItem({
  id: "item-2",
  name: "broccoli",
  amount: "1 head",
});

// ---------------------------------------------------------------------------
// GroceryStore arrays — reusable multi-store fixtures
// ---------------------------------------------------------------------------

/**
 * Two-store fixture used by grocery-screen.test.tsx (T3–T16).
 * Store 1: Save-On-Foods (Meat & Seafood dept — chicken breast + broccoli)
 * Store 2: Costco (Bulk dept — olive oil)
 */
export const STORES_TWO: GroceryStore[] = [
  {
    store_name: "Save-On-Foods",
    departments: [
      {
        name: "Meat & Seafood",
        items: [ITEM_CHICKEN_BREAST, ITEM_BROCCOLI],
      } satisfies GroceryDepartment,
    ],
  },
  {
    store_name: "Costco",
    departments: [
      {
        name: "Bulk",
        items: [ITEM_OLIVE_OIL],
      } satisfies GroceryDepartment,
    ],
  },
];

/**
 * Single-store fixture used by recipes-screen.test.tsx (T9, T16, T17).
 * Store: Save-On-Foods (Produce dept — scallion, bok choy, chipotle)
 */
export const STORES_RECIPES_SCREEN: GroceryStore[] = [
  {
    store_name: "Save-On-Foods",
    departments: [
      {
        name: "Produce",
        items: [ITEM_SCALLION, ITEM_BOK_CHOY, ITEM_CHIPOTLE],
      } satisfies GroceryDepartment,
    ],
  },
];

/**
 * Single-store fixture used by grocery-api.integration.test.ts.
 * Matches the exact shape returned by the postGroceryList endpoint mock.
 */
export const STORES_API_RESPONSE: GroceryStore[] = [
  {
    store_name: "Save-On-Foods",
    departments: [
      {
        name: "Meat & Seafood",
        items: [ITEM_CHICKEN_BREAST_CANONICAL],
      } satisfies GroceryDepartment,
      {
        name: "Produce",
        items: [ITEM_BROCCOLI_CANONICAL],
      } satisfies GroceryDepartment,
    ],
  },
];

// ---------------------------------------------------------------------------
// GroceryListItem arrays — POST body fixtures for postGroceryList
// ---------------------------------------------------------------------------

/**
 * Two-item POST body used in grocery-api.integration.test.ts.
 */
export const GROCERY_LIST_ITEMS: GroceryListItem[] = [
  {
    ingredient_name: "chicken breast",
    amount: "500g",
    recipe_name: "Stir Fry",
    recipe_id: "r1",
  },
  {
    ingredient_name: "broccoli",
    amount: "1 head",
  },
];
