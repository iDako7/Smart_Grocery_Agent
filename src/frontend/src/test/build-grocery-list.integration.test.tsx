// build-grocery-list.integration.test.tsx — TDD RED phase
//
// Integration tests for the "Build list" button wiring in RecipesScreen:
//   1. Navigates to grocery screen when clicked
//   2. Does NOT call postGroceryList when sessionId is null
//   3. Toggling a buy pill then clicking "Build list" still navigates
//   4. Button exists and is enabled initially

import { vi, describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";

import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider } from "@/context/session-context";

// ---------------------------------------------------------------------------
// Mock postGroceryList only — collectBuyItems runs as real code
// ---------------------------------------------------------------------------

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return {
    ...actual,
    postGroceryList: vi.fn(),
  };
});

import { postGroceryList } from "@/services/api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render at /recipes with a full route tree so navigation to /grocery works.
 * No chatService is provided so sessionId stays null throughout the tests.
 */
function renderAtRecipes() {
  return render(
    <ScenarioProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/recipes"]}>
          <Routes>
            <Route path="/recipes" element={<RecipesScreen />} />
            <Route path="/grocery" element={<GroceryScreen />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ScenarioProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1: Build list navigates to grocery screen when clicked
// ---------------------------------------------------------------------------

describe("RecipesScreen Build list button", () => {
  it("navigates to grocery screen when clicked", async () => {
    const user = userEvent.setup();
    renderAtRecipes();

    // Recipes screen should be visible
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /build list/i }));

    // Should have navigated to grocery
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Test 2: Does not call postGroceryList when sessionId is null
  // ---------------------------------------------------------------------------

  it("does not call postGroceryList when sessionId is null", async () => {
    const user = userEvent.setup();
    renderAtRecipes();

    // SessionId is null because no real SSE service runs and no chatService provided
    await user.click(screen.getByRole("button", { name: /build list/i }));

    // API must NOT have been called
    expect(postGroceryList).not.toHaveBeenCalled();

    // Navigation still happened
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Toggling a buy pill then clicking "Build list" still navigates
  // ---------------------------------------------------------------------------

  it("navigates to grocery after toggling a buy pill", async () => {
    const user = userEvent.setup();
    renderAtRecipes();

    // Find a "need to buy" pill (have: false) — gochujang is the first need-to-buy
    // ingredient in the bbq-weekend scenario for recipe 0.
    // RecipeCard renders these as orange pills the user can toggle.
    const gochujangPill = screen.getByRole("button", { name: /gochujang/i });
    await user.click(gochujangPill);

    // Click Build list
    await user.click(screen.getByRole("button", { name: /build list/i }));

    // Still navigates correctly
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Test 4: Button exists and is enabled initially
  // ---------------------------------------------------------------------------

  it("button exists and is not disabled initially", () => {
    renderAtRecipes();

    const btn = screen.getByRole("button", { name: /build list/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });
});
