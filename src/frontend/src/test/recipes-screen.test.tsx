// RecipesScreen integration tests — TDD RED → GREEN (issue #39, T-C).
// Written FIRST before implementation. All 11 tests should RED on an
// empty RecipesScreen shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Base-ui mock for alert-dialog (matches clarify-screen.test.tsx pattern).
vi.mock("@base-ui/react/alert-dialog", async () => {
  const React = await import("react");
  type Props = { children?: React.ReactNode; className?: string };
  type RootProps = Props & {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  };
  const RootCtx = React.createContext<((v: boolean) => void) | undefined>(
    undefined
  );
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

import React, { useEffect } from "react";
import { Routes, Route, MemoryRouter } from "react-router";

import { RecipesScreen } from "@/screens/RecipesScreen";
import { renderWithSession, createMockChatService } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import * as sessionContextModule from "@/context/session-context";
import { initialScreenData } from "@/hooks/use-screen-state";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import type { RecipeSummary } from "@/types/tools";

// ---------------------------------------------------------------------------
// Fixtures: three distinct recipes for assertions
// ---------------------------------------------------------------------------

const recipe1: RecipeSummary = makeRecipeSummary({
  id: "r_shrimp",
  name: "Garlic Shrimp Stir-Fry",
  name_zh: "蒜蓉蝦炒",
  cuisine: "Chinese",
  cooking_method: "Stir-fry",
  effort_level: "quick",
  flavor_tags: ["Savory", "Garlicky"],
  ingredients_have: ["shrimp", "garlic"],
  ingredients_need: ["scallion", "bok choy"],
});

const recipe2: RecipeSummary = makeRecipeSummary({
  id: "r_tacos",
  name: "Chicken Tinga Tacos",
  name_zh: "雞肉墨西哥捲",
  cuisine: "Mexican",
  cooking_method: "Braise",
  effort_level: "medium",
  flavor_tags: ["Smoky", "Spicy"],
  ingredients_have: ["chicken thigh", "tortillas"],
  ingredients_need: ["chipotle", "lime"],
});

const recipe3: RecipeSummary = makeRecipeSummary({
  id: "r_ratatouille",
  name: "Summer Ratatouille",
  name_zh: "普羅旺斯燉菜",
  cuisine: "French",
  cooking_method: "Roast",
  effort_level: "long",
  flavor_tags: ["Herby", "Bright"],
  ingredients_have: ["zucchini", "tomato"],
  ingredients_need: ["eggplant", "thyme"],
});

// ---------------------------------------------------------------------------
// Helper driver component — uses session dispatch to force a given state.
// ---------------------------------------------------------------------------

type Drive =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "streaming"; recipes: RecipeSummary[] }
  | {
      kind: "complete";
      recipes: RecipeSummary[];
      completionStatus?: "complete" | "partial";
    }
  | { kind: "error" };

function RecipesWith({ drive }: { drive: Drive }) {
  const session = useSessionOptional();

  useEffect(() => {
    if (!session) return;
    if (drive.kind === "idle") return;

    session.dispatch({ type: "start_loading" });
    if (drive.kind === "loading") return;

    session.dispatch({ type: "start_streaming" });
    if (drive.kind === "streaming") {
      for (const r of drive.recipes) {
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: r },
        });
      }
      return;
    }
    if (drive.kind === "complete") {
      for (const r of drive.recipes) {
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: r },
        });
      }
      session.dispatch({
        type: "complete",
        status: drive.completionStatus ?? "complete",
      });
      return;
    }
    if (drive.kind === "error") {
      session.dispatch({
        type: "receive_event",
        event: {
          event_type: "error",
          message: "Something went wrong. Please try again.",
          code: null,
          recoverable: false,
        },
      });
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <RecipesScreen />;
}

// ---------------------------------------------------------------------------
// T1: idle → empty state
// ---------------------------------------------------------------------------

describe("RecipesScreen — T1: idle shows empty state", () => {
  it("test_recipes_screen_idle_empty_state", () => {
    const mock = createMockChatService();

    renderWithSession(<RecipesWith drive={{ kind: "idle" }} />, {
      chatService: mock.service,
      initialPath: "/recipes",
    });

    // Empty placeholder visible
    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();

    // No skeletons, no cards
    expect(screen.queryAllByTestId("recipe-card-skeleton")).toHaveLength(0);
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T2: loading → 3 skeleton cards, CTA disabled
// ---------------------------------------------------------------------------

describe("RecipesScreen — T2: loading shows 3 skeletons", () => {
  it("test_recipes_screen_loading_three_skeletons", () => {
    const mock = createMockChatService();

    renderWithSession(<RecipesWith drive={{ kind: "loading" }} />, {
      chatService: mock.service,
      initialPath: "/recipes",
    });

    // Exactly 3 skeleton cards
    expect(screen.getAllByTestId("recipe-card-skeleton")).toHaveLength(3);

    // No real cards rendered
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();

    // CTA is not present (no recipes) OR is present but disabled.
    // Spec: CTA visible when recipes.length > 0 — during loading, no recipes yet.
    expect(
      screen.queryByRole("button", { name: /build list/i })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T3: streaming → real cards render, CTA disabled
// ---------------------------------------------------------------------------

describe("RecipesScreen — T3: streaming renders cards with CTA disabled", () => {
  it("test_recipes_screen_streaming_cards_cta_disabled", () => {
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "streaming", recipes: [recipe1, recipe2] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Real card names are present
    expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    expect(screen.getByText("Chicken Tinga Tacos")).toBeInTheDocument();

    // CTA present but disabled during streaming
    const cta = screen.getByRole("button", { name: /build list/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// T4: complete → all 3 cards + CTA enabled
// ---------------------------------------------------------------------------

describe("RecipesScreen — T4: complete renders all cards, CTA enabled", () => {
  it("test_recipes_screen_complete_cta_enabled", () => {
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2, recipe3] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // All three card names
    expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    expect(screen.getByText("Chicken Tinga Tacos")).toBeInTheDocument();
    expect(screen.getByText("Summer Ratatouille")).toBeInTheDocument();

    // Cuisine + cooking_method visible (via meta line flavorProfile/cookingMethod
    // — we assert on cooking_method text which is uniquely rendered in RecipeCard)
    expect(screen.getByText("Stir-fry")).toBeInTheDocument();
    expect(screen.getByText("Braise")).toBeInTheDocument();
    expect(screen.getByText("Roast")).toBeInTheDocument();

    // Time strings rendered by effortToTime — one per effort level
    expect(screen.getByText("20 min")).toBeInTheDocument();
    expect(screen.getByText("35 min")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();

    // CTA is enabled
    const cta = screen.getByRole("button", { name: /build list/i });
    expect(cta).toBeInTheDocument();
    expect(cta).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// T5: error → ErrorBanner + retry; no cards
// ---------------------------------------------------------------------------

describe("RecipesScreen — T5: error shows ErrorBanner no cards", () => {
  it("test_recipes_screen_error_banner_no_cards", () => {
    const mock = createMockChatService();

    renderWithSession(<RecipesWith drive={{ kind: "error" }} />, {
      chatService: mock.service,
      initialPath: "/recipes",
    });

    // Error message visible
    expect(
      screen.getByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();

    // Retry button visible
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();

    // No cards
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();
    expect(screen.queryAllByTestId("recipe-card-skeleton")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T6: lang toggle → cards show name_zh in zh mode
// ---------------------------------------------------------------------------

describe("RecipesScreen — T6: lang toggle shows CJK names", () => {
  it("test_recipes_screen_lang_toggle_shows_zh", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Initially EN only — CJK names NOT rendered
    expect(screen.queryByText("蒜蓉蝦炒")).toBeNull();
    expect(screen.queryByText("雞肉墨西哥捲")).toBeNull();

    // Click the 中 toggle
    const zhButton = screen.getByRole("button", { name: /^中$/ });
    await user.click(zhButton);

    // CJK names now visible
    expect(screen.getByText("蒜蓉蝦炒")).toBeInTheDocument();
    expect(screen.getByText("雞肉墨西哥捲")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T7: complete with empty recipes → empty state (NOT mock leak)
// ---------------------------------------------------------------------------

describe("RecipesScreen — T7: complete with empty recipes shows empty state", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: {
        ...initialScreenData,
        recipes: [],
        completionStatus: "complete",
      },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: null,
      conversationHistory: [],
      currentScreen: "recipes",
      sendMessage: vi.fn(),
      navigateToScreen: vi.fn(),
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      dispatch: vi.fn(),
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("test_recipes_screen_complete_empty_shows_empty_state", () => {
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <RecipesScreen />
      </MemoryRouter>
    );

    // Empty placeholder visible
    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();

    // Regression guard — no mock leak strings
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();
    expect(screen.queryByText("Chicken Tinga Tacos")).toBeNull();

    // No CTA since no recipes
    expect(
      screen.queryByRole("button", { name: /build list/i })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T8: partial completion → banner visible above cards
// ---------------------------------------------------------------------------

describe("RecipesScreen — T8: partial completion banner", () => {
  it("test_recipes_screen_partial_banner_above_cards", () => {
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{
          kind: "complete",
          recipes: [recipe1, recipe2],
          completionStatus: "partial",
        }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Partial banner text (new T-B wording)
    expect(
      screen.getByText(
        /The assistant hit its thinking limit\. Some results may be incomplete\./i
      )
    ).toBeInTheDocument();

    // Cards still render
    expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    expect(screen.getByText("Chicken Tinga Tacos")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T9: click "Build list" → navigates to /grocery and calls navigateToScreen
// ---------------------------------------------------------------------------

describe("RecipesScreen — T9: Build list navigates to grocery", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const navigateToScreenSpy = vi.fn();

  beforeEach(() => {
    navigateToScreenSpy.mockClear();
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: {
        ...initialScreenData,
        recipes: [recipe1, recipe2],
        completionStatus: "complete",
      },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: null,
      conversationHistory: [],
      currentScreen: "recipes",
      sendMessage: vi.fn(),
      navigateToScreen: navigateToScreenSpy,
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      dispatch: vi.fn(),
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("test_recipes_screen_build_list_navigates_to_grocery", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route
            path="/grocery"
            element={<div data-testid="screen-grocery">Grocery route</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    const cta = screen.getByRole("button", { name: /build list/i });
    await user.click(cta);

    // navigateToScreen called with "grocery"
    expect(navigateToScreenSpy).toHaveBeenCalledWith("grocery");

    // Navigated to /grocery route
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T10: click info on card 2 → InfoSheet opens with card 2 fields
// ---------------------------------------------------------------------------

describe("RecipesScreen — T10: info button opens InfoSheet with summary data", () => {
  it("test_recipes_screen_info_sheet_opens_with_card_data", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Click the info button on card 2
    const infoButton = screen.getByRole("button", {
      name: /info about chicken tinga tacos/i,
    });
    await user.click(infoButton);

    // InfoSheet shows recipe2 data: name, flavor tags, synthesized description
    // Name appears in both the card and the sheet — use getAllByText for "Chicken Tinga Tacos"
    expect(screen.getAllByText("Chicken Tinga Tacos").length).toBeGreaterThanOrEqual(1);

    // Flavor tags from recipe2
    expect(screen.getAllByText("Smoky").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Spicy").length).toBeGreaterThanOrEqual(1);

    // Synthesized description contains cuisine, cooking_method, effort_level, serves
    expect(
      screen.getByText(/Mexican.*Braise.*medium.*serves 2/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T11: swap button rendered but disabled
// ---------------------------------------------------------------------------

describe("RecipesScreen — T11: swap button disabled", () => {
  it("test_recipes_screen_swap_disabled", () => {
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Swap button ("Try another") rendered and disabled on every card
    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    expect(swapButtons.length).toBe(2);
    for (const btn of swapButtons) {
      expect(btn).toBeDisabled();
    }
  });
});
