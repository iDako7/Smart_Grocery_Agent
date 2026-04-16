/**
 * ingredient_noise.js — Metric-only assertion for ingredient noise analysis.
 *
 * Always passes. Computes and records:
 *   - ingredient_count_avg: average ingredient count per recipe
 *   - ingredient_count_max: max ingredients on any single recipe
 *   - ingredient_overlap_ratio: ratio of ingredient names appearing in 2+ recipes (fuzzy)
 *   - pantry_staple_count: total pantry staples across all recipes
 *
 * @param {string} output - JSON string returned by the promptfoo provider
 * @param {object} context - promptfoo context (vars, prompt, etc.)
 * @returns {{ pass: boolean, score: number, reason: string, namedScores: object }}
 */

const PANTRY_STAPLES = [
  'salt', 'pepper', 'black pepper', 'water', 'oil', 'neutral oil',
  'olive oil', 'vegetable oil', 'cooking oil', 'sugar', 'flour',
  'butter', 'soy sauce', 'sesame oil',
];

/**
 * Normalize an ingredient name for fuzzy comparison.
 */
function normalize(name) {
  return name.toLowerCase().trim().replace(/s$/, '');
}

/**
 * Check whether two ingredient names are similar (fuzzy match).
 */
function isSimilar(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // "red onions" vs "onions" — check if the last word matches
  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');
  if (wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) return true;
  return false;
}

module.exports = (output, context) => {
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch (err) {
    return {
      pass: true,
      score: 0,
      reason: `Parse error, no ingredients to analyze: ${err.message}`,
      namedScores: {
        ingredient_count_avg: 0,
        ingredient_count_max: 0,
        ingredient_overlap_ratio: 0,
        pantry_staple_count: 0,
      },
    };
  }

  const recipeCards = parsed.recipe_cards || [];
  if (recipeCards.length === 0) {
    return {
      pass: true,
      score: 0,
      reason: 'No recipe cards found, skipping ingredient noise analysis',
      namedScores: {
        ingredient_count_avg: 0,
        ingredient_count_max: 0,
        ingredient_overlap_ratio: 0,
        pantry_staple_count: 0,
      },
    };
  }

  // Extract ingredients per recipe
  const ingredientsByRecipe = recipeCards.map((card) => {
    const recipe = card.recipe || card;
    const ingredients = recipe.ingredients || [];
    return ingredients.map((ing) => (typeof ing === 'string' ? ing : ing.name || ''));
  });

  // 1. ingredient_count_avg and ingredient_count_max
  const counts = ingredientsByRecipe.map((list) => list.length);
  const ingredientCountMax = Math.max(...counts);
  const ingredientCountAvg = counts.reduce((sum, c) => sum + c, 0) / counts.length;

  // 2. ingredient_overlap_ratio
  // Collect all unique ingredient names across all recipes, keyed by recipe index
  const allNames = ingredientsByRecipe.flat();
  const uniqueNames = [...new Set(allNames)];

  let overlappingCount = 0;
  for (const name of uniqueNames) {
    // Count how many recipes contain a similar ingredient
    let recipeHitCount = 0;
    for (const recipeIngredients of ingredientsByRecipe) {
      const found = recipeIngredients.some((rName) => isSimilar(name, rName));
      if (found) recipeHitCount++;
    }
    if (recipeHitCount >= 2) overlappingCount++;
  }
  const overlapRatio = uniqueNames.length > 0 ? overlappingCount / uniqueNames.length : 0;

  // 3. pantry_staple_count
  let pantryStapleCount = 0;
  for (const name of allNames) {
    if (PANTRY_STAPLES.some((staple) => isSimilar(name, staple))) {
      pantryStapleCount++;
    }
  }

  const avgRounded = Math.round(ingredientCountAvg * 10) / 10;

  return {
    pass: true,
    score: avgRounded,
    reason: `avg ${avgRounded} ingredients/recipe, max ${ingredientCountMax}, overlap ${(overlapRatio * 100).toFixed(1)}%, ${pantryStapleCount} pantry staples`,
    namedScores: {
      ingredient_count_avg: avgRounded,
      ingredient_count_max: ingredientCountMax,
      ingredient_overlap_ratio: Math.round(overlapRatio * 1000) / 1000,
      pantry_staple_count: pantryStapleCount,
    },
  };
};
