// recipe-detail-flow.integration.test.tsx — Phase 5 of issue #57
//
// Full-flow integration: RecipesScreen (inside SessionProvider) + real
// RecipeInfoSheet + real api-client.  Uses MSW per-test overrides to exercise
// the complete path from clicking the info button through to rendered
// ingredient/instruction content.
//
// Test cases:
//   1. clicking info button fetches recipe detail and renders ingredients +
//      instructions + AI badge + source link
//   2. reopening same recipe uses cache (fetch not called again)

import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { http, HttpResponse } from "msw";

// ---------------------------------------------------------------------------
// Reset the module-level recipe cache before every test so tests are
// independent.  The seam is exported from recipe-cache.ts.
// ---------------------------------------------------------------------------

import { resetRecipeCacheForTests } from "@/components/recipe-cache";

// ---------------------------------------------------------------------------
// Import AFTER cache-reset import so mock hoisting doesn't break things.
// ---------------------------------------------------------------------------

import { renderWithSession, createMockChatService } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import type { RecipeSummary } from "@/types/tools";
import type { RecipeDetail } from "@/types/tools";
import { server } from "@/test/msw/server";
import { BASE } from "@/test/msw/constants";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** RecipeSummary for the recipe shown on the RecipesScreen card list. */
const seedRecipe: RecipeSummary = makeRecipeSummary({
  id: "r001",
  name: "Garlic Shrimp Stir-Fry",
  name_zh: "蒜蓉蝦炒",
  cuisine: "Chinese",
  cooking_method: "Stir-fry",
  effort_level: "quick",
  flavor_tags: ["Savory", "Garlicky"],
  ingredients_have: ["shrimp", "garlic"],
  ingredients_need: ["bok choy"],
});

/**
 * RecipeDetail payload returned by GET /recipe/r001.
 * Exercises ALL render paths: PCSV roles, multi-line instructions,
 * is_ai_generated=true, source_url.
 */
const recipeDetailPayload: RecipeDetail = {
  id: "r001",
  name: "Garlic Shrimp Stir-Fry",
  name_zh: "蒜蓉蝦炒",
  source: "KB",
  source_url: "https://example.com/garlic-shrimp",
  cuisine: "Chinese",
  cooking_method: "Stir-fry",
  effort_level: "quick",
  time_minutes: 20,
  flavor_tags: ["Savory", "Garlicky"],
  serves: 2,
  ingredients: [
    { name: "shrimp", amount: "300g", pcsv: ["protein"] },
    { name: "garlic", amount: "4 cloves", pcsv: ["sauce"] },
    { name: "bok choy", amount: "200g", pcsv: ["veggie"] },
    { name: "rice", amount: "1 cup", pcsv: ["carb"] },
  ],
  instructions:
    "Step 1: Heat wok over high heat.\nStep 2: Add garlic and stir 30 sec.\nStep 3: Add shrimp and toss 2 min.\nStep 4: Add bok choy and serve.",
  is_ai_generated: true,
};

// ---------------------------------------------------------------------------
// Driver component — uses session dispatch to drive RecipesScreen to a
// "complete" state with the seed recipe pre-loaded.
// ---------------------------------------------------------------------------

function RecipesWithSeeded({ recipes }: { recipes: RecipeSummary[] }) {
  const session = useSessionOptional();

  useEffect(() => {
    if (!session) return;
    session.dispatch({ type: "start_loading" });
    session.dispatch({ type: "start_streaming" });
    for (const r of recipes) {
      session.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: r },
      });
    }
    session.dispatch({ type: "complete", status: "complete" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <RecipesScreen />;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  resetRecipeCacheForTests();
  // Also reset the api-client auth token cache so each test starts clean.
  const { resetAuthToken } = await import("@/services/api-client");
  resetAuthToken();
});

// ---------------------------------------------------------------------------
// Test 1: clicking info button fetches recipe detail and renders content
// ---------------------------------------------------------------------------

describe("recipe-detail flow — clicking info button", () => {
  it("fetches recipe detail and renders ingredients + instructions + AI badge + source link", async () => {
    const user = userEvent.setup();

    const capturedRequests: Request[] = [];
    server.use(
      http.get(`${BASE}/recipe/r001`, ({ request }) => {
        capturedRequests.push(request);
        return HttpResponse.json(recipeDetailPayload);
      })
    );

    const mock = createMockChatService();
    renderWithSession(
      <RecipesWithSeeded recipes={[seedRecipe]} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Card should be visible
    expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();

    // Click the info button — aria-label matches RecipeCard's pattern
    const infoBtn = screen.getByRole("button", {
      name: /info about garlic shrimp stir-fry/i,
    });
    await user.click(infoBtn);

    // After fetch resolves → ingredient names appear in the sheet's ingredient list.
    // "shrimp" also appears on the RecipeCard as an ingredient tag, so we use
    // getAllByText and check that at least 2 elements render it (card + sheet).
    await waitFor(() => {
      const shrimpEls = screen.getAllByText("shrimp");
      // At minimum: RecipeCard ingredient chip + RecipeInfoSheet ingredient row
      expect(shrimpEls.length).toBeGreaterThanOrEqual(2);
    });

    // Other sheet-only ingredients — "rice" is only in the detail payload, not
    // in the RecipeSummary's ingredients_have/need, so it uniquely identifies
    // the sheet content.
    expect(screen.getByText("rice")).toBeInTheDocument();

    // Multi-line instructions — assert on text that only exists in instructions
    expect(screen.getByText(/Step 1: Heat wok/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3: Add shrimp/i)).toBeInTheDocument();

    // AI-suggested badge visible (is_ai_generated: true)
    expect(screen.getByText(/AI-suggested/i)).toBeInTheDocument();

    // Source link rendered
    const sourceLink = screen.getByRole("link", { name: /view source/i });
    expect(sourceLink).toBeInTheDocument();
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://example.com/garlic-shrimp"
    );

    // Recipe endpoint was hit exactly once
    expect(capturedRequests).toHaveLength(1);

    // Auth header present with the MSW default JWT
    expect(capturedRequests[0].headers.get("Authorization")).toBe(
      "Bearer msw-test-jwt"
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: reopening same recipe uses cache (fetch not called again)
// ---------------------------------------------------------------------------

describe("recipe-detail flow — cache hit on reopen", () => {
  it("does not call fetch a second time when the same recipe is reopened", async () => {
    const user = userEvent.setup();

    const capturedRequests: Request[] = [];
    server.use(
      http.get(`${BASE}/recipe/r001`, ({ request }) => {
        capturedRequests.push(request);
        return HttpResponse.json(recipeDetailPayload);
      })
    );

    const mock = createMockChatService();
    renderWithSession(
      <RecipesWithSeeded recipes={[seedRecipe]} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // --- First open ---
    const infoBtn = screen.getByRole("button", {
      name: /info about garlic shrimp stir-fry/i,
    });
    await user.click(infoBtn);

    // Wait for content to load.  "rice" is only in the detail payload (not in
    // the RecipeSummary seed), so it uniquely marks the sheet as fully rendered.
    await waitFor(() => {
      expect(screen.getByText("rice")).toBeInTheDocument();
    });

    // Recipe endpoint called once after first open
    expect(capturedRequests.filter(r => r.url.includes("/recipe/r001"))).toHaveLength(1);

    // --- Close the sheet ---
    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);

    // Sheet is gone — "rice" (sheet-only content) should no longer be visible
    await waitFor(() => {
      expect(screen.queryByText("rice")).toBeNull();
    });

    // --- Reopen the same recipe ---
    // The info button is still in the DOM (RecipesScreen keeps the card list)
    const infoBtnAgain = screen.getByRole("button", {
      name: /info about garlic shrimp stir-fry/i,
    });
    await user.click(infoBtnAgain);

    // Content renders immediately from cache (no new spinner wait needed)
    await waitFor(() => {
      expect(screen.getByText("rice")).toBeInTheDocument();
    });

    // The recipe endpoint was only requested once across both opens (cache hit)
    expect(capturedRequests.filter(r => r.url.includes("/recipe/r001"))).toHaveLength(1);
  });
});
