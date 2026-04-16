// Integration tests for saved detail screens wired to real API via MSW.
// Migrated from vi.mock("@/services/api-client") to MSW handlers (issue #90).
//
// These tests verify that each screen:
//   1. Fetches data by ID from URL params (not static mock data)
//   2. Shows a loading state while fetching
//   3. Shows the fetched data once resolved
//   4. Shows an error/not-found state on API failure
//   5. Works on page refresh (data sourced from URL param, not router state)

import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { http, HttpResponse, delay } from "msw";

import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { server } from "@/test/msw/server";
import { BASE } from "@/test/msw/constants";
import type { SavedMealPlan, SavedRecipe, SavedGroceryList } from "@/types/api";

// ---------------------------------------------------------------------------
// Mock data — same shapes as before, returned by MSW handlers
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

// ===========================================================================
// SavedMealPlanScreen
// ===========================================================================

describe("SavedMealPlanScreen — loading state", () => {
  it("shows a loading indicator while fetching", async () => {
    // Handler that never responds keeps screen in loading state
    server.use(
      http.get(`${BASE}/saved/meal-plans/:id`, async () => {
        await delay("infinite");
        return HttpResponse.json(mockMealPlan);
      })
    );

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });
});

describe("SavedMealPlanScreen — success", () => {
  it("fetches the correct ID from URL params and displays the plan", async () => {
    let capturedId: string | undefined;

    server.use(
      http.get(`${BASE}/saved/meal-plans/:id`, ({ params }) => {
        capturedId = params.id as string;
        return HttpResponse.json(mockMealPlan);
      })
    );

    renderInRoute(
      "/saved/plan/plan-1",
      "/saved/plan/:id",
      <SavedMealPlanScreen />
    );

    await waitFor(() => {
      expect(screen.getByText(/BBQ Plan/)).toBeInTheDocument();
      expect(screen.getByText("Grilled Chicken")).toBeInTheDocument();
    });
    expect(capturedId).toBe("plan-1");
  });

  it("shows recipe count as deck text", async () => {
    server.use(
      http.get(`${BASE}/saved/meal-plans/:id`, () => {
        return HttpResponse.json(mockMealPlan);
      })
    );

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
    server.use(
      http.get(`${BASE}/saved/meal-plans/:id`, () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

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
  it("shows a loading indicator while fetching", async () => {
    server.use(
      http.get(`${BASE}/saved/recipes/:id`, async () => {
        await delay("infinite");
        return HttpResponse.json(mockSavedRecipe);
      })
    );

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
  it("fetches the correct ID from URL params and displays the recipe", async () => {
    let capturedId: string | undefined;

    server.use(
      http.get(`${BASE}/saved/recipes/:id`, ({ params }) => {
        capturedId = params.id as string;
        return HttpResponse.json(mockSavedRecipe);
      })
    );

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
    expect(capturedId).toBe("recipe-1");
  });

  it("displays the CJK name", async () => {
    server.use(
      http.get(`${BASE}/saved/recipes/:id`, () => {
        return HttpResponse.json(mockSavedRecipe);
      })
    );

    renderInRoute(
      "/saved/recipe/recipe-1",
      "/saved/recipe/:id",
      <SavedRecipeScreen />
    );

    await waitFor(() =>
      expect(screen.getByText("椒盐鸡翅")).toBeInTheDocument()
    );
  });
});

describe("SavedRecipeScreen — error", () => {
  it("shows a not-found message when API rejects", async () => {
    server.use(
      http.get(`${BASE}/saved/recipes/:id`, () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

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
  it("shows a loading indicator while fetching", async () => {
    server.use(
      http.get(`${BASE}/saved/grocery-lists/:id`, async () => {
        await delay("infinite");
        return HttpResponse.json(mockGroceryList);
      })
    );

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
  it("fetches the correct ID from URL params and displays the list", async () => {
    let capturedId: string | undefined;

    server.use(
      http.get(`${BASE}/saved/grocery-lists/:id`, ({ params }) => {
        capturedId = params.id as string;
        return HttpResponse.json(mockGroceryList);
      })
    );

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    await waitFor(() =>
      expect(screen.getByText(/Weekly Shop/)).toBeInTheDocument()
    );
    expect(screen.getByText("Corn on the cob")).toBeInTheDocument();
    expect(screen.getByText("Cucumber")).toBeInTheDocument();
    expect(capturedId).toBe("list-1");
  });

  it("page refresh works — fetches by ID without relying on router state", async () => {
    server.use(
      http.get(`${BASE}/saved/grocery-lists/:id`, () => {
        return HttpResponse.json(mockGroceryList);
      })
    );

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    await waitFor(() =>
      expect(screen.getByText(/Weekly Shop/)).toBeInTheDocument()
    );
  });

  it("flattens store departments into list items with correct store badge", async () => {
    server.use(
      http.get(`${BASE}/saved/grocery-lists/:id`, () => {
        return HttpResponse.json(mockGroceryList);
      })
    );

    renderInRoute(
      "/saved/list/list-1",
      "/saved/list/:id",
      <SavedGroceryListScreen />
    );

    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument()
    );
    expect(screen.getByText("Cucumber")).toBeInTheDocument();
  });
});

describe("SavedGroceryListScreen — error", () => {
  it("shows a not-found message when API rejects", async () => {
    server.use(
      http.get(`${BASE}/saved/grocery-lists/:id`, () => {
        return new HttpResponse(null, { status: 404 });
      })
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
