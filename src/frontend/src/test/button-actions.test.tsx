import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { renderWithSession } from "./test-utils";

// ---------------------------------------------------------------------------
// "Save plan" button (RecipesScreen)
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a Save plan button", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("navigates away from recipes screen on click", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    // clicking should not throw; navigation is tested in the routing suite below
    await user.click(screen.getByRole("button", { name: /save plan/i }));
  });

  it("always shows 'Save plan' text (no local feedback)", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn.textContent).toBe("Save plan");
    expect(btn.getAttribute("data-saved")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "Save list" button (GroceryScreen)
// ---------------------------------------------------------------------------

describe('GroceryScreen — "Save list" button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a Save list button", () => {
    renderWithSession(<GroceryScreen />, { initialPath: "/grocery" });
    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).toBeInTheDocument();
  });

  it("navigates away from grocery screen on click", async () => {
    const user = userEvent.setup();
    renderWithSession(<GroceryScreen />, { initialPath: "/grocery" });

    // clicking should not throw; navigation is tested in the routing suite below
    await user.click(screen.getByRole("button", { name: /save list/i }));
  });
});

// ---------------------------------------------------------------------------
// "EN/中" toggle (RecipesScreen)
// ---------------------------------------------------------------------------

describe('RecipesScreen — "EN/中" language toggle', () => {
  it("is a button element with accessible label", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });
    const btn = screen.getByRole("button", { name: /language/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it('clicking toggles bold to "中"', async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    const btn = screen.getByRole("button", { name: /language/i });
    await user.click(btn);

    // "中" should be bold, "EN" should not
    const zhEl = btn.querySelector("b");
    expect(zhEl?.textContent).toBe("中");
  });

  it("clicking again toggles bold back to EN", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    const btn = screen.getByRole("button", { name: /language/i });
    await user.click(btn);
    await user.click(btn);

    const boldEl = btn.querySelector("b");
    expect(boldEl?.textContent).toBe("EN");
  });
});

// ---------------------------------------------------------------------------
// Save-button navigation tests
// ---------------------------------------------------------------------------

describe('GroceryScreen — "Save list" navigates to saved grocery list', () => {
  it("Save list navigates to saved grocery list and shows toast", async () => {
    const user = userEvent.setup();
    renderWithSession(
      <></>,
      {
        initialPath: "/grocery",
        routes: (
          <Routes>
            <Route path="/grocery" element={<GroceryScreen />} />
            <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
          </Routes>
        ),
      }
    );

    await user.click(screen.getByRole("button", { name: /save list/i }));

    await waitFor(() => {
      expect(screen.getByTestId("screen-saved-grocery-list")).toBeInTheDocument();
    });
    expect(screen.getByTestId("saved-toast")).toBeInTheDocument();
  });
});

describe('RecipesScreen — "Save plan" navigates to saved meal plan', () => {
  it("Save plan navigates to saved meal plan and shows toast", async () => {
    const user = userEvent.setup();
    renderWithSession(
      <></>,
      {
        initialPath: "/recipes",
        routes: (
          <Routes>
            <Route path="/recipes" element={<RecipesScreen />} />
            <Route path="/saved/plan/:id" element={<SavedMealPlanScreen />} />
          </Routes>
        ),
      }
    );

    await user.click(screen.getByRole("button", { name: /save plan/i }));

    await waitFor(() => {
      expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
    });
    expect(screen.getByTestId("saved-toast")).toBeInTheDocument();
  });
});
