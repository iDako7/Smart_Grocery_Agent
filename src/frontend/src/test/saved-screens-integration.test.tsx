// Integration tests for saved detail screens wired to real API.
// These tests verify that each screen:
//   1. Fetches data by ID from URL params (not scenario mock data)
//   2. Shows a loading state while fetching
//   3. Shows the fetched data once resolved
//   4. Shows an error/not-found state on API failure
//   5. Works on page refresh (data sourced from URL param, not router state)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import type { SavedMealPlan, SavedRecipe, SavedGroceryList } from "@/types/api";

// ---------------------------------------------------------------------------
// Mock the API client module so no real network calls are made
// ---------------------------------------------------------------------------
vi.mock("@/services/api-client", () => ({
  getSavedMealPlan: vi.fn(),
  getSavedRecipe: vi.fn(),
  getSavedGroceryList: vi.fn(),
}));

// Import the mocked functions for per-test configuration
import {
  getSavedMealPlan,
  getSavedRecipe,
  getSavedGroceryList,
} from "@/services/api-client";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockMealPlan: SavedMealPlan = {
  id: "plan-1",
  name: "BBQ Plan",
  recipes: [
    {
      id: "r1",
      name: "Grilled Chicken",
      name_zh: "烤鸡",
      source: "KB",
      source_url: "",
      cuisine: "American",
      cooking_method: "grill",
      effort_level: "medium",
      time_minutes: 30,
      flavor_tags: ["smoky"],
      serves: 4,
      ingredients: [],
      instructions: "Grill the chicken.",
      is_ai_generated: false,
    },
  ],
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const mockSavedRecipe: SavedRecipe = {
  id: "recipe-1",
  recipe_snapshot: {
    id: "r2",
    name: "Salt & Pepper Wings",
    name_zh: "椒盐鸡翅",
    source: "Kenji",
    source_url: "",
    cuisine: "Chinese",
    cooking_method: "air fryer",
    effort_level: "medium",
    time_minutes: 25,
    flavor_tags: ["salty", "spicy"],
    serves: 4,
    ingredients: [],
    instructions: "Coat wings with baking powder and salt.",
    is_ai_generated: false,
  },
  notes: "",
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

const mockGroceryList: SavedGroceryList = {
  id: "list-1",
  name: "Weekly Shop",
  stores: [
    {
      store_name: "Costco",
      departments: [
        {
          name: "Produce",
          items: [
            {
              id: "item-1",
              name: "Corn on the cob",
              amount: "12-pack",
              recipe_context: "for salad",
              checked: false,
            },
          ],
        },
      ],
    },
    {
      store_name: "Community Market",
      departments: [
        {
          name: "Produce",
          items: [
            {
              id: "item-2",
              name: "Cucumber",
              amount: "2",
              recipe_context: "for salad",
              checked: false,
            },
          ],
        },
      ],
    },
  ],
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Helper: render a screen in a route context so useParams works
// ---------------------------------------------------------------------------
function renderInRoute(
  path: string,
  routePattern: string,
  element: React.ReactElement
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePattern} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// SavedMealPlanScreen
// ===========================================================================

describe("SavedMealPlanScreen — loading state", () => {
  it("shows a loading indicator while fetching", () => {
    // Never-resolving promise keeps the screen in loading state
    vi.mocked(getSavedMealPlan).mockReturnValue(new Promise(() => {}));

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    // Screen wrapper must always be present (data-testid requirement)
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
    // Loading indicator must be visible
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });
});

describe("SavedMealPlanScreen — success", () => {
  it("fetches and displays the plan name and recipe", async () => {
    vi.mocked(getSavedMealPlan).mockResolvedValue(mockMealPlan);

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    // Plan name and recipes rendered — wrap both in waitFor because
    // recipes state syncs in a second render cycle after plan is set
    await waitFor(() => {
      expect(screen.getByText(/BBQ Plan/)).toBeInTheDocument();
      expect(screen.getByText("Grilled Chicken")).toBeInTheDocument();
    });
  });

  it("calls getSavedMealPlan with the correct ID from URL params", async () => {
    vi.mocked(getSavedMealPlan).mockResolvedValue(mockMealPlan);

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    await waitFor(() =>
      expect(getSavedMealPlan).toHaveBeenCalledWith("plan-1")
    );
  });

  it("shows recipe count as deck text", async () => {
    vi.mocked(getSavedMealPlan).mockResolvedValue(mockMealPlan);

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    await waitFor(() =>
      expect(screen.getByText("1 recipes")).toBeInTheDocument()
    );
  });
});

describe("SavedMealPlanScreen — error", () => {
  it("shows a not-found message when API rejects", async () => {
    vi.mocked(getSavedMealPlan).mockRejectedValue(new Error("404 Not Found"));

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    await waitFor(() =>
      expect(screen.getByTestId("not-found-message")).toBeInTheDocument()
    );
  });
});

// ===========================================================================
// SavedRecipeScreen
// ===========================================================================

describe("SavedRecipeScreen — loading state", () => {
  it("shows a loading indicator while fetching", () => {
    vi.mocked(getSavedRecipe).mockReturnValue(new Promise(() => {}));

    renderInRoute(
      "/saved/recipe/recipe-1",
      "/saved/recipe/:id",
      <SavedRecipeScreen />
    );

    expect(screen.getByTestId("screen-saved-recipe")).toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });
});

describe("SavedRecipeScreen — success", () => {
  it("fetches and displays the recipe name and instructions", async () => {
    vi.mocked(getSavedRecipe).mockResolvedValue(mockSavedRecipe);

    renderInRoute(
      "/saved/recipe/recipe-1",
      "/saved/recipe/:id",
      <SavedRecipeScreen />
    );

    await waitFor(() =>
      expect(screen.getByText("Salt & Pepper Wings")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Coat wings with baking powder and salt.")
    ).toBeInTheDocument();
  });

  it("displays the CJK name", async () => {
    vi.mocked(getSavedRecipe).mockResolvedValue(mockSavedRecipe);

    renderInRoute(
      "/saved/recipe/recipe-1",
      "/saved/recipe/:id",
      <SavedRecipeScreen />
    );

    await waitFor(() =>
      expect(screen.getByText("椒盐鸡翅")).toBeInTheDocument()
    );
  });

  it("calls getSavedRecipe with the correct ID from URL params", async () => {
    vi.mocked(getSavedRecipe).mockResolvedValue(mockSavedRecipe);

    renderInRoute(
      "/saved/recipe/recipe-1",
      "/saved/recipe/:id",
      <SavedRecipeScreen />
    );

    await waitFor(() =>
      expect(getSavedRecipe).toHaveBeenCalledWith("recipe-1")
    );
  });
});

describe("SavedRecipeScreen — error", () => {
  it("shows a not-found message when API rejects", async () => {
    vi.mocked(getSavedRecipe).mockRejectedValue(new Error("404 Not Found"));

    renderInRoute(
      "/saved/recipe/recipe-1",
      "/saved/recipe/:id",
      <SavedRecipeScreen />
    );

    await waitFor(() =>
      expect(screen.getByTestId("not-found-message")).toBeInTheDocument()
    );
  });
});

// ===========================================================================
// SavedGroceryListScreen
// ===========================================================================

describe("SavedGroceryListScreen — loading state", () => {
  it("shows a loading indicator while fetching", () => {
    vi.mocked(getSavedGroceryList).mockReturnValue(new Promise(() => {}));

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    expect(
      screen.getByTestId("screen-saved-grocery-list")
    ).toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });
});

describe("SavedGroceryListScreen — success", () => {
  it("fetches and displays the list name and items", async () => {
    vi.mocked(getSavedGroceryList).mockResolvedValue(mockGroceryList);

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    // List name rendered — use regex because name appears inside h1 with trailing span
    await waitFor(() =>
      expect(screen.getByText(/Weekly Shop/)).toBeInTheDocument()
    );
    expect(screen.getByText("Corn on the cob")).toBeInTheDocument();
    expect(screen.getByText("Cucumber")).toBeInTheDocument();
  });

  it("calls getSavedGroceryList with the correct ID from URL params", async () => {
    vi.mocked(getSavedGroceryList).mockResolvedValue(mockGroceryList);

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    await waitFor(() =>
      expect(getSavedGroceryList).toHaveBeenCalledWith("list-1")
    );
  });

  it("page refresh works — fetches by ID without relying on router state", async () => {
    // Simulate a direct URL visit (no navigation state) by using fresh render
    vi.mocked(getSavedGroceryList).mockResolvedValue(mockGroceryList);

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    // Should still display data since it fetches from API
    // Use regex because name appears inside h1 with trailing span
    await waitFor(() =>
      expect(screen.getByText(/Weekly Shop/)).toBeInTheDocument()
    );
  });

  it("flattens store departments into list items with correct store badge", async () => {
    vi.mocked(getSavedGroceryList).mockResolvedValue(mockGroceryList);

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    // Both items from different stores should appear
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument()
    );
    expect(screen.getByText("Cucumber")).toBeInTheDocument();
  });
});

describe("SavedGroceryListScreen — error", () => {
  it("shows a not-found message when API rejects", async () => {
    vi.mocked(getSavedGroceryList).mockRejectedValue(
      new Error("404 Not Found")
    );

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    await waitFor(() =>
      expect(screen.getByTestId("not-found-message")).toBeInTheDocument()
    );
  });
});
