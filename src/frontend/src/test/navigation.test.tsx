// Tests for Bug 2: Sidebar items navigate to correct saved pages.
// Bug 1 (back/cancel button tests) was deleted because ClarifyScreen,
// RecipesScreen, and GroceryScreen were gutted to placeholder shells
// in Cleanup #1 — the back/cancel buttons no longer exist.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";

// Base-ui mocks (menu + dialog) are in setup.ts

import { HomeScreen } from "@/screens/HomeScreen";

// Mock api-client so HomeScreen's fetchSidebarData resolves with sidebar items
// that the navigation tests expect to find and click.
vi.mock("@/services/api-client", () => ({
  listSavedMealPlans: vi.fn().mockResolvedValue([
    { id: "plan-1", name: "BBQ weekend", recipe_count: 3, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  ]),
  listSavedRecipes: vi.fn().mockResolvedValue([
    { id: "recipe-1", recipe_name: "Salt & pepper wings", recipe_name_zh: "椒盐鸡翅", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  ]),
  listSavedGroceryLists: vi.fn().mockResolvedValue([
    { id: "list-1", name: "BBQ weekend list", item_count: 8, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  ]),
  getAuthToken: vi.fn().mockResolvedValue("test-token"),
  getSavedMealPlan: vi.fn().mockResolvedValue(null),
  getSavedRecipe: vi.fn().mockResolvedValue(null),
  getSavedGroceryList: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ session_id: "test-session", created_at: "2026-01-01T00:00:00Z" }),
  saveMealPlan: vi.fn().mockResolvedValue({}),
  saveGroceryList: vi.fn().mockResolvedValue({}),
  resetAuthToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Bug 2: Sidebar item navigation
// ---------------------------------------------------------------------------
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";

function renderHomeWithSavedRoutes() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/saved/plan/:id" element={<SavedMealPlanScreen />} />
        <Route path="/saved/recipe/:id" element={<SavedRecipeScreen />} />
        <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Sidebar item navigation", () => {
  it("clicking a meal plan item navigates to /saved/plan/:id", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    await user.click(screen.getByLabelText(/open menu/i));
    await user.click(await screen.findByText("BBQ weekend"));
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
  });

  it("clicking a saved recipe item navigates to /saved/recipe/:id", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    await user.click(screen.getByLabelText(/open menu/i));
    await user.click(await screen.findByText("Salt & pepper wings"));
    expect(screen.getByTestId("screen-saved-recipe")).toBeInTheDocument();
  });

  it("clicking a grocery list item navigates to /saved/list/:id", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    await user.click(screen.getByLabelText(/open menu/i));
    await user.click(await screen.findByText("BBQ weekend list"));
    expect(screen.getByTestId("screen-saved-grocery-list")).toBeInTheDocument();
  });
});
