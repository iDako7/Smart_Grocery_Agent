// pantry-staples.test.ts — TDD for ingredient filter helper (issue #151)
//
// Verifies that PANTRY_STAPLES set, isPantryStaple(), and filterPantryStaples()
// correctly identify and filter trivial cooking staples (salt, oil, vinegar, etc.)
// in both English and simplified/traditional Chinese, so recipe views can hide
// them from the ingredient list.

import { describe, it, expect } from "vitest";

import {
  PANTRY_STAPLES,
  isPantryStaple,
  filterPantryStaples,
} from "@/lib/pantry-staples";

// ---------------------------------------------------------------------------
// PANTRY_STAPLES content
// ---------------------------------------------------------------------------

describe("PANTRY_STAPLES set", () => {
  it("contains core English staples", () => {
    expect(PANTRY_STAPLES.has("salt")).toBe(true);
    expect(PANTRY_STAPLES.has("pepper")).toBe(true);
    expect(PANTRY_STAPLES.has("sugar")).toBe(true);
    expect(PANTRY_STAPLES.has("vinegar")).toBe(true);
    expect(PANTRY_STAPLES.has("oil")).toBe(true);
    expect(PANTRY_STAPLES.has("water")).toBe(true);
    expect(PANTRY_STAPLES.has("cooking spray")).toBe(true);
    expect(PANTRY_STAPLES.has("sesame seeds")).toBe(true);
    expect(PANTRY_STAPLES.has("cornstarch")).toBe(true);
  });

  it("contains core Chinese staples", () => {
    expect(PANTRY_STAPLES.has("盐")).toBe(true);
    expect(PANTRY_STAPLES.has("糖")).toBe(true);
    expect(PANTRY_STAPLES.has("醋")).toBe(true);
    expect(PANTRY_STAPLES.has("油")).toBe(true);
    expect(PANTRY_STAPLES.has("水")).toBe(true);
  });

  it("stores entries in lowercase (for consistent matching)", () => {
    for (const entry of PANTRY_STAPLES) {
      expect(entry).toBe(entry.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// isPantryStaple
// ---------------------------------------------------------------------------

describe("isPantryStaple", () => {
  it("matches exact English names", () => {
    expect(isPantryStaple("salt")).toBe(true);
    expect(isPantryStaple("vinegar")).toBe(true);
    expect(isPantryStaple("oil")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPantryStaple("Salt")).toBe(true);
    expect(isPantryStaple("SALT")).toBe(true);
    expect(isPantryStaple("Olive Oil")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isPantryStaple("  salt  ")).toBe(true);
    expect(isPantryStaple("\tvinegar\n")).toBe(true);
  });

  it("strips trailing qualifiers like 'to taste' or parentheticals", () => {
    expect(isPantryStaple("salt, to taste")).toBe(true);
    expect(isPantryStaple("pepper (freshly ground)")).toBe(true);
    expect(isPantryStaple("sugar - optional")).toBe(true);
  });

  it("matches Chinese characters", () => {
    expect(isPantryStaple("盐")).toBe(true);
    expect(isPantryStaple("糖")).toBe(true);
    expect(isPantryStaple("醋")).toBe(true);
  });

  it("returns false for non-staple ingredients", () => {
    expect(isPantryStaple("chicken breast")).toBe(false);
    expect(isPantryStaple("broccoli")).toBe(false);
    expect(isPantryStaple("tofu")).toBe(false);
    expect(isPantryStaple("鸡胸肉")).toBe(false);
  });

  it("returns false for empty or whitespace-only input", () => {
    expect(isPantryStaple("")).toBe(false);
    expect(isPantryStaple("   ")).toBe(false);
  });

  it("does not match staple substrings inside other words", () => {
    // "saltwater fish" should NOT be considered a staple even though it
    // contains "salt" and "water".
    expect(isPantryStaple("saltwater fish")).toBe(false);
    expect(isPantryStaple("peppercorn steak")).toBe(false);
  });

  it("does not match ingredients with internal hyphens (no surrounding spaces)", () => {
    // The qualifier-strip regex requires " - " (spaces both sides), so
    // compound names with internal hyphens should not be split.
    expect(isPantryStaple("miso-marinated tofu")).toBe(false);
    expect(isPantryStaple("stir-fry mix")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterPantryStaples
// ---------------------------------------------------------------------------

describe("filterPantryStaples", () => {
  it("removes staples and keeps real ingredients", () => {
    const input = [
      { name: "chicken breast" },
      { name: "salt" },
      { name: "broccoli" },
      { name: "oil" },
      { name: "garlic" },
    ];

    const result = filterPantryStaples(input);

    expect(result.map((i) => i.name)).toEqual([
      "chicken breast",
      "broccoli",
      "garlic",
    ]);
  });

  it("preserves the original order of non-staples", () => {
    const input = [
      { name: "salt" },
      { name: "shrimp" },
      { name: "vinegar" },
      { name: "bok choy" },
      { name: "water" },
      { name: "garlic" },
    ];

    const result = filterPantryStaples(input);

    expect(result.map((i) => i.name)).toEqual([
      "shrimp",
      "bok choy",
      "garlic",
    ]);
  });

  it("returns the original list when filtering would remove every item", () => {
    // Fallback: if all ingredients are staples, don't render an empty list.
    const input = [
      { name: "salt" },
      { name: "pepper" },
      { name: "oil" },
    ];

    const result = filterPantryStaples(input);

    expect(result.map((i) => i.name)).toEqual(["salt", "pepper", "oil"]);
  });

  it("returns an empty array when given an empty list", () => {
    expect(filterPantryStaples([])).toEqual([]);
  });

  it("preserves extra fields on each ingredient object", () => {
    const input = [
      { name: "salt", amount: "1 tsp", pcsv: ["sauce"] },
      { name: "shrimp", amount: "300g", pcsv: ["protein"] },
    ];

    const result = filterPantryStaples(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "shrimp",
      amount: "300g",
      pcsv: ["protein"],
    });
  });
});
