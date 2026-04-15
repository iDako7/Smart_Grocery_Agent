// recipes-screen-swap-persist.test.tsx — TDD RED phase
//
// Tests swap persistence: when a user selects a replacement recipe,
// RecipesScreen calls patchSessionRecipe and handles success/failure.
//
// T-Persist-1: successful swap calls patchSessionRecipe with correct args
// T-Persist-2: failed swap shows build error and reverts the override

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Mock api-client before any imports.
vi.mock("@/services/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/api-client")>(
      "@/services/api-client"
    );
  return {
    ...actual,
    getRecipeDetail: vi.fn(() => new Promise(() => {})),
    postGroceryList: vi.fn(),
    patchSessionRecipe: vi.fn(),
  };
});

// base-ui alert-dialog mock (same as recipes-screen.test.tsx)
vi.mock("@base-ui/react/alert-dialog", async () => {
  const React = await import("react");
  type Props = { children?: React.ReactNode; className?: string };
  type RootProps = Props & {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  };
  const RootCtx = React.createContext<((v: boolean) => void) | undefined>(undefined);
  return {
    AlertDialog: {
      Root: ({ open, onOpenChange, children }: RootProps) => {
        React.useEffect(() => {
          if (!open) return;
          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange?.(false);
          };
          document.addEventListener("keydown", handleKeyDown);
          return () => document.removeEventListener("keydown", handleKeyDown);
        }, [open, onOpenChange]);
        return open ? (
          <RootCtx.Provider value={onOpenChange}>
            <div data-testid="alert-dialog-root">{children}</div>
          </RootCtx.Provider>
        ) : null;
      },
      Trigger: ({ children }: Props) => <>{children}</>,
      Portal: ({ children }: Props) => <>{children}</>,
      Backdrop: ({ children, className }: Props) => (
        <div className={className}>{children}</div>
      ),
      Popup: ({ children, className }: Props) => (
        <div className={className}>{children}</div>
      ),
      Title: ({ children, className }: Props) => (
        <h2 className={className}>{children}</h2>
      ),
      Description: ({ children, className }: Props) => (
        <p className={className}>{children}</p>
      ),
      Close: ({
        children,
        render: renderProp,
      }: Props & { render?: React.ReactElement }) => {
        const onOpenChange = React.useContext(RootCtx);
        const handleClick = () => onOpenChange?.(false);
        if (renderProp) {
          return React.cloneElement(
            renderProp as React.ReactElement<{ onClick?: () => void }>,
            { onClick: handleClick },
            children
          );
        }
        return <button onClick={handleClick}>{children}</button>;
      },
    },
  };
});

import React from "react";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { patchSessionRecipe } from "@/services/api-client";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import * as sessionContextModule from "@/context/session-context";
import { initialScreenData } from "@/hooks/use-screen-state";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const altA = makeRecipeSummary({
  id: "alt_a",
  name: "Alt A Recipe",
  name_zh: "替換A",
  cooking_method: "Boil",
  flavor_tags: ["Mild"],
});

const r1 = makeRecipeSummary({
  id: "r_main",
  name: "Main Recipe",
  name_zh: "主菜",
  alternatives: [altA],
});

// ---------------------------------------------------------------------------
// Helper: render RecipesScreen in complete state with r1 and a session id
// ---------------------------------------------------------------------------

function renderWithRecipeComplete(sessionId = "sess-persist") {
  const spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
    screenState: "complete",
    screenData: {
      ...initialScreenData,
      recipes: [r1],
      completionStatus: "complete",
    },
    isLoading: false,
    isStreaming: false,
    isComplete: true,
    isError: false,
    sessionId,
    conversationHistory: [],
    currentScreen: "recipes",
    sendMessage: vi.fn(),
    navigateToScreen: vi.fn(),
    resetSession: vi.fn(),
    addLocalTurn: vi.fn(),
    excludedByCard: {},
    toggleIngredientExclusion: vi.fn(),
    dispatch: vi.fn(),
  });

  render(
    <MemoryRouter initialEntries={["/recipes"]}>
      <RecipesScreen />
    </MemoryRouter>
  );

  return spy;
}

// ---------------------------------------------------------------------------
// T-Persist-1: successful swap calls patchSessionRecipe with correct args
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Persist-1: swap calls patchSessionRecipe on success", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(patchSessionRecipe).mockResolvedValue({
      session_id: "sess-persist",
      screen: "recipes",
      recipes: [altA],
      pcsv: null,
      grocery_list: null,
      conversation: [],
    } as never);
  });

  afterEach(() => {
    spy?.mockRestore();
    vi.mocked(patchSessionRecipe).mockReset();
  });

  it("test_swap_calls_patch_session_recipe_with_index_and_recipe", async () => {
    const user = userEvent.setup();
    spy = renderWithRecipeComplete("sess-persist");

    // Open swap panel for r1
    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);

    // Select Alt A
    await user.click(screen.getByRole("button", { name: /select alt a recipe/i }));

    await waitFor(() => {
      expect(vi.mocked(patchSessionRecipe)).toHaveBeenCalledWith(
        "sess-persist",
        0,           // index of r1 in the list
        altA
      );
    });
  });

  it("test_swap_ui_shows_replacement_after_success", async () => {
    const user = userEvent.setup();
    spy = renderWithRecipeComplete("sess-persist");

    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);
    await user.click(screen.getByRole("button", { name: /select alt a recipe/i }));

    // Card should now show Alt A
    expect(screen.getByText("Alt A Recipe")).toBeInTheDocument();
    expect(screen.queryByText("Main Recipe")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-Persist-2: failed swap shows error banner and reverts the override
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Persist-2: swap reverts on patchSessionRecipe failure", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(patchSessionRecipe).mockRejectedValue(new Error("500"));
  });

  afterEach(() => {
    spy?.mockRestore();
    vi.mocked(patchSessionRecipe).mockReset();
  });

  it("test_swap_reverts_override_on_api_failure", async () => {
    const user = userEvent.setup();
    spy = renderWithRecipeComplete("sess-persist");

    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);
    await user.click(screen.getByRole("button", { name: /select alt a recipe/i }));

    // After failure: original card name is back
    await waitFor(() => {
      expect(screen.getByText("Main Recipe")).toBeInTheDocument();
    });

    // Alt A must not be visible as the active card
    expect(screen.queryByText("Alt A Recipe")).toBeNull();
  });

  it("test_swap_shows_error_banner_on_api_failure", async () => {
    const user = userEvent.setup();
    spy = renderWithRecipeComplete("sess-persist");

    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);
    await user.click(screen.getByRole("button", { name: /select alt a recipe/i }));

    // Error banner visible
    await waitFor(() => {
      expect(screen.getByText(/couldn't save your recipe swap/i)).toBeInTheDocument();
    });
  });

  it("test_swap_panel_closes_on_api_failure", async () => {
    const user = userEvent.setup();
    spy = renderWithRecipeComplete("sess-persist");

    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);

    // Swap panel is open — "Select" buttons are visible
    expect(screen.getByRole("button", { name: /select alt a recipe/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select alt a recipe/i }));

    // After failure the swap panel must be gone
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /select alt a recipe/i })).toBeNull();
    });
  });

  it("test_swap_no_patch_called_when_no_session_id", async () => {
    const user = userEvent.setup();
    // sessionId = null → no backend call
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: {
        ...initialScreenData,
        recipes: [r1],
        completionStatus: "complete",
      },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: null,   // no session
      conversationHistory: [],
      currentScreen: "recipes",
      sendMessage: vi.fn(),
      navigateToScreen: vi.fn(),
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
      dispatch: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <RecipesScreen />
      </MemoryRouter>
    );

    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);
    await user.click(screen.getByRole("button", { name: /select alt a recipe/i }));

    // patchSessionRecipe must NOT be called when sessionId is null
    expect(vi.mocked(patchSessionRecipe)).not.toHaveBeenCalled();

    // Card still shows the swap (optimistic update still applied when no sessionId)
    expect(screen.getByText("Alt A Recipe")).toBeInTheDocument();
  });
});
