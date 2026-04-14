// recipe-info-sheet.test.tsx — TDD RED → GREEN (issue #57, Phase 3)
// Written FIRST before implementation exists.
//
// Tests:
//   T1: loading state then resolves with ingredients + instructions
//   T2: AI-suggested badge renders when is_ai_generated === true
//   T3: Chinese name rendered when lang === "zh"
//   T4: error state with retry triggers a re-fetch
//   T5: not_found state when getRecipeDetail throws RecipeNotFoundError
//   T6: cache hit on second open with same id — getRecipeDetail called once

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mock api-client — must appear before any import that transitively uses it
// ---------------------------------------------------------------------------

vi.mock("@/services/api-client", () => ({
  getRecipeDetail: vi.fn(),
  RecipeNotFoundError: class RecipeNotFoundError extends Error {
    recipeId: string;
    constructor(recipeId: string) {
      super(`Recipe not found: ${recipeId}`);
      this.name = "RecipeNotFoundError";
      this.recipeId = recipeId;
    }
  },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are hoisted
// ---------------------------------------------------------------------------

import { RecipeInfoSheet } from "@/components/recipe-info-sheet";
import { resetRecipeCacheForTests } from "@/components/recipe-cache";
import { getRecipeDetail, RecipeNotFoundError } from "@/services/api-client";
import type { RecipeDetail } from "@/types/tools";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockDetail: RecipeDetail = {
  id: "r_shrimp",
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
  ],
  instructions: "Step 1: Heat oil.\nStep 2: Add garlic.\nStep 3: Add shrimp.",
  is_ai_generated: false,
};

const mockDetailAI: RecipeDetail = {
  ...mockDetail,
  id: "r_ai",
  name: "AI Fusion Bowl",
  name_zh: "AI融合碗",
  is_ai_generated: true,
};

// ---------------------------------------------------------------------------
// Helper render
// ---------------------------------------------------------------------------

function renderSheet(
  props: Partial<{
    open: boolean;
    onClose: () => void;
    recipeId: string | null;
    lang: "en" | "zh";
  }> = {}
) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    recipeId: "r_shrimp",
    lang: "en" as const,
  };
  return render(<RecipeInfoSheet {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Reset cache + mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetRecipeCacheForTests();
});

// ---------------------------------------------------------------------------
// T1: loading state then ingredients + instructions after fetch resolves
// ---------------------------------------------------------------------------

describe("RecipeInfoSheet — T1: loading then ready", () => {
  it("shows spinner while loading, then renders ingredient names and instructions", async () => {
    let resolve!: (d: RecipeDetail) => void;
    const pending = new Promise<RecipeDetail>((res) => {
      resolve = res;
    });
    vi.mocked(getRecipeDetail).mockReturnValue(pending);

    renderSheet();

    // Loading indicator is visible immediately
    expect(screen.getByRole("status")).toBeInTheDocument();

    // Resolve the fetch
    await act(async () => {
      resolve(mockDetail);
      await pending;
    });

    // Ingredients visible
    await waitFor(() => {
      expect(screen.getByText("shrimp")).toBeInTheDocument();
    });
    expect(screen.getByText("garlic")).toBeInTheDocument();
    expect(screen.getByText("bok choy")).toBeInTheDocument();

    // Instructions text visible (whitespace-pre-line preserves newlines)
    expect(
      screen.getByText(/Step 1: Heat oil/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T2: AI-suggested badge
// ---------------------------------------------------------------------------

describe("RecipeInfoSheet — T2: AI-suggested badge", () => {
  it("renders AI-suggested pill when is_ai_generated === true", async () => {
    vi.mocked(getRecipeDetail).mockResolvedValue(mockDetailAI);

    renderSheet({ recipeId: "r_ai" });

    await waitFor(() => {
      expect(screen.getByText(/AI-suggested/i)).toBeInTheDocument();
    });
  });

  it("does not render AI-suggested pill when is_ai_generated === false", async () => {
    vi.mocked(getRecipeDetail).mockResolvedValue(mockDetail);

    renderSheet();

    await waitFor(() => {
      expect(screen.getByText("shrimp")).toBeInTheDocument();
    });
    expect(screen.queryByText(/AI-suggested/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T3: Chinese name when lang === "zh"
// ---------------------------------------------------------------------------

describe("RecipeInfoSheet — T3: Chinese name", () => {
  it("renders name_zh as primary title when lang === 'zh'", async () => {
    vi.mocked(getRecipeDetail).mockResolvedValue(mockDetail);

    renderSheet({ lang: "zh" });

    await waitFor(() => {
      expect(screen.getByText("蒜蓉蝦炒")).toBeInTheDocument();
    });
  });

  it("shows English name and CJK subtitle when lang === 'en' and name_zh exists", async () => {
    vi.mocked(getRecipeDetail).mockResolvedValue(mockDetail);

    renderSheet({ lang: "en" });

    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
      expect(screen.getByText("蒜蓉蝦炒")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T4: error state with retry triggers a re-fetch
// ---------------------------------------------------------------------------

describe("RecipeInfoSheet — T4: error state with retry", () => {
  it("shows error banner on fetch failure, retry button re-fetches", async () => {
    const user = userEvent.setup();

    // First call rejects
    vi.mocked(getRecipeDetail)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(mockDetail);

    renderSheet();

    // Error state shown
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Retry button present (ErrorBanner uses aria-label "Try again")
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();

    // Click retry — second fetch resolves
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("shrimp")).toBeInTheDocument();
    });

    // getRecipeDetail was called twice total
    expect(vi.mocked(getRecipeDetail)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// T5: not_found state
// ---------------------------------------------------------------------------

describe("RecipeInfoSheet — T5: not_found state", () => {
  it("renders 'Recipe details unavailable' when getRecipeDetail throws RecipeNotFoundError", async () => {
    vi.mocked(getRecipeDetail).mockRejectedValue(
      new RecipeNotFoundError("r_shrimp")
    );

    renderSheet();

    await waitFor(() => {
      expect(
        screen.getByText(/Recipe details unavailable/i)
      ).toBeInTheDocument();
    });

    // No retry button for not-found (ErrorBanner is not shown in not_found state)
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T6: cache hit on second open — getRecipeDetail called exactly once
// ---------------------------------------------------------------------------

describe("RecipeInfoSheet — T6: in-memory cache hit", () => {
  it("does not re-fetch when reopened with same recipeId", async () => {
    vi.mocked(getRecipeDetail).mockResolvedValue(mockDetail);

    const onClose = vi.fn();
    const { rerender } = renderSheet({ open: true, onClose });

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(screen.getByText("shrimp")).toBeInTheDocument();
    });
    expect(vi.mocked(getRecipeDetail)).toHaveBeenCalledTimes(1);

    // Close the sheet
    rerender(
      <RecipeInfoSheet
        open={false}
        onClose={onClose}
        recipeId="r_shrimp"
        lang="en"
      />
    );

    // Reopen with the same recipeId
    rerender(
      <RecipeInfoSheet
        open={true}
        onClose={onClose}
        recipeId="r_shrimp"
        lang="en"
      />
    );

    // Should render instantly without a second fetch
    await waitFor(() => {
      expect(screen.getByText("shrimp")).toBeInTheDocument();
    });
    // Still called only once
    expect(vi.mocked(getRecipeDetail)).toHaveBeenCalledTimes(1);
  });
});
