/**
 * dish_count.js — Metric-only assertion that records dish count.
 *
 * Always passes (measure-only, no threshold). Records:
 *   - dish_count: number of recipe cards returned
 *   - dishes_per_person: dish_count / party_size
 *
 * Reads from context.vars: expected_dish_min, expected_dish_max, party_size
 *
 * @param {string} output - JSON string returned by the promptfoo provider
 * @param {object} context - promptfoo context (vars, prompt, etc.)
 * @returns {{ pass: boolean, score: number, reason: string, namedScores: object }}
 */
module.exports = (output, context) => {
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch (err) {
    return { pass: true, score: 0, reason: `Parse error, no dishes to count: ${err.message}` };
  }

  const dishCount = parsed.dish_count ?? (parsed.recipe_cards ? parsed.recipe_cards.length : 0);
  const vars = (context && context.vars) || {};
  const rawPartySize = Number(vars.party_size);
  const partySize = rawPartySize > 0 ? rawPartySize : null;
  const expectedMin = vars.expected_dish_min != null ? Number(vars.expected_dish_min) : null;
  const expectedMax = vars.expected_dish_max != null ? Number(vars.expected_dish_max) : null;

  let rangeStr = '';
  if (expectedMin != null && expectedMax != null) {
    rangeStr = ` (expected ${expectedMin}-${expectedMax} range)`;
  }

  const namedScores = { dish_count: dishCount };
  if (partySize != null) {
    namedScores.dishes_per_person = dishCount / partySize;
  }

  const partySizeStr = partySize != null ? `party of ${partySize}` : 'no party size';
  return {
    pass: true,
    score: dishCount,
    reason: `${dishCount} dishes for ${partySizeStr}${rangeStr}`,
    namedScores,
  };
};
