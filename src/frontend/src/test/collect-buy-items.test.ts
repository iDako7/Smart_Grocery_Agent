// collect-buy-items.test.ts — TDD RED phase
//
// Unit tests for collectBuyItems helper in src/services/grocery-helpers.ts
//
// XOR toggle logic (mirrors RecipeCard pill logic):
//   isFlipped  = excludedByCard.get(cardIndex)?.has(ing.name) ?? false
//   isChecked  = ing.have !== isFlipped   // XOR
//   collect when isChecked === false  (user does NOT have the ingredient)

import { describe, it, expect } from "vitest";
import { collectBuyItems } from "@/services/grocery-helpers";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const RECIPE_A = {
  name: "Stir Fry Chicken",
  id: "r-001",
  ingredients: [
    { name: "chicken breast", have: true },   // already have
    { name: "soy sauce", have: true },         // already have
    { name: "broccoli", have: false },          // need to buy
    { name: "garlic", have: false },            // need to buy
  ],
};

const RECIPE_B = {
  name: "Beef Fried Rice",
  id: "r-002",
  ingredients: [
    { name: "rice", have: true },              // already have
    { name: "beef strips", have: false },       // need to buy
    { name: "egg", have: false },              // need to buy
    { name: "sesame oil", have: true },        // already have
  ],
};

// ---------------------------------------------------------------------------
// Test 1: collects only need-to-buy items (have=false, not toggled)
// ---------------------------------------------------------------------------

describe("collectBuyItems", () => {
  it("collects only need-to-buy items when no ingredients are toggled", () => {
    const recipes = [RECIPE_A, RECIPE_B];
    const excludedByCard = new Map<number, Set<string>>();

    const result = collectBuyItems(recipes, excludedByCard);

    // Only have:false items should be collected — 4 total (2 per recipe)
    expect(result).toHaveLength(4);
    const names = result.map((item) => item.ingredient_name);
    expect(names).toContain("broccoli");
    expect(names).toContain("garlic");
    expect(names).toContain("beef strips");
    expect(names).toContain("egg");

    // have:true items must NOT be collected
    expect(names).not.toContain("chicken breast");
    expect(names).not.toContain("soy sauce");
    expect(names).not.toContain("rice");
    expect(names).not.toContain("sesame oil");
  });

  // ---------------------------------------------------------------------------
  // Test 2: excludes toggled-off buy items (have=false, toggled → user says they have it)
  // ---------------------------------------------------------------------------

  it("excludes toggled-off buy items (have=false ingredient toggled by user)", () => {
    const recipe = {
      name: "Simple Bowl",
      id: "r-010",
      ingredients: [
        { name: "tofu", have: false },    // need to buy
        { name: "spinach", have: false }, // need to buy — but user will toggle this off
      ],
    };

    // User toggles off "spinach" at card index 0
    const excludedByCard = new Map<number, Set<string>>();
    excludedByCard.set(0, new Set(["spinach"]));

    const result = collectBuyItems([recipe], excludedByCard);

    // "spinach" is toggled: have=false, isFlipped=true → isChecked=true → skip
    // "tofu" is not toggled: have=false, isFlipped=false → isChecked=false → collect
    expect(result).toHaveLength(1);
    expect(result[0].ingredient_name).toBe("tofu");
  });

  // ---------------------------------------------------------------------------
  // Test 3: includes toggled-on have items (have=true, toggled → user doesn't have it)
  // ---------------------------------------------------------------------------

  it("includes toggled have items (have=true ingredient toggled → need to buy)", () => {
    const recipe = {
      name: "Pasta Primavera",
      id: "r-020",
      ingredients: [
        { name: "pasta", have: true },        // have it (green pill)
        { name: "tomatoes", have: true },      // have it — but user toggles it off
        { name: "basil", have: false },        // need to buy
      ],
    };

    // User toggles "tomatoes" at card index 0 — they ran out
    const excludedByCard = new Map<number, Set<string>>();
    excludedByCard.set(0, new Set(["tomatoes"]));

    const result = collectBuyItems([recipe], excludedByCard);

    // "tomatoes": have=true, isFlipped=true → isChecked=false → collect
    // "basil": have=false, isFlipped=false → isChecked=false → collect
    // "pasta": have=true, isFlipped=false → isChecked=true → skip
    expect(result).toHaveLength(2);
    const names = result.map((i) => i.ingredient_name);
    expect(names).toContain("tomatoes");
    expect(names).toContain("basil");
    expect(names).not.toContain("pasta");
  });

  // ---------------------------------------------------------------------------
  // Test 4: returns empty array when all items are already in possession
  // ---------------------------------------------------------------------------

  it("returns empty array when all ingredients are have:true and none toggled", () => {
    const recipe = {
      name: "Pantry Scramble",
      id: "r-030",
      ingredients: [
        { name: "eggs", have: true },
        { name: "butter", have: true },
        { name: "salt", have: true },
      ],
    };

    const result = collectBuyItems([recipe], new Map());

    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Test 5: attributes items to the correct recipe
  // ---------------------------------------------------------------------------

  it("sets recipe_name and recipe_id correctly for each collected item", () => {
    const recipes = [RECIPE_A, RECIPE_B];
    const excludedByCard = new Map<number, Set<string>>();

    const result = collectBuyItems(recipes, excludedByCard);

    // RECIPE_A items
    const broccoliItem = result.find((i) => i.ingredient_name === "broccoli");
    expect(broccoliItem).toBeDefined();
    expect(broccoliItem!.recipe_name).toBe("Stir Fry Chicken");
    expect(broccoliItem!.recipe_id).toBe("r-001");

    const garlicItem = result.find((i) => i.ingredient_name === "garlic");
    expect(garlicItem).toBeDefined();
    expect(garlicItem!.recipe_name).toBe("Stir Fry Chicken");
    expect(garlicItem!.recipe_id).toBe("r-001");

    // RECIPE_B items
    const beefItem = result.find((i) => i.ingredient_name === "beef strips");
    expect(beefItem).toBeDefined();
    expect(beefItem!.recipe_name).toBe("Beef Fried Rice");
    expect(beefItem!.recipe_id).toBe("r-002");

    const eggItem = result.find((i) => i.ingredient_name === "egg");
    expect(eggItem).toBeDefined();
    expect(eggItem!.recipe_name).toBe("Beef Fried Rice");
    expect(eggItem!.recipe_id).toBe("r-002");
  });

  // ---------------------------------------------------------------------------
  // Test 6: handles empty recipes array
  // ---------------------------------------------------------------------------

  it("returns empty array when recipes input is empty", () => {
    const result = collectBuyItems([], new Map());

    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Bonus: defaults recipe_id to empty string when id is undefined
  // ---------------------------------------------------------------------------

  it("defaults recipe_id to empty string when recipe has no id", () => {
    const recipe = {
      name: "No-ID Recipe",
      // id intentionally omitted
      ingredients: [{ name: "onion", have: false }],
    };

    const result = collectBuyItems([recipe], new Map());

    expect(result).toHaveLength(1);
    expect(result[0].recipe_id).toBe("");
  });
});
