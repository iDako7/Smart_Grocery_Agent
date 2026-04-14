// recipe-cache.ts — module-level in-memory cache for RecipeDetail objects.
// Extracted from recipe-info-sheet.tsx so the test seam does not appear on
// the production component's public surface.

import type { RecipeDetail } from "@/types/tools";

export const recipeCache = new Map<string, RecipeDetail>();

/** Test seam — clears the cache between test cases. */
export function resetRecipeCacheForTests(): void {
  recipeCache.clear();
}
