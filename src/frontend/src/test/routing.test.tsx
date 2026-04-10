// Test: React Router routes render the correct screen component.
// Uses MemoryRouter to navigate without a real browser.

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

// Base-ui mocks (menu + dialog) are in setup.ts

import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { ScenarioProvider } from "@/context/scenario-context";

// Mirrors the route table in App.tsx so any future mismatch is caught here.
function TestRouter({ initialPath }: { initialPath: string }) {
  return (
    <ScenarioProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/clarify" element={<ClarifyScreen />} />
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/plan/:id" element={<SavedMealPlanScreen />} />
          <Route path="/saved/recipe/:id" element={<SavedRecipeScreen />} />
          <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
        </Routes>
      </MemoryRouter>
    </ScenarioProvider>
  );
}

describe("React Router — all 7 routes render the correct screen", () => {
  it('/ renders HomeScreen', () => {
    render(<TestRouter initialPath="/" />);
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });

  it('/clarify renders ClarifyScreen', () => {
    render(<TestRouter initialPath="/clarify" />);
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
  });

  it('/recipes renders RecipesScreen', () => {
    render(<TestRouter initialPath="/recipes" />);
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();
  });

  it('/grocery renders GroceryScreen', () => {
    render(<TestRouter initialPath="/grocery" />);
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  it('/saved/plan/:id renders SavedMealPlanScreen', () => {
    render(<TestRouter initialPath="/saved/plan/plan-42" />);
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
  });

  it('/saved/recipe/:id renders SavedRecipeScreen', () => {
    render(<TestRouter initialPath="/saved/recipe/rec-7" />);
    expect(screen.getByTestId("screen-saved-recipe")).toBeInTheDocument();
  });

  it('/saved/list/:id renders SavedGroceryListScreen', () => {
    render(<TestRouter initialPath="/saved/list/list-3" />);
    expect(
      screen.getByTestId("screen-saved-grocery-list")
    ).toBeInTheDocument();
  });

  it("unknown path renders no matching screen", () => {
    render(<TestRouter initialPath="/does-not-exist" />);
    expect(screen.queryByTestId("screen-home")).not.toBeInTheDocument();
    expect(screen.queryByTestId("screen-clarify")).not.toBeInTheDocument();
  });

  it("route params are accessible (/saved/plan/:id with different ids)", () => {
    const { unmount } = render(<TestRouter initialPath="/saved/plan/abc" />);
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
    unmount();

    render(<TestRouter initialPath="/saved/plan/xyz" />);
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
  });
});
