// Tests for Bug 1: Back/cancel navigation in ClarifyScreen, RecipesScreen, GroceryScreen
// Tests for Bug 2: Sidebar items navigate to correct saved pages
//
// TDD: These tests are written BEFORE implementation (RED phase).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";

// Base-ui mocks (menu + dialog) are in setup.ts

import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { ScenarioProvider } from "@/context/scenario-context";

// ---------------------------------------------------------------------------
// Full router helper — mounts all routes so navigation actually works
// ---------------------------------------------------------------------------
function renderFullRouter(initialPath: string) {
  return render(
    <ScenarioProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/clarify" element={<ClarifyScreen />} />
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/grocery" element={<GroceryScreen />} />
        </Routes>
      </MemoryRouter>
    </ScenarioProvider>
  );
}

// ---------------------------------------------------------------------------
// Bug 1: Back navigation — ClarifyScreen
// ---------------------------------------------------------------------------
describe("ClarifyScreen — back/cancel navigation", () => {
  it("renders a back button", () => {
    renderFullRouter("/clarify");
    expect(
      screen.getByLabelText(/go back/i)
    ).toBeInTheDocument();
  });

  it("renders a cancel button", () => {
    renderFullRouter("/clarify");
    expect(
      screen.getByLabelText(/cancel/i)
    ).toBeInTheDocument();
  });

  it("back button navigates to Home (/)", async () => {
    const user = userEvent.setup();
    renderFullRouter("/clarify");
    // Confirm we're on ClarifyScreen
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/go back/i));
    // After navigation HomeScreen should be visible
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });

  it("cancel button navigates to Home (/)", async () => {
    const user = userEvent.setup();
    renderFullRouter("/clarify");
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/cancel/i));
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bug 1: Back navigation — RecipesScreen
// ---------------------------------------------------------------------------
describe("RecipesScreen — back/cancel navigation", () => {
  it("renders a back button", () => {
    renderFullRouter("/recipes");
    expect(
      screen.getByLabelText(/go back/i)
    ).toBeInTheDocument();
  });

  it("renders a cancel button", () => {
    renderFullRouter("/recipes");
    expect(
      screen.getByLabelText(/cancel/i)
    ).toBeInTheDocument();
  });

  it("back button navigates to Clarify (/clarify)", async () => {
    const user = userEvent.setup();
    renderFullRouter("/recipes");
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/go back/i));
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
  });

  it("cancel button navigates to Home (/)", async () => {
    const user = userEvent.setup();
    renderFullRouter("/recipes");
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/cancel/i));
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bug 1: Back navigation — GroceryScreen
// ---------------------------------------------------------------------------
describe("GroceryScreen — back/cancel navigation", () => {
  it("renders a back button", () => {
    renderFullRouter("/grocery");
    expect(
      screen.getByLabelText(/go back/i)
    ).toBeInTheDocument();
  });

  it("renders a cancel button", () => {
    renderFullRouter("/grocery");
    expect(
      screen.getByLabelText(/cancel/i)
    ).toBeInTheDocument();
  });

  it("back button navigates to Recipes (/recipes)", async () => {
    const user = userEvent.setup();
    renderFullRouter("/grocery");
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/go back/i));
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();
  });

  it("cancel button navigates to Home (/)", async () => {
    const user = userEvent.setup();
    renderFullRouter("/grocery");
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/cancel/i));
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bug 2: Sidebar item navigation
// ---------------------------------------------------------------------------

// Sidebar item data comes from scenario mock data; we need to know the ids.
// The mock data in scenario-context provides mealPlans, savedRecipes, groceryLists.
// We use a full router that includes saved routes so we can verify navigation.
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";

function renderHomeWithSavedRoutes() {
  return render(
    <ScenarioProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/saved/plan/:id" element={<SavedMealPlanScreen />} />
          <Route path="/saved/recipe/:id" element={<SavedRecipeScreen />} />
          <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
        </Routes>
      </MemoryRouter>
    </ScenarioProvider>
  );
}

describe("Sidebar item navigation", () => {
  it("clicking a meal plan item navigates to /saved/plan/:id", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    // Open sidebar
    await user.click(screen.getByLabelText(/open menu/i));
    // Click the first meal plan item ("BBQ weekend")
    await user.click(screen.getByText("BBQ weekend"));
    // Should land on the saved meal plan screen
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
  });

  it("clicking a saved recipe item navigates to /saved/recipe/:id", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    await user.click(screen.getByLabelText(/open menu/i));
    // Click the first saved recipe item ("Salt & pepper wings")
    await user.click(screen.getByText("Salt & pepper wings"));
    expect(screen.getByTestId("screen-saved-recipe")).toBeInTheDocument();
  });

  it("clicking a grocery list item navigates to /saved/list/:id", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    await user.click(screen.getByLabelText(/open menu/i));
    // Click the first grocery list item ("BBQ weekend list")
    await user.click(screen.getByText("BBQ weekend list"));
    expect(screen.getByTestId("screen-saved-grocery-list")).toBeInTheDocument();
  });

  it("sidebar closes after clicking a meal plan item", async () => {
    const user = userEvent.setup();
    renderHomeWithSavedRoutes();
    await user.click(screen.getByLabelText(/open menu/i));
    // There may be multiple BBQ weekend buttons; pick from within the sidebar sheet
    const sheet = screen.getByTestId("sheet-root");
    // The first button in the sheet is the Close sidebar button; find by text
    const allBtns = Array.from(sheet.querySelectorAll("button"));
    const bbqBtn = allBtns.find((b) => b.textContent?.includes("BBQ weekend"));
    await user.click(bbqBtn!);
    // After navigation the sidebar sheet is gone
    expect(screen.queryByTestId("sheet-root")).not.toBeInTheDocument();
  });
});
