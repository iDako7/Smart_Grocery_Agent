// Typed test fixtures for RecipesScreen tests (issue #39).
// Single source of truth for test data.

import type { RecipeSummary, PCSVResult } from "@/types/tools";
import type { RecipeCardEvent, PcsvUpdateEvent } from "@/types/sse";

// ---------------------------------------------------------------------------
// RecipeSummary factory
// ---------------------------------------------------------------------------

const defaultRecipe: RecipeSummary = {
  id: "r_garlic_shrimp",
  name: "Garlic Shrimp Stir-Fry",
  name_zh: "蒜蓉蝦炒",
  cuisine: "Chinese",
  cooking_method: "Stir-fry",
  effort_level: "quick",
  flavor_tags: ["Savory", "Garlicky", "Umami"],
  serves: 2,
  pcsv_roles: {
    protein: ["shrimp"],
    carb: ["rice"],
    veggie: ["scallion", "bok choy"],
    sauce: ["soy sauce", "garlic"],
  },
  ingredients_have: ["shrimp", "garlic", "soy sauce"],
  ingredients_need: ["scallion", "bok choy"],
};

export function makeRecipeSummary(
  overrides?: Partial<RecipeSummary>
): RecipeSummary {
  return { ...defaultRecipe, ...overrides };
}

// ---------------------------------------------------------------------------
// RecipeCardEvent factory
// ---------------------------------------------------------------------------

export function makeRecipeCardEvent(
  overrides?: Partial<RecipeCardEvent>
): RecipeCardEvent {
  return {
    event_type: "recipe_card",
    recipe: makeRecipeSummary(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PcsvUpdateEvent factory
// ---------------------------------------------------------------------------

const defaultPcsv: PCSVResult = {
  protein: { status: "ok", items: ["shrimp"] },
  carb: { status: "ok", items: ["rice"] },
  veggie: { status: "low", items: ["bok choy"] },
  sauce: { status: "ok", items: ["soy sauce"] },
};

export function makePcsvUpdateEvent(
  overrides?: Partial<PcsvUpdateEvent>
): PcsvUpdateEvent {
  return {
    event_type: "pcsv_update",
    pcsv: defaultPcsv,
    ...overrides,
  };
}
