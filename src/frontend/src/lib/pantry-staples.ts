// pantry-staples.ts — frontend-only blocklist for trivial cooking staples
// (issue #151). Keeps ingredients like salt, oil, vinegar, and water out of
// recipe views so users see the ingredients that actually drive a shopping
// decision.
//
// Deterministic and purely client-side — no contract, KB, or backend change.

/**
 * Lowercased staple names. Entries cover common English names plus
 * simplified/traditional Chinese for the bilingual UI. Keep this list short
 * and conservative — items here are hidden from every recipe view.
 */
export const PANTRY_STAPLES: ReadonlySet<string> = new Set([
  // English — seasoning
  "salt",
  "kosher salt",
  "sea salt",
  "pepper",
  "black pepper",
  "white pepper",
  "sugar",
  "brown sugar",
  // English — liquids / fats
  "water",
  "oil",
  "cooking oil",
  "vegetable oil",
  "olive oil",
  "sesame oil",
  "neutral oil",
  "cooking spray",
  // English — acids / thickeners / misc staples
  "vinegar",
  "white vinegar",
  "rice vinegar",
  "cornstarch",
  "corn starch",
  "sesame seeds",
  // Chinese — seasoning
  "盐",
  "鹽",
  "胡椒",
  "黑胡椒",
  "白胡椒",
  "糖",
  // Chinese — liquids / fats
  "水",
  "油",
  "食用油",
  "植物油",
  "橄榄油",
  "橄欖油",
  "芝麻油",
  "香油",
  // Chinese — acids / thickeners / misc
  "醋",
  "白醋",
  "米醋",
  "淀粉",
  "生粉",
  "玉米淀粉",
  "芝麻",
]);

/**
 * Normalize an ingredient name for comparison: lowercase, trim, and drop
 * trailing qualifiers like "salt, to taste" or "pepper (freshly ground)".
 */
function normalize(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return "";
  // Split on the first separator that introduces a qualifier and keep the
  // head. Matches: ",", "(", " - ".
  const head = trimmed.split(/[,(]|\s-\s/)[0] ?? "";
  return head.trim();
}

/**
 * True when `name` refers to a pantry staple (after normalization).
 * Only exact matches count — "saltwater fish" is not a staple.
 */
export function isPantryStaple(name: string): boolean {
  const normalized = normalize(name);
  if (!normalized) return false;
  return PANTRY_STAPLES.has(normalized);
}

/**
 * Remove pantry staples from an ingredient list, preserving order and any
 * extra fields on each item. If filtering would remove every item, return
 * the original list so recipes with only staples still show something.
 */
export function filterPantryStaples<T extends { name: string }>(
  items: readonly T[],
): T[] {
  const filtered = items.filter((item) => !isPantryStaple(item.name));
  if (filtered.length === 0 && items.length > 0) {
    return [...items];
  }
  return filtered;
}
