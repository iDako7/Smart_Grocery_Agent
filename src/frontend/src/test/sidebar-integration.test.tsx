// Tests for HomeScreen sidebar wired to real backend list endpoints.
// Mocks the 3 list API functions from @/services/api-client.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { HomeScreen } from "@/screens/HomeScreen";
import { ScenarioProvider } from "@/context/scenario-context";
import {
  listSavedMealPlans,
  listSavedRecipes,
  listSavedGroceryLists,
} from "@/services/api-client";

// ---------------------------------------------------------------------------
// Module mock — all 3 list functions are mocked; getAuthToken is stubbed too
// ---------------------------------------------------------------------------
vi.mock("@/services/api-client", () => ({
  listSavedMealPlans: vi.fn(),
  listSavedRecipes: vi.fn(),
  listSavedGroceryLists: vi.fn(),
  getAuthToken: vi.fn().mockResolvedValue("test-token"),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function renderHomeScreen() {
  return render(
    <ScenarioProvider>
      <MemoryRouter initialEntries={["/"]}>
        <HomeScreen />
      </MemoryRouter>
    </ScenarioProvider>
  );
}

// ---------------------------------------------------------------------------
// Default: resolve with empty arrays unless overridden in individual tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  (listSavedMealPlans as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listSavedRecipes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listSavedGroceryLists as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("sidebar-integration: fetching sidebar data", () => {
  it("calls all 3 list API functions on mount", async () => {
    renderHomeScreen();
    await waitFor(() => {
      expect(listSavedMealPlans).toHaveBeenCalledTimes(1);
      expect(listSavedRecipes).toHaveBeenCalledTimes(1);
      expect(listSavedGroceryLists).toHaveBeenCalledTimes(1);
    });
  });

  it("displays fetched meal plan name when sidebar is opened", async () => {
    (listSavedMealPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        name: "BBQ Plan",
        recipe_count: 3,
        created_at: "2026-04-12T00:00:00Z",
        updated_at: "2026-04-12T00:00:00Z",
      },
    ]);

    const user = userEvent.setup();
    renderHomeScreen();

    // Wait for fetch to complete, then open sidebar
    await waitFor(() => expect(listSavedMealPlans).toHaveBeenCalled());
    await user.click(screen.getByLabelText(/open menu/i));

    expect(screen.getByText("BBQ Plan")).toBeInTheDocument();
    expect(screen.getByText("3 recipes")).toBeInTheDocument();
  });

  it("displays fetched grocery list name when sidebar is opened", async () => {
    (listSavedGroceryLists as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "gl1",
        name: "Weekend Shop",
        item_count: 8,
        created_at: "2026-04-12T00:00:00Z",
        updated_at: "2026-04-12T00:00:00Z",
      },
    ]);

    const user = userEvent.setup();
    renderHomeScreen();

    await waitFor(() => expect(listSavedGroceryLists).toHaveBeenCalled());
    await user.click(screen.getByLabelText(/open menu/i));

    expect(screen.getByText("Weekend Shop")).toBeInTheDocument();
    expect(screen.getByText("8 items")).toBeInTheDocument();
  });

  it("shows empty sections when API returns empty arrays", async () => {
    // All 3 mocks already return [] from beforeEach
    const user = userEvent.setup();
    renderHomeScreen();

    await waitFor(() => expect(listSavedMealPlans).toHaveBeenCalled());
    await user.click(screen.getByLabelText(/open menu/i));

    // Section headings are present, but no item buttons
    expect(screen.getByText("Meal plans")).toBeInTheDocument();
    expect(screen.getByText("Saved recipes")).toBeInTheDocument();
    expect(screen.getByText("Grocery lists")).toBeInTheDocument();

    // No item-level name buttons rendered
    expect(screen.queryByText("BBQ Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Weekend Shop")).not.toBeInTheDocument();
  });

  it("renders without crashing when all API calls reject", async () => {
    (listSavedMealPlans as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );
    (listSavedRecipes as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );
    (listSavedGroceryLists as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );

    renderHomeScreen();

    // Should not throw — the component must be in the DOM
    await waitFor(() =>
      expect(screen.getByTestId("screen-home")).toBeInTheDocument()
    );
  });

  it("formats recipe saved date using toLocaleDateString", async () => {
    (listSavedRecipes as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "r1",
        recipe_name: "Salt Chicken",
        recipe_name_zh: "盐水鸡",
        created_at: "2026-04-12T00:00:00Z",
        updated_at: "2026-04-12T00:00:00Z",
      },
    ]);

    const user = userEvent.setup();
    renderHomeScreen();

    await waitFor(() => expect(listSavedRecipes).toHaveBeenCalled());
    await user.click(screen.getByLabelText(/open menu/i));

    expect(screen.getByText("Salt Chicken")).toBeInTheDocument();
    // meta is the localized date string — just assert it exists (locale-dependent)
    const expectedDate = new Date("2026-04-12T00:00:00Z").toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });
});
