// SavedRecipeScreen tests — UAT fix for issue #69 (instructions scroll)
// TDD RED: written before the fix is applied.

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import type { SavedRecipe } from "@/types/api";

vi.mock("@/services/api-client", () => ({
  getSavedRecipe: vi.fn(),
}));

import { getSavedRecipe } from "@/services/api-client";

function makeSavedRecipe(): SavedRecipe {
  return {
    id: "recipe-1",
    notes: "",
    recipe_snapshot: {
      id: "r1",
      name: "Kung Pao Chicken",
      name_zh: "宮保雞丁",
      cuisine: "Chinese",
      serves: 4,
      cooking_method: "Stir-fry",
      source: "KB",
      source_url: "",
      effort_level: "medium",
      time_minutes: 30,
      flavor_tags: [],
      ingredients: [],
      is_ai_generated: false,
      instructions:
        "Step 1: heat oil\nStep 2: add chicken\nStep 3: this is a very long line that would overflow horizontally if whitespace-pre were used instead of whitespace-pre-wrap",
    },
    created_at: "2026-04-14T00:00:00Z",
    updated_at: "2026-04-14T00:00:00Z",
  };
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/saved/recipe/recipe-1"]}>
      <Routes>
        <Route path="/saved/recipe/:id" element={<SavedRecipeScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SavedRecipeScreen — instructions block CSS classes", () => {
  it("instructions pre block uses whitespace-pre-wrap and not overflow-x-auto", async () => {
    vi.mocked(getSavedRecipe).mockResolvedValueOnce(makeSavedRecipe());

    renderScreen();

    // Wait for recipe to load
    await waitFor(() =>
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument(),
    );

    // The instructions are rendered in a <pre> in view mode
    const preBlock = screen.getByText(/Step 1: heat oil/);

    // Must have whitespace-pre-wrap
    expect(preBlock.className).toMatch(/whitespace-pre-wrap/);

    // Must NOT have overflow-x-auto
    expect(preBlock.className).not.toMatch(/overflow-x-auto/);

    // Must NOT have bare whitespace-pre token as its own class
    const classes = preBlock.className.split(/\s+/);
    expect(classes).not.toContain("whitespace-pre");
  });
});
