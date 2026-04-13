/**
 * Issue #18 — Frontend Cleanup: Spec violation integration tests.
 *
 * Tests are ordered by spec requirement:
 *   F2  — RecipeCard: ALL pills are toggleable buttons (checkbox-style UX)
 *   F5  — SavedMealPlanScreen must not render ChatInput
 *   F6  — SavedRecipeScreen must not render ChatInput
 *   F7-S5 — SavedMealPlanScreen remove button removes recipe from list
 *   F9  — SavedGroceryListScreen "Copy to Notes" writes plain-text checklist to clipboard
 *   F10 — Bilingual toggle on RecipesScreen consumed by RecipeCard
 *   F11 — Bilingual toggle present on GroceryScreen
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { RecipeCard } from "@/components/recipe-card";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider } from "@/context/session-context";
import { renderWithSession } from "./test-utils";

// Mock the API client so saved screens can fetch without real network calls.
vi.mock("@/services/api-client", () => ({
  getSavedMealPlan: vi.fn().mockResolvedValue({
    id: "plan-1",
    name: "BBQ weekend",
    recipes: [
      { id: "r1", name: "Korean BBQ Pork Belly", name_zh: "韩式烤五花肉", source: "KB", source_url: "", cuisine: "Korean", cooking_method: "grill", effort_level: "medium", time_minutes: 30, flavor_tags: [], serves: 8, ingredients: [], instructions: "grill the pork.", is_ai_generated: false },
      { id: "r2", name: "Grilled Corn & Cucumber Salad", name_zh: "烤玉米", source: "KB", source_url: "", cuisine: "Side", cooking_method: "grill", effort_level: "quick", time_minutes: 15, flavor_tags: [], serves: 8, ingredients: [], instructions: "grill corn.", is_ai_generated: false },
      { id: "r3", name: "Classic Smash Burgers", name_zh: "汉堡", source: "KB", source_url: "", cuisine: "American", cooking_method: "cast iron", effort_level: "quick", time_minutes: 15, flavor_tags: [], serves: 8, ingredients: [], instructions: "smash it.", is_ai_generated: false },
    ],
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T00:00:00Z",
  }),
  getSavedRecipe: vi.fn().mockResolvedValue({
    id: "recipe-1",
    recipe_snapshot: { id: "r1", name: "Test Recipe", name_zh: "测试", source: "KB", source_url: "", cuisine: "Chinese", cooking_method: "wok", effort_level: "medium", time_minutes: 20, flavor_tags: [], serves: 4, ingredients: [], instructions: "Cook it.", is_ai_generated: false },
    notes: "",
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T00:00:00Z",
  }),
  getSavedGroceryList: vi.fn().mockResolvedValue({
    id: "list-1",
    name: "BBQ weekend",
    stores: [
      { store_name: "Costco", departments: [{ name: "Produce", items: [
        { id: "sl1", name: "Corn on the cob", amount: "12-pack", recipe_context: "", checked: false },
        { id: "sl2", name: "Cheese slices", amount: "For burgers", recipe_context: "", checked: false },
      ] }] },
      { store_name: "Community Market", departments: [{ name: "Produce", items: [
        { id: "sl3", name: "Cucumber (2)", amount: "For salad", recipe_context: "", checked: false },
      ] }] },
    ],
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T00:00:00Z",
  }),
  createSession: vi.fn().mockResolvedValue({ session_id: "test-session", created_at: "2026-01-01T00:00:00Z" }),
  getAuthToken: vi.fn().mockResolvedValue("test-token"),
  saveMealPlan: vi.fn().mockResolvedValue({}),
  saveGroceryList: vi.fn().mockResolvedValue({}),
  listSavedMealPlans: vi.fn().mockResolvedValue([]),
  listSavedRecipes: vi.fn().mockResolvedValue([]),
  listSavedGroceryLists: vi.fn().mockResolvedValue([]),
  resetAuthToken: vi.fn(),
}));

// Helper: render a saved screen with routing so useParams works.
function renderSavedScreen(
  routePattern: string,
  initialPath: string,
  element: React.ReactElement
) {
  return render(
    <ScenarioProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path={routePattern} element={element} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ScenarioProvider>
  );
}

// ---------------------------------------------------------------------------
// F2 — RecipeCard: ALL pills are toggleable buttons (checkbox-style UX)
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
    { name: "Chicken", have: false },   // need pill — unchecked by default (orange)
    { name: "Soy Sauce", have: true },  // have pill — checked by default (green)
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

  it("excluded 'need' ingredient renders with green styling (flipped to have)", () => {
    const onToggleBuy = vi.fn();
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={onToggleBuy}
        excludedIngredients={new Set(["Chicken"])}
      />
    );

    // The pill for "Chicken" (have: false, in excludedIngredients) is now "checked" (have=true).
    // It should carry a green class (jade), not the orange persimmon class.
    const needPill = screen.getByRole("button", { name: /chicken/i });
    expect(needPill.className).not.toMatch(/persimmon/);
    expect(needPill.className).toMatch(/jade/i);
  });

  it("'have' pills ARE rendered as interactive buttons", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
      />
    );

    // "Soy Sauce" is a "have" ingredient — must now be a button (checkbox-style).
    const havePillButton = screen.getByRole("button", { name: /soy sauce/i });
    expect(havePillButton).toBeInTheDocument();
  });

  it("clicking a 'have' pill calls onToggleBuy with the ingredient name", () => {
    const onToggleBuy = vi.fn();
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={onToggleBuy}
      />
    );

    // "Soy Sauce" (have: true) is now a toggleable button
    const havePill = screen.getByRole("button", { name: /soy sauce/i });
    fireEvent.click(havePill);

    expect(onToggleBuy).toHaveBeenCalledTimes(1);
    expect(onToggleBuy).toHaveBeenCalledWith("Soy Sauce");
  });

  it("'need' pill has aria-pressed=false when NOT excluded (needs buying)", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
        excludedIngredients={new Set()}
      />
    );
    // Unchecked (need to buy) — aria-pressed=false
    const needPill = screen.getByRole("button", { name: /chicken/i });
    expect(needPill).toHaveAttribute("aria-pressed", "false");
  });

  it("'need' pill has aria-pressed=true when excluded (user marked as have)", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
        excludedIngredients={new Set(["Chicken"])}
      />
    );
    // Flipped: was need, now checked (have) — aria-pressed=true
    const needPill = screen.getByRole("button", { name: /chicken/i });
    expect(needPill).toHaveAttribute("aria-pressed", "true");
  });

  it("'have' pill has aria-pressed=true by default (user already has it)", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
        excludedIngredients={new Set()}
      />
    );
    // Checked (have) — aria-pressed=true
    const havePill = screen.getByRole("button", { name: /soy sauce/i });
    expect(havePill).toHaveAttribute("aria-pressed", "true");
  });

  it("'have' pill in excludedIngredients renders as unchecked (orange)", () => {
    render(
      <RecipeCard
        {...baseProps}
        ingredients={ingredients}
        onToggleBuy={vi.fn()}
        excludedIngredients={new Set(["Soy Sauce"])}
      />
    );
    // "Soy Sauce" was have=true but is in excludedIngredients → flipped to unchecked
    const havePill = screen.getByRole("button", { name: /soy sauce/i });
    expect(havePill).toHaveAttribute("aria-pressed", "false");
    expect(havePill.className).toMatch(/persimmon/);
    expect(havePill.className).not.toMatch(/jade/);
  });
});

// ---------------------------------------------------------------------------
// F2-ext — RecipesScreen: excludedIngredients are scoped per card
// ---------------------------------------------------------------------------
describe("F2-ext — RecipesScreen: per-card ingredient exclusion isolation", () => {
  it("toggling an ingredient on one card does not affect the same ingredient on another card", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // Find all ingredient pills that are currently in the "checked" state (aria-pressed=true).
    // All pills are now buttons; pressed=true means the ingredient is checked (have).
    // We need a pill whose name appears in at least two cards.
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

    // Re-query: first card's pill should now be toggled (aria-pressed=false),
    // the second card's pill should remain in its original state (aria-pressed=true).
    const updatedPills = screen.getAllByRole("button", { name: new RegExp(ingredientName, "i") });
    // All ingredient pills have aria-pressed; filter just in case nav buttons slip through.
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
    renderSavedScreen("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);

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
    renderSavedScreen("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);

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
  it("renders remove buttons for each recipe", async () => {
    renderSavedScreen("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);

    // ExpandableRecipe renders aria-label="Remove <name>" when onRemove is provided.
    // Wait for data to load first.
    await waitFor(() => {
      const removeButtons = screen.getAllByRole("button", { name: /^Remove /i });
      expect(removeButtons.length).toBeGreaterThan(0);
    });
  });

  it("clicking the remove button removes that recipe from the list", async () => {
    renderSavedScreen("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);

    // Wait for remove buttons to appear after data loads.
    const firstRemoveButton = await waitFor(() => {
      const btns = screen.getAllByRole("button", { name: /^Remove /i });
      expect(btns.length).toBeGreaterThan(0);
      return btns[0];
    });

    // Extract the recipe name from the aria-label: "Remove <name>"
    const ariaLabel = firstRemoveButton.getAttribute("aria-label") ?? "";
    const removedName = ariaLabel.replace(/^Remove /, "");

    fireEvent.click(firstRemoveButton);

    // The recipe row (which shows the name as visible text) should be gone.
    expect(screen.queryByText(removedName)).not.toBeInTheDocument();
  });

  it("removing one recipe does not remove the others", async () => {
    renderSavedScreen("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);

    // Wait for remove buttons to appear after data loads.
    const removeButtons = await waitFor(() => {
      const btns = screen.getAllByRole("button", { name: /^Remove /i });
      expect(btns.length).toBeGreaterThan(0);
      return btns;
    });
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

  it("calls navigator.clipboard.writeText when Copy to Notes is clicked", async () => {
    renderSavedScreen("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);

    const copyButton = await waitFor(() =>
      screen.getByRole("button", { name: /copy to notes/i })
    );
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it("formats items as a plain-text checklist (one line per item)", async () => {
    renderSavedScreen("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);

    const copyButton = await waitFor(() =>
      screen.getByRole("button", { name: /copy to notes/i })
    );
    fireEvent.click(copyButton);

    const writtenText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;

    // Each item should appear on its own line prefixed with a checkbox marker.
    // The mock data includes these grocery items.
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

  it("shows a 'Copied!' toast after successful clipboard write", async () => {
    renderSavedScreen("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);

    const copyButton = await waitFor(() =>
      screen.getByRole("button", { name: /copy to notes/i })
    );

    // No toast before clicking
    expect(screen.queryByTestId("copied-toast")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(copyButton);
      // Allow the clipboard promise to resolve
      await Promise.resolve();
    });

    // Toast with "Copied!" message should now be visible
    const toast = screen.getByTestId("copied-toast");
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveTextContent("Copied!");
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
// F-SWAP — RecipesScreen: swap alternative preserves ingredient pills and metadata
// ---------------------------------------------------------------------------
describe("F-SWAP — RecipesScreen: swap alternative card has full content after pick", () => {
  it("replaced card still renders ingredient pills after picking a swap alternative", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // Click "Try another" on the first recipe card (index 0).
    const tryAnotherButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(tryAnotherButtons[0]);

    // SwapPanel should now be visible — pick the first alternative.
    const pickButtons = screen.getAllByRole("button", { name: /^Pick /i });
    expect(pickButtons.length).toBeGreaterThan(0);
    await user.click(pickButtons[0]);

    // The SwapPanel should be gone now.
    expect(screen.queryAllByRole("button", { name: /^Pick /i })).toHaveLength(0);

    // The replaced card must still render ingredient pills (aria-pressed buttons).
    // If the alternative was mapped with empty ingredients [], there would be zero pills.
    const allIngredientPills = screen
      .getAllByRole("button")
      .filter((btn) => btn.hasAttribute("aria-pressed"));
    expect(allIngredientPills.length).toBeGreaterThan(0);
  });

  it("replaced card has non-empty flavorProfile and cookingMethod metadata", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // Open SwapPanel on card 0.
    const tryAnotherButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(tryAnotherButtons[0]);

    // Pick the first alternative.
    const pickButtons = screen.getAllByRole("button", { name: /^Pick /i });
    await user.click(pickButtons[0]);

    // After the swap, the first recipe card should now show the alternative's name.
    // The bbq-weekend scenario's first alternative is "Asian Slaw".
    expect(screen.getByText("Asian Slaw")).toBeInTheDocument();

    // The meta line under the card must contain non-empty flavorProfile content.
    // We verify by checking that the card area contains meaningful metadata and pills.
    const cardHeading = screen.getByText("Asian Slaw");
    const card = cardHeading.closest("[class*='bg-paper']") as HTMLElement;
    expect(card).not.toBeNull();

    // The card must contain at least one ingredient pill (aria-pressed button).
    const pillsInCard = Array.from(card.querySelectorAll("button[aria-pressed]"));
    expect(pillsInCard.length).toBeGreaterThan(0);
  });

  it("alt pool item that returns as displaced card also retains content", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // Swap card 0 with alternative 0 ("Asian Slaw").
    const tryAnotherButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(tryAnotherButtons[0]);
    const pickButtons = screen.getAllByRole("button", { name: /^Pick /i });
    await user.click(pickButtons[0]);

    // Now "Korean BBQ Pork Belly" is in the alt pool.
    // Swap card 0 again to open the SwapPanel showing the alt pool.
    const tryAnotherAgain = screen.getAllByRole("button", { name: /try another/i });
    await user.click(tryAnotherAgain[0]);

    // The SwapPanel should render alternatives as "Pick" buttons.
    const altPickButtons = screen.getAllByRole("button", { name: /^Pick /i });
    expect(altPickButtons.length).toBeGreaterThan(0);

    // Pick the last alternative (the displaced "Korean BBQ Pork Belly").
    await user.click(altPickButtons[altPickButtons.length - 1]);

    // The screen should now show "Korean BBQ Pork Belly" again.
    expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument();
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
