import type { GroceryListItem } from "@/types/api";

interface RecipeIngredient {
  name: string;
  have: boolean;
}

interface RecipeForCollection {
  name: string;          // recipe name (for recipe_name in GroceryListItem)
  id?: string;           // recipe id (for recipe_id in GroceryListItem)
  ingredients: RecipeIngredient[];
}

/**
 * Collect all ingredients the user still needs to buy across all displayed
 * recipe cards, respecting per-card toggle state.
 *
 * Toggle XOR logic (mirrors RecipeCard pill logic):
 *   isFlipped  = excludedByCard.get(cardIndex)?.has(ing.name) ?? false
 *   isChecked  = ing.have XOR isFlipped
 *   collect    when isChecked === false  (not in user's possession)
 *
 * Cases:
 *   have=false + not toggled  → need to buy           (collect)
 *   have=true  + toggled      → user said "I need it" (collect)
 *   have=true  + not toggled  → already have it       (skip)
 *   have=false + toggled      → user said "I have it" (skip)
 */
export function collectBuyItems(
  recipes: RecipeForCollection[],
  excludedByCard: Map<number, Set<string>>
): GroceryListItem[] {
  // Map keyed by normalised ingredient name → accumulated GroceryListItem.
  // recipe_name is a comma-separated list of recipe names that need this ingredient,
  // built order-preserving with duplicates suppressed.
  const map = new Map<string, GroceryListItem & { _recipeNames: string[] }>();

  for (let cardIndex = 0; cardIndex < recipes.length; cardIndex++) {
    const recipe = recipes[cardIndex];
    const excluded = excludedByCard.get(cardIndex) ?? new Set<string>();

    for (const ing of recipe.ingredients) {
      const isFlipped = excluded.has(ing.name);
      const isChecked = ing.have !== isFlipped; // XOR — same logic as RecipeCard

      if (!isChecked) {
        // User does NOT have this ingredient → needs to buy
        const key = ing.name.toLowerCase().trim();
        const existing = map.get(key);

        if (existing) {
          // Merge: append recipe name only if not already present (order-preserving dedup)
          if (!existing._recipeNames.includes(recipe.name)) {
            existing._recipeNames.push(recipe.name);
            existing.recipe_name = existing._recipeNames.join(", ");
          }
        } else {
          map.set(key, {
            ingredient_name: ing.name,
            recipe_name: recipe.name,   // amount omitted: RecipeCardData doesn't carry amounts
            recipe_id: recipe.id ?? "",
            _recipeNames: [recipe.name],
          });
        }
      }
    }
  }

  // Strip the internal _recipeNames tracking field before returning
  return Array.from(map.values()).map(({ _recipeNames: _r, ...item }) => item);
}
