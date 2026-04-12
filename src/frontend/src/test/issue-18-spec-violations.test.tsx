/**
 * Issue #18 — Frontend Cleanup: Spec violation integration tests.
 *
 * Tests are ordered by spec requirement:
 *   F2  — RecipeCard "need" pills are toggleable; "have" pills are not
 *   F5  — SavedMealPlanScreen must not render ChatInput
 *   F6  — SavedRecipeScreen must not render ChatInput
 *   F7-S5 — SavedMealPlanScreen remove button removes recipe from list
 *   F9  — SavedGroceryListScreen "Copy to Notes" writes plain-text checklist to clipboard
 *   F10 — Bilingual toggle on RecipesScreen consumed by RecipeCard
 *   F11 — Bilingual toggle present on GroceryScreen
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeCard } from "@/components/recipe-card";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { renderWithSession } from "./test-utils";

// ---------------------------------------------------------------------------
// F2 — RecipeCard: "need" pills toggleable, "have" pills non-interactive
// ---------------------------------------------------------------------------
describe("F2 — RecipeCard: toggleable buy pills", () => {
  const baseProps = {
    index: 0,
    name: "Test Dish",
    flavorProfile: "Savory",
    cookingMethod: "Stir-fry",
    time: "20 min",
    onSwap: vi.fn(),
    onInfoClick: vi.fn(),
  };

  const ingredients = [
    { name: "Chicken", have: false },   // need pill — orange, toggleable
    { name: "Soy Sauce", have: true },  // have pill — green, not interactive
  ];

  it("clicking a 'need' pill calls onToggleBuy with the ingredient name", () => {
    const onToggleBuy = vi.fn();
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={onToggleBuy}
      />
    );

    // "need" pill is rendered as a button so it can be clicked
    const needPill = screen.getByRole("button", { name: /chicken/i });
    fireEvent.click(needPill);

    expect(onToggleBuy).toHaveBeenCalledTimes(1);
    expect(onToggleBuy).toHaveBeenCalledWith("Chicken");
  });

  it("excluded ingredient renders with grey styling instead of orange", () => {
    const onToggleBuy = vi.fn();
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={onToggleBuy}
        excludedIngredients={new Set(["Chicken"])}
      />
    );

    // The pill for "Chicken" should carry a grey CSS class, not the orange persimmon class.
    const needPill = screen.getByRole("button", { name: /chicken/i });
    expect(needPill.className).not.toMatch(/persimmon/);
    // It must have a grey/muted class to distinguish it from an active "need" pill.
    expect(needPill.className).toMatch(/grey|gray|muted|ink-3|cream-deep|excluded/i);
  });

  it("'have' pills are not rendered as interactive buttons", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
      />
    );

    // "Soy Sauce" is a "have" ingredient — must NOT be a button.
    // Use queryByRole to confirm it does not exist as a button.
    const havePillButton = screen.queryByRole("button", { name: /soy sauce/i });
    expect(havePillButton).toBeNull();

    // It should still appear in the document as non-interactive text.
    expect(screen.getByText("Soy Sauce")).toBeInTheDocument();
  });

  it("'need' pill has aria-pressed=true when NOT excluded (actively buying)", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
        excludedIngredients={new Set()}
      />
    );
    // "pressed" means actively buying — ingredient is in the list.
    const needPill = screen.getByRole("button", { name: /chicken/i });
    expect(needPill).toHaveAttribute("aria-pressed", "true");
  });

  it("'need' pill has aria-pressed=false when excluded (removed from list)", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
        excludedIngredients={new Set(["Chicken"])}
      />
    );
    // Not pressed — ingredient has been excluded / removed from the list.
    const needPill = screen.getByRole("button", { name: /chicken/i });
    expect(needPill).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// F2-ext — RecipesScreen: excludedIngredients are scoped per card
// ---------------------------------------------------------------------------
describe("F2-ext — RecipesScreen: per-card ingredient exclusion isolation", () => {
  it("toggling an ingredient on one card does not affect the same ingredient on another card", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // Find all "need" ingredient pills across all cards.
    // We need a pill whose name appears in at least two cards.
    // Use aria-pressed="true" to find active "need" pills (not "have" spans).
    const allNeedPills = screen.getAllByRole("button", { pressed: true });
    if (allNeedPills.length < 2) {
      // Not enough shared ingredients — scenario doesn't support this test.
      return;
    }

    // Find if any ingredient name appears in two or more pills.
    const nameMap = new Map<string, HTMLElement[]>();
    for (const pill of allNeedPills) {
      const name = pill.textContent?.trim() ?? "";
      if (name) {
        const group = nameMap.get(name) ?? [];
        group.push(pill);
        nameMap.set(name, group);
      }
    }

    const shared = [...nameMap.entries()].find(([, pills]) => pills.length >= 2);
    if (!shared) {
      // No shared ingredient found — scenario doesn't create a cross-card conflict.
      return;
    }

    const [ingredientName, pillsForIngredient] = shared;

    // Click the first card's pill for this ingredient.
    await user.click(pillsForIngredient[0]);

    // Re-query: first card's pill should now be excluded (aria-pressed=false),
    // the second card's pill should remain active (aria-pressed=true).
    const updatedPills = screen.getAllByRole("button", { name: new RegExp(ingredientName, "i") });
    // Filter to only "need" pills by checking aria-pressed attribute exists.
    const needUpdated = updatedPills.filter((b) => b.hasAttribute("aria-pressed"));
    expect(needUpdated[0]).toHaveAttribute("aria-pressed", "false");
    expect(needUpdated[1]).toHaveAttribute("aria-pressed", "true");
  });
});

// ---------------------------------------------------------------------------
// F5 — SavedMealPlanScreen must not contain a chat input
// ---------------------------------------------------------------------------
describe("F5 — SavedMealPlanScreen: no chat input", () => {
  it("does not render a chat input element", () => {
    renderWithSession(<SavedMealPlanScreen />, { initialPath: "/saved/plan/1" });

    // ChatInput renders an <input> with aria-label equal to its placeholder.
    // If ChatInput is present, one of these will exist.
    const chatInputs = screen.queryAllByRole("textbox");
    expect(chatInputs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F6 — SavedRecipeScreen must not contain a chat input
// ---------------------------------------------------------------------------
describe("F6 — SavedRecipeScreen: no chat input", () => {
  it("does not render a chat input element", () => {
    renderWithSession(<SavedRecipeScreen />, { initialPath: "/saved/recipe/1" });

    // SavedRecipeScreen has an in-place textarea in edit mode only.
    // In view mode (default), no textbox at all should be present.
    // ChatInput's placeholder "Adjust this recipe..." distinguishes it from
    // the edit textarea; but per spec it should not exist at all.
    const textboxes = screen.queryAllByRole("textbox");
    expect(textboxes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F7-S5 — SavedMealPlanScreen: remove button removes recipe from list
// ---------------------------------------------------------------------------
describe("F7-S5 — SavedMealPlanScreen: onRemove wired to ExpandableRecipe", () => {
  it("renders remove buttons for each recipe", () => {
    renderWithSession(<SavedMealPlanScreen />, { initialPath: "/saved/plan/1" });

    // The mock scenario has 3 recipes in savedPlan.recipes.
    // ExpandableRecipe renders aria-label="Remove <name>" when onRemove is provided.
    const removeButtons = screen.getAllByRole("button", { name: /^Remove /i });
    expect(removeButtons.length).toBeGreaterThan(0);
  });

  it("clicking the remove button removes that recipe from the list", () => {
    renderWithSession(<SavedMealPlanScreen />, { initialPath: "/saved/plan/1" });

    // Find the first recipe's name before removing.
    const firstRemoveButton = screen.getAllByRole("button", { name: /^Remove /i })[0];
    // Extract the recipe name from the aria-label: "Remove <name>"
    const ariaLabel = firstRemoveButton.getAttribute("aria-label") ?? "";
    const removedName = ariaLabel.replace(/^Remove /, "");

    fireEvent.click(firstRemoveButton);

    // The recipe row (which shows the name as visible text) should be gone.
    expect(screen.queryByText(removedName)).not.toBeInTheDocument();
  });

  it("removing one recipe does not remove the others", () => {
    renderWithSession(<SavedMealPlanScreen />, { initialPath: "/saved/plan/1" });

    const removeButtons = screen.getAllByRole("button", { name: /^Remove /i });
    const initialCount = removeButtons.length;

    // Remove the first recipe.
    fireEvent.click(removeButtons[0]);

    // Remaining remove buttons should be one fewer.
    const remaining = screen.getAllByRole("button", { name: /^Remove /i });
    expect(remaining).toHaveLength(initialCount - 1);
  });
});

// ---------------------------------------------------------------------------
// F9 — SavedGroceryListScreen: "Copy to Notes" writes plain-text checklist
// ---------------------------------------------------------------------------
describe("F9 — SavedGroceryListScreen: Copy to Notes writes to clipboard", () => {
  beforeEach(() => {
    // Mock the clipboard API — jsdom does not implement it.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("calls navigator.clipboard.writeText when Copy to Notes is clicked", () => {
    renderWithSession(<SavedGroceryListScreen />, { initialPath: "/saved/list/1" });

    const copyButton = screen.getByRole("button", { name: /copy to notes/i });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it("formats items as a plain-text checklist (one line per item)", () => {
    renderWithSession(<SavedGroceryListScreen />, { initialPath: "/saved/list/1" });

    const copyButton = screen.getByRole("button", { name: /copy to notes/i });
    fireEvent.click(copyButton);

    const writtenText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;

    // Each item should appear on its own line prefixed with a checkbox marker.
    // The default bbq-weekend scenario includes these grocery items.
    expect(writtenText).toContain("Corn on the cob");
    expect(writtenText).toContain("Cheese slices");

    // Every non-empty line should start with a checkbox-style prefix.
    const lines = writtenText.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      // Accepts common plain-text checklist prefixes: "[ ] ", "[x] ", "- ", "• "
      expect(line).toMatch(/^(\[ \]|\[x\]|[-•*])\s/);
    }
  });
});

// ---------------------------------------------------------------------------
// F10 — RecipesScreen: bilingual toggle is consumed by RecipeCard
// ---------------------------------------------------------------------------
describe("F10 — RecipesScreen: bilingual toggle controls CJK name visibility", () => {
  it("hides CJK names by default (lang=en) — no [lang=zh] elements in DOM", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // When lang=en (default), RecipeCard should not render the CJK name div at all.
    // The bbq-weekend scenario has CJK names like "韩式烤五花肉"; they must be absent.
    const cjkElements = document.querySelectorAll('[lang="zh"]');
    expect(cjkElements.length).toBe(0);
  });

  it("shows CJK names after clicking the toggle (lang=zh)", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    const toggleButton = screen.getByRole("button", { name: /toggle language/i });
    fireEvent.click(toggleButton);

    // After toggling to zh, RecipeCard renders [lang="zh"] divs for each recipe with a CJK name.
    const cjkElements = document.querySelectorAll('[lang="zh"]');
    expect(cjkElements.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// F11 — GroceryScreen: bilingual toggle button exists
// ---------------------------------------------------------------------------
describe("F11 — GroceryScreen: bilingual toggle button present", () => {
  it("renders a toggle language button in the nav bar", () => {
    renderWithSession(<GroceryScreen />, { initialPath: "/grocery" });

    // GroceryScreen must have a bilingual toggle matching the RecipesScreen pattern.
    const toggleButton = screen.getByRole("button", { name: /toggle language/i });
    expect(toggleButton).toBeInTheDocument();
  });

  it("toggle button displays EN and 中 labels", () => {
    renderWithSession(<GroceryScreen />, { initialPath: "/grocery" });

    const toggleButton = screen.getByRole("button", { name: /toggle language/i });
    expect(toggleButton).toHaveTextContent("EN");
    expect(toggleButton).toHaveTextContent("中");
  });
});
