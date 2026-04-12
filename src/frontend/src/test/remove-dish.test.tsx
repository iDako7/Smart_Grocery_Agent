// Tests for the "Remove Dish" feature (R7):
//   - RecipeCard Remove button rendering under various prop combinations
//   - RecipesScreen integration: remove card, update count, hide button on last card

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import { RecipeCard } from "@/components/recipe-card";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider, useSession } from "@/context/session-context";
import type { ConversationTurn } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseCardProps = {
  index: 0,
  name: "Korean BBQ",
  nameCjk: "韩式烤肉",
  flavorProfile: "savory",
  cookingMethod: "grill",
  time: "30 min",
  ingredients: [{ name: "chicken", have: true }],
  onSwap: vi.fn(),
  onInfoClick: vi.fn(),
};

function renderRecipesScreen() {
  return render(
    <MemoryRouter initialEntries={["/recipes"]}>
      <ScenarioProvider>
        <SessionProvider>
          <RecipesScreen />
        </SessionProvider>
      </ScenarioProvider>
    </MemoryRouter>
  );
}

let capturedHistory: ConversationTurn[] = [];
function HistoryCapture() {
  const { conversationHistory } = useSession();
  capturedHistory = conversationHistory;
  return null;
}

function renderRecipesScreenWithHistory() {
  return render(
    <MemoryRouter initialEntries={["/recipes"]}>
      <ScenarioProvider>
        <SessionProvider>
          <RecipesScreen />
          <HistoryCapture />
        </SessionProvider>
      </ScenarioProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// RecipeCard unit tests
// ---------------------------------------------------------------------------

describe("RecipeCard — remove button", () => {
  it("shows Remove button when canRemove=true and not swapping", () => {
    render(
      <RecipeCard
        {...baseCardProps}
        onRemove={vi.fn()}
        canRemove={true}
        isSwapping={false}
      />
    );
    expect(
      screen.getByRole("button", { name: /remove korean bbq/i })
    ).toBeInTheDocument();
  });

  it("hides Remove button when canRemove=false", () => {
    render(
      <RecipeCard
        {...baseCardProps}
        onRemove={vi.fn()}
        canRemove={false}
      />
    );
    expect(
      screen.queryByRole("button", { name: /remove korean bbq/i })
    ).not.toBeInTheDocument();
  });

  it("hides Remove button when isSwapping=true (even if canRemove=true)", () => {
    render(
      <RecipeCard
        {...baseCardProps}
        onRemove={vi.fn()}
        canRemove={true}
        isSwapping={true}
      />
    );
    expect(
      screen.queryByRole("button", { name: /remove korean bbq/i })
    ).not.toBeInTheDocument();
  });

  it("hides Remove button when onRemove is not provided", () => {
    render(
      <RecipeCard
        {...baseCardProps}
        canRemove={true}
      />
    );
    expect(
      screen.queryByRole("button", { name: /remove korean bbq/i })
    ).not.toBeInTheDocument();
  });

  it("calls onRemove when Remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <RecipeCard
        {...baseCardProps}
        onRemove={onRemove}
        canRemove={true}
        isSwapping={false}
      />
    );
    await user.click(screen.getByRole("button", { name: /remove korean bbq/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("footer stays justify-end (Try another right-aligned) when canRemove=false", () => {
    render(
      <RecipeCard
        {...baseCardProps}
        canRemove={false}
        isSwapping={false}
      />
    );
    // Try another is still present and no remove button beside it
    expect(screen.getByText(/try another/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove korean bbq/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RecipesScreen integration tests — addLocalTurn
// ---------------------------------------------------------------------------

describe("RecipesScreen integration — addLocalTurn", () => {
  it("handleRemove calls addLocalTurn with [Removed {name} from meal plan]", async () => {
    capturedHistory = [];
    const user = userEvent.setup();
    renderRecipesScreenWithHistory();

    // The first recipe in the BBQ scenario is "Korean BBQ Pork Belly"
    const recipeName = "Korean BBQ Pork Belly";
    const removeButtons = screen.getAllByRole("button", { name: /^remove /i });

    await act(async () => {
      await user.click(removeButtons[0]);
    });

    const expectedContent = `[Removed ${recipeName} from meal plan]`;
    expect(capturedHistory.some((turn) => turn.content === expectedContent)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RecipesScreen integration tests
// ---------------------------------------------------------------------------

describe("RecipesScreen — remove dish", () => {
  it("clicking Remove removes the card from the list", async () => {
    const user = userEvent.setup();
    renderRecipesScreen();

    // Default BBQ scenario has 3 recipes
    const initialRemoveButtons = screen.getAllByRole("button", { name: /^remove /i });
    expect(initialRemoveButtons).toHaveLength(3);

    // Remove the first dish
    await act(async () => {
      await user.click(initialRemoveButtons[0]);
    });

    // Now only 2 remove buttons should exist
    expect(screen.getAllByRole("button", { name: /^remove /i })).toHaveLength(2);
  });

  it("dish count in header updates after removal", async () => {
    const user = userEvent.setup();
    renderRecipesScreen();

    // Header renders "<b>3</b> dishes" — text is split across child elements.
    // Use a function matcher that checks the span's full textContent.
    const dishBadge3 = screen.getByText(
      (_content, node) => node?.tagName === "SPAN" && (node.textContent ?? "").trim() === "3 dishes"
    );
    expect(dishBadge3).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: /^remove /i });
    await act(async () => {
      await user.click(removeButtons[0]);
    });

    // Now the badge should show "2 dishes"
    const dishBadge2 = screen.getByText(
      (_content, node) => node?.tagName === "SPAN" && (node.textContent ?? "").trim() === "2 dishes"
    );
    expect(dishBadge2).toBeInTheDocument();
  });

  it("Remove button hidden on last remaining card", async () => {
    const user = userEvent.setup();
    renderRecipesScreen();

    // Remove down to 1 card
    let removeButtons = screen.getAllByRole("button", { name: /^remove /i });
    await act(async () => { await user.click(removeButtons[0]); });

    removeButtons = screen.getAllByRole("button", { name: /^remove /i });
    await act(async () => { await user.click(removeButtons[0]); });

    // Only 1 card left — no Remove button should be visible
    expect(
      screen.queryByRole("button", { name: /^remove /i })
    ).not.toBeInTheDocument();
  });

  it("removing a card does not affect the remaining cards' content", async () => {
    const user = userEvent.setup();
    renderRecipesScreen();

    // Confirm initial recipes exist
    expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument();
    expect(screen.getByText("Grilled Corn & Cucumber Salad")).toBeInTheDocument();
    expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument();

    // Remove the first card (Korean BBQ Pork Belly)
    const removeButtons = screen.getAllByRole("button", { name: /^remove /i });
    await act(async () => {
      await user.click(removeButtons[0]);
    });

    // Remaining two should still be visible
    expect(screen.queryByText("Korean BBQ Pork Belly")).not.toBeInTheDocument();
    expect(screen.getByText("Grilled Corn & Cucumber Salad")).toBeInTheDocument();
    expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument();
  });
});
