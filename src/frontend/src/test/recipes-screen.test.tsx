// RecipesScreen integration tests — TDD RED → GREEN (issue #39, T-C).
// Written FIRST before implementation. All 11 tests should RED on an
// empty RecipesScreen shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock api-client so RecipeInfoSheet (child of RecipesScreen) doesn't hit network.
// Phase 3 owns RecipeInfoSheet's full coverage — here we only assert call-through.
// postGroceryList is controlled per-test to test the build-list flow.
vi.mock("@/services/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/api-client")>(
      "@/services/api-client"
    );
  return {
    ...actual,
    getRecipeDetail: vi.fn(() => new Promise(() => {})), // pending forever
    postGroceryList: vi.fn(), // controlled per-test
    saveMealPlan: vi.fn(), // controlled per-test
  };
});

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
import { GroceryScreen } from "@/screens/GroceryScreen";
import { getRecipeDetail, postGroceryList, saveMealPlan } from "@/services/api-client";
import { resetRecipeCacheForTests } from "@/components/recipe-cache";
import { renderWithSession, createMockChatService } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import * as sessionContextModule from "@/context/session-context";
import { initialScreenData } from "@/hooks/use-screen-state";
import type { ScreenAction } from "@/hooks/use-screen-state";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import type { RecipeSummary } from "@/types/tools";
import type { GroceryStore } from "@/types/sse";

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
  // Canonical ingredients (T3 backend shape). have flag derived by substring match against ingredients_have.
  ingredients: [
    { name: "shrimp", amount: "200g", pcsv: ["protein"] },
    { name: "garlic", amount: "4 cloves", pcsv: ["sauce"] },
    { name: "scallion", amount: "2 stalks", pcsv: ["veggie"] },
    { name: "bok choy", amount: "1 head", pcsv: ["veggie"] },
  ],
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
  ingredients: [
    { name: "chicken thigh", amount: "500g", pcsv: ["protein"] },
    { name: "tortillas", amount: "8", pcsv: ["carb"] },
    { name: "chipotle", amount: "1 can", pcsv: ["sauce"] },
    { name: "lime", amount: "2", pcsv: ["sauce"] },
  ],
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
  ingredients: [
    { name: "zucchini", amount: "2", pcsv: ["veggie"] },
    { name: "tomato", amount: "3", pcsv: ["veggie"] },
    { name: "eggplant", amount: "1", pcsv: ["veggie"] },
    { name: "thyme", amount: "1 tsp", pcsv: ["sauce"] },
  ],
  ingredients_have: ["zucchini", "tomato"],
  ingredients_need: ["eggplant", "thyme"],
});

// Stores returned by the mocked postGroceryList endpoint (T9, T16).
const STORES: GroceryStore[] = [
  {
    store_name: "Save-On-Foods",
    departments: [
      {
        name: "Produce",
        items: [
          { id: "i1", name: "scallion", amount: "1 bunch", recipe_context: "Garlic Shrimp Stir-Fry", checked: false },
          { id: "i2", name: "bok choy", amount: "1 head", recipe_context: "Garlic Shrimp Stir-Fry", checked: false },
          { id: "i3", name: "chipotle", amount: "2 cans", recipe_context: "Chicken Tinga Tacos", checked: false },
        ],
      },
    ],
  },
];

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
      completionReason?: string;
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
        reason: drive.completionReason ?? null,
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
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
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
          completionReason: "max_iterations",
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
// T9: click "Build list" → calls postGroceryList (not sendMessage), dispatches
//     set_grocery_list, navigates to /grocery
// ---------------------------------------------------------------------------

describe("RecipesScreen — T9: Build list calls postGroceryList and dispatches set_grocery_list", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const navigateToScreenSpy = vi.fn();
  const sendMessageSpy = vi.fn();
  const dispatchSpy = vi.fn();

  beforeEach(() => {
    navigateToScreenSpy.mockClear();
    sendMessageSpy.mockClear();
    dispatchSpy.mockClear();
    vi.mocked(postGroceryList).mockResolvedValue(STORES);
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
      sessionId: "sess-1",
      conversationHistory: [],
      currentScreen: "recipes",
      sendMessage: sendMessageSpy,
      navigateToScreen: navigateToScreenSpy,
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
      dispatch: dispatchSpy,
    });
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(postGroceryList).mockReset();
  });

  it("test_recipes_screen_build_list_calls_post_grocery_list", async () => {
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

    // postGroceryList must be called with the session id and a list of items
    await waitFor(() => {
      expect(vi.mocked(postGroceryList)).toHaveBeenCalledWith("sess-1", expect.any(Array));
    });

    // sendMessage must NOT be called — it was the root cause of the bug
    expect(sendMessageSpy).not.toHaveBeenCalled();

    // navigateToScreen dispatched to context (so GroceryScreen receives correct screen)
    expect(navigateToScreenSpy).toHaveBeenCalledWith("grocery");

    // Reducer must receive set_grocery_list with the stores returned by the endpoint
    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith({
        type: "set_grocery_list",
        stores: STORES,
      } satisfies ScreenAction);
    });

    // Router navigated to /grocery
    await waitFor(() => {
      expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T10: click info on card 2 → InfoSheet opens with card 2 fields
// ---------------------------------------------------------------------------

describe("RecipesScreen — T10: info button triggers getRecipeDetail fetch", () => {
  beforeEach(() => {
    resetRecipeCacheForTests();
    vi.mocked(getRecipeDetail).mockClear();
  });

  it("test_recipes_screen_info_button_calls_get_recipe_detail", async () => {
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

    // RecipeInfoSheet (Phase 3 component) fetches full detail by id.
    // Phase 3 owns assertions about rendered content — here we only verify
    // the call-through with the correct recipe id.
    expect(getRecipeDetail).toHaveBeenCalledWith("r_tacos");
  });
});

// ---------------------------------------------------------------------------
// T11: swap button rendered but disabled
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T12: back button → ConfirmResetDialog → confirm → resetSession + navigate /
// ---------------------------------------------------------------------------

describe("RecipesScreen — T12: confirm reset calls resetSession and navigates home", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const resetSessionSpy = vi.fn();

  beforeEach(() => {
    resetSessionSpy.mockClear();
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: {
        ...initialScreenData,
        recipes: [recipe1],
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
      resetSession: resetSessionSpy,
      addLocalTurn: vi.fn(),
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
      dispatch: vi.fn(),
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("test_recipes_screen_back_confirm_resets_and_navigates_home", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route
            path="/"
            element={<div data-testid="screen-home">Home route</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // Click back button to open the dialog
    const backBtn = screen.getByRole("button", { name: /go back/i });
    await user.click(backBtn);

    // Click "Start over" in the dialog
    const confirmBtn = screen.getByRole("button", { name: /start over/i });
    await user.click(confirmBtn);

    expect(resetSessionSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T13: error retry → sendMessage("retry")
// ---------------------------------------------------------------------------

describe("RecipesScreen — T13: error retry calls sendMessage('retry')", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const sendMessageSpy = vi.fn();

  beforeEach(() => {
    sendMessageSpy.mockClear();
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "error",
      screenData: {
        ...initialScreenData,
        error: "Something went wrong. Please try again.",
      },
      isLoading: false,
      isStreaming: false,
      isComplete: false,
      isError: true,
      sessionId: null,
      conversationHistory: [],
      currentScreen: "recipes",
      sendMessage: sendMessageSpy,
      navigateToScreen: vi.fn(),
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
      dispatch: vi.fn(),
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("test_recipes_screen_error_retry_sends_retry_message", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <RecipesScreen />
      </MemoryRouter>
    );

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    await user.click(retryBtn);

    expect(sendMessageSpy).toHaveBeenCalledWith("retry");
  });
});

// ---------------------------------------------------------------------------
// T14: InfoSheet close button clears infoRecipe
// ---------------------------------------------------------------------------

describe("RecipesScreen — T14: info button fetches correct recipe id", () => {
  beforeEach(() => {
    resetRecipeCacheForTests();
    vi.mocked(getRecipeDetail).mockClear();
  });

  it("test_recipes_screen_info_button_fetches_recipe1_id", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Open the info sheet
    const infoButton = screen.getByRole("button", {
      name: /info about garlic shrimp stir-fry/i,
    });
    await user.click(infoButton);

    // RecipeInfoSheet (Phase 3) handles rendering/close — here we assert the
    // wiring: the recipe id flows through to getRecipeDetail.
    expect(getRecipeDetail).toHaveBeenCalledWith("r_shrimp");
  });
});

// ---------------------------------------------------------------------------
// T15: back button focus restoration after dialog cancel + EN lang toggle
// ---------------------------------------------------------------------------

describe("RecipesScreen — T15: dialog cancel restores back-button focus", () => {
  it("test_recipes_screen_dialog_cancel_focus_restored", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Click EN lang toggle (covers the en setLang arrow function)
    const enButton = screen.getByRole("button", { name: /^EN$/ });
    await user.click(enButton);

    const backBtn = screen.getByRole("button", { name: /go back/i });
    await user.click(backBtn);

    // Cancel the dialog
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    // After dialog closes, focus should return to back button
    expect(document.activeElement).toBe(backBtn);
  });
});

// ---------------------------------------------------------------------------
// T11: swap button — "No alternative" label + disabled when no alternatives
// ---------------------------------------------------------------------------

describe("RecipesScreen — T11: swap button disabled with 'No alternative' label when no alternatives", () => {
  it("card with alternatives renders enabled 'Try another' button", () => {
    const mock = createMockChatService();
    const altA = makeRecipeSummary({ id: "alt_a", name: "Alt A" });
    const withAlts = makeRecipeSummary({
      id: "r_with_alts",
      name: "Has Alts",
      alternatives: [altA],
    });

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [withAlts] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const tryAnotherBtn = screen.getByRole("button", { name: /try another/i });
    expect(tryAnotherBtn).toBeInTheDocument();
    expect(tryAnotherBtn).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: /no alternative/i })).toBeNull();
  });

  it("card with no alternatives renders disabled 'No alternative' button and no 'Try another'", () => {
    const mock = createMockChatService();
    const withoutAlts = makeRecipeSummary({
      id: "r_no_alts",
      name: "No Alts",
      alternatives: [],
    });

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [withoutAlts] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const noAltBtn = screen.getByRole("button", { name: /no alternative/i });
    expect(noAltBtn).toBeInTheDocument();
    expect(noAltBtn).toBeDisabled();
    expect(screen.queryByRole("button", { name: /try another/i })).toBeNull();
  });

  it("clicking disabled 'No alternative' button does NOT open SwapPanel", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    const withoutAlts = makeRecipeSummary({
      id: "r_no_alts",
      name: "No Alts",
      alternatives: [],
    });

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [withoutAlts] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const noAltBtn = screen.getByRole("button", { name: /no alternative/i });
    await user.click(noAltBtn);

    expect(screen.queryByTestId("swap-panel")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-Swap: recipe swap interactions (Phase 6 of issue #56)
// ---------------------------------------------------------------------------

describe("RecipesScreen — swap interactions", () => {
  const alt1A = makeRecipeSummary({
    id: "alt1a",
    name: "Shrimp Lo Mein",
    name_zh: "蝦撈麵",
    cooking_method: "Boil",
    flavor_tags: ["Savory"],
  });
  const alt2A = makeRecipeSummary({
    id: "alt2a",
    name: "Chicken Mole",
    name_zh: "雞肉莫雷",
    cooking_method: "Simmer",
    flavor_tags: ["Rich"],
  });
  const alt2B = makeRecipeSummary({
    id: "alt2b",
    name: "Chicken Quesadilla",
    name_zh: "雞肉乳酪餅",
    cooking_method: "Pan-fry",
    flavor_tags: ["Cheesy"],
  });

  const r1 = makeRecipeSummary({
    id: "r_shrimp",
    name: "Garlic Shrimp Stir-Fry",
    name_zh: "蒜蓉蝦炒",
    alternatives: [alt1A],
  });
  const r2 = makeRecipeSummary({
    id: "r_tacos",
    name: "Chicken Tinga Tacos",
    name_zh: "雞肉墨西哥捲",
    alternatives: [alt2A, alt2B],
  });

  it("test_recipes_screen_swap_opens_panel_for_clicked_card", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(swapButtons[1]);

    const panels = screen.getAllByTestId("swap-panel");
    expect(panels.length).toBe(1);

    expect(screen.getByText("Chicken Mole")).toBeInTheDocument();
    expect(screen.getByText("Chicken Quesadilla")).toBeInTheDocument();
    expect(screen.queryByText("Shrimp Lo Mein")).toBeNull();
  });

  it("test_recipes_screen_swap_select_updates_card_and_auto_closes", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Open swap panel for r2
    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(swapButtons[1]);
    expect(screen.getByTestId("swap-panel")).toBeInTheDocument();

    // Select "Chicken Mole" — panel auto-closes on pick
    await user.click(screen.getByRole("button", { name: /select chicken mole/i }));
    expect(screen.queryByTestId("swap-panel")).toBeNull();

    // Card now shows override "Chicken Mole"; original "Chicken Tinga Tacos" is gone
    expect(screen.getByText("Chicken Mole")).toBeInTheDocument();
    expect(screen.queryByText("Chicken Tinga Tacos")).toBeNull();
  });

  it("test_recipes_screen_swap_lang_toggle_updates_card_and_panel", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(swapButtons[1]);

    const zhButton = screen.getByRole("button", { name: /^中$/ });
    await user.click(zhButton);

    // "雞肉墨西哥捲" appears in both the RecipeCard (original) and SwapPanel (original option)
    expect(screen.getAllByText("雞肉墨西哥捲").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("雞肉莫雷")).toBeInTheDocument();
    expect(screen.getByText("雞肉乳酪餅")).toBeInTheDocument();
  });

  it("test_recipes_screen_fresh_recipes_clears_overrides", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    function Harness() {
      const session = useSessionOptional();
      const [phase, setPhase] = React.useState<1 | 2>(1);

      useEffect(() => {
        if (!session) return;
        session.dispatch({ type: "start_loading" });
        session.dispatch({ type: "start_streaming" });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: r1 },
        });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: r2 },
        });
        session.dispatch({ type: "complete", status: "complete" });
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (!session || phase !== 2) return;
        session.dispatch({ type: "reset" });
        session.dispatch({ type: "start_loading" });
        session.dispatch({ type: "start_streaming" });
        const fresh = makeRecipeSummary({
          id: "r_fresh",
          name: "Fresh Bowl",
          alternatives: [],
        });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: fresh },
        });
        session.dispatch({ type: "complete", status: "complete" });
      }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

      return (
        <>
          <button
            type="button"
            data-testid="advance-phase"
            onClick={() => setPhase(2)}
          >
            advance
          </button>
          <RecipesScreen />
        </>
      );
    }

    renderWithSession(<Harness />, {
      chatService: mock.service,
      initialPath: "/recipes",
    });

    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(swapButtons[1]);
    await user.click(screen.getByRole("button", { name: /select chicken mole/i }));
    // Chicken Mole is now in both card and panel
    expect(screen.getAllByText("Chicken Mole").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByTestId("advance-phase"));

    expect(screen.queryByText("Chicken Mole")).toBeNull();
    expect(screen.queryByText("Chicken Tinga Tacos")).toBeNull();
    expect(screen.getByText("Fresh Bowl")).toBeInTheDocument();
    expect(screen.queryByTestId("swap-panel")).toBeNull();
  });

  it("test_recipes_screen_swap_esc_closes_panel", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    await user.click(swapButtons[1]);

    expect(screen.getByTestId("swap-panel")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("swap-panel")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-Remove: remove a recipe from the list
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Remove: remove recipe", () => {
  it("test_recipes_screen_remove_hides_recipe_from_list", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2, recipe3] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // All 3 cards visible initially
    expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    expect(screen.getByText("Chicken Tinga Tacos")).toBeInTheDocument();
    expect(screen.getByText("Summer Ratatouille")).toBeInTheDocument();

    // Remove recipe1
    await user.click(
      screen.getByRole("button", { name: /remove garlic shrimp stir-fry/i })
    );

    // recipe1 gone; recipe2 and recipe3 remain
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();
    expect(screen.getByText("Chicken Tinga Tacos")).toBeInTheDocument();
    expect(screen.getByText("Summer Ratatouille")).toBeInTheDocument();
  });

  it("test_recipes_screen_remove_two_keeps_cta_enabled", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Remove recipe1 — one recipe remains
    await user.click(
      screen.getByRole("button", { name: /remove garlic shrimp stir-fry/i })
    );

    // recipe2 still shown; CTA still enabled
    expect(screen.getByText("Chicken Tinga Tacos")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: /build list/i });
    expect(cta).not.toBeDisabled();
  });

  it("test_recipes_screen_fresh_session_clears_removed_recipes", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    function HarnessRemove() {
      const session = useSessionOptional();
      const [phase, setPhase] = React.useState<1 | 2>(1);

      useEffect(() => {
        if (!session) return;
        session.dispatch({ type: "start_loading" });
        session.dispatch({ type: "start_streaming" });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: recipe1 },
        });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: recipe2 },
        });
        session.dispatch({ type: "complete", status: "complete" });
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (!session || phase !== 2) return;
        session.dispatch({ type: "reset" });
        session.dispatch({ type: "start_loading" });
        session.dispatch({ type: "start_streaming" });
        session.dispatch({
          type: "receive_event",
          event: {
            event_type: "recipe_card",
            recipe: makeRecipeSummary({ id: "r_fresh2", name: "Fresh Bowl" }),
          },
        });
        session.dispatch({ type: "complete", status: "complete" });
      }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

      return (
        <>
          <button
            type="button"
            data-testid="advance-phase"
            onClick={() => setPhase(2)}
          >
            advance
          </button>
          <RecipesScreen />
        </>
      );
    }

    renderWithSession(<HarnessRemove />, {
      chatService: mock.service,
      initialPath: "/recipes",
    });

    // Remove recipe1
    await user.click(
      screen.getByRole("button", { name: /remove garlic shrimp stir-fry/i })
    );
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();

    // Advance to fresh session
    await user.click(screen.getByTestId("advance-phase"));

    // Fresh Bowl appears; Garlic Shrimp Stir-Fry is gone (still no duplicate)
    expect(screen.getByText("Fresh Bowl")).toBeInTheDocument();
    expect(screen.queryByText("Garlic Shrimp Stir-Fry")).toBeNull();
    expect(screen.queryByText("Chicken Tinga Tacos")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T16: cross-screen integration — "Build list →" → GroceryScreen shows items
//
// This test covers the full connection that was missing and allowed issue #68
// to go undetected. It renders RecipesScreen (complete + recipes) alongside
// GroceryScreen in the same route tree, clicks "Build list →", and asserts
// that GroceryScreen renders grocery items — NOT the empty state.
//
// Would have caught the bug: clicking "Build list →" navigated to GroceryScreen
// but groceryList was always empty because sendMessage() was called instead of
// postGroceryList(), and sendMessage() resets all screenData via start_loading.
// ---------------------------------------------------------------------------

describe("RecipesScreen → GroceryScreen — T16: Build list populates grocery items", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(postGroceryList).mockResolvedValue(STORES);
  });

  afterEach(() => {
    spy?.mockRestore();
    vi.mocked(postGroceryList).mockReset();
  });

  it("test_build_list_populates_grocery_screen_not_empty_state", async () => {
    const user = userEvent.setup();

    // Shared mutable stores populated when handleBuildList calls dispatch.
    // mockImplementation reads from this closure so GroceryScreen sees the
    // data on its first render (after navigation, which happens post-dispatch).
    let currentGroceryList: GroceryStore[] = [];
    const dispatchFn = vi.fn((action: ScreenAction) => {
      if (action.type === "set_grocery_list") {
        currentGroceryList = action.stores;
      }
    });

    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockImplementation(() => ({
      screenState: "complete",
      screenData: {
        ...initialScreenData,
        recipes: [recipe1, recipe2],
        completionStatus: "complete",
        groceryList: currentGroceryList,
      },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: "sess-t16",
      conversationHistory: [],
      currentScreen: "recipes",
      sendMessage: vi.fn(),
      navigateToScreen: vi.fn(),
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
      dispatch: dispatchFn,
    }));

    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/grocery" element={<GroceryScreen />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify initial RecipesScreen state
    expect(screen.getByRole("button", { name: /build list/i })).not.toBeDisabled();

    // Click "Build list →"
    await user.click(screen.getByRole("button", { name: /build list/i }));

    // After postGroceryList resolves:
    //   1. dispatch({ type: "set_grocery_list", stores }) is called → currentGroceryList updated
    //   2. navigate("/grocery") is called → GroceryScreen mounts
    //   3. GroceryScreen reads useSessionOptional() → groceryList: currentGroceryList (populated)
    //   4. GroceryScreen renders items, NOT "No grocery list yet."
    await waitFor(() => {
      expect(screen.getByText("scallion")).toBeInTheDocument();
    });

    // The empty-state message must NOT be visible
    expect(screen.queryByText(/no grocery list yet/i)).toBeNull();

    // Regression guard: sendMessage was NOT called (it would have reset screenData)
    expect(vi.mocked(postGroceryList)).toHaveBeenCalledWith("sess-t16", expect.any(Array));
  });
});

// ---------------------------------------------------------------------------
// T-Toggle-1: clicking an ingredient pill marks it as excluded (visual)
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Toggle-1: clicking ingredient pill visually marks it excluded", () => {
  it("test_ingredient_pill_click_toggles_excluded_visual", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    // recipe1: ingredients[*].name = ["shrimp", "garlic", "scallion", "bok choy"]
    // have flag: lowercased name substring-matched against ingredients_have ["shrimp", "garlic"]
    // "shrimp" appears in ingredients_have → have=true → pill aria-pressed=true (checked/green)
    // after clicking it, exclusion is flipped → aria-pressed=false (unchecked/red)
    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Ingredient pills have aria-pressed. Use getAllByRole + filter to avoid
    // matching the info button ("Info about Garlic Shrimp Stir-Fry").
    const shrimpPill = screen
      .getAllByRole("button", { pressed: true })
      .find((btn) => btn.textContent?.includes("shrimp"));
    expect(shrimpPill).toBeDefined();
    expect(shrimpPill).toHaveAttribute("aria-pressed", "true");

    await user.click(shrimpPill!);

    expect(shrimpPill).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// T-Toggle-2: excluded ingredient is omitted from Build list payload
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Toggle-2: excluded ingredient absent from postGroceryList call", () => {
  beforeEach(() => {
    vi.mocked(postGroceryList).mockResolvedValue(STORES);
  });

  afterEach(() => {
    vi.mocked(postGroceryList).mockReset();
  });

  it("test_excluded_ingredient_not_in_grocery_list", async () => {
    const user = userEvent.setup();

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-toggle",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/grocery" element={<div data-testid="screen-grocery" />} />
        </Routes>
      ),
    });

    // Wait for recipe cards to appear
    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // recipe1 canonical ingredients: scallion and bok choy are NOT in ingredients_have → have=false.
    // Toggle "scallion" off (user says "I have it" → flip have=false → treated as have=true → skip)
    const scallionPill = screen.getByRole("button", { name: /scallion/i });
    await user.click(scallionPill);

    // Build the list
    const cta = screen.getByRole("button", { name: /build list/i });
    expect(cta).not.toBeDisabled();
    await user.click(cta);

    await waitFor(() => {
      expect(vi.mocked(postGroceryList)).toHaveBeenCalledTimes(1);
    });

    const [, items] = vi.mocked(postGroceryList).mock.calls[0];
    const names = items.map((i: { ingredient_name: string }) => i.ingredient_name);

    // "scallion" was toggled off → user claims to have it → should NOT be in the buy list
    expect(names).not.toContain("scallion");
    // "bok choy" was not toggled → still need to buy
    expect(names).toContain("bok choy");
  });
});

// ---------------------------------------------------------------------------
// T-Toggle-3: toggle off then back on — ingredient reappears in Build list
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Toggle-3: toggle off then on restores ingredient in grocery list", () => {
  beforeEach(() => {
    vi.mocked(postGroceryList).mockResolvedValue(STORES);
  });

  afterEach(() => {
    vi.mocked(postGroceryList).mockReset();
  });

  it("test_toggle_off_then_on_restores_ingredient_in_list", async () => {
    const user = userEvent.setup();

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-toggle3",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/grocery" element={<div data-testid="screen-grocery" />} />
        </Routes>
      ),
    });

    // Wait for recipe cards to appear
    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // Toggle "bok choy" off then back on
    const bokChoyPill = screen.getByRole("button", { name: /bok choy/i });
    await user.click(bokChoyPill); // off
    await user.click(bokChoyPill); // back on

    const cta = screen.getByRole("button", { name: /build list/i });
    expect(cta).not.toBeDisabled();
    await user.click(cta);

    await waitFor(() => {
      expect(vi.mocked(postGroceryList)).toHaveBeenCalledTimes(1);
    });

    const [, items] = vi.mocked(postGroceryList).mock.calls[0];
    const names = items.map((i: { ingredient_name: string }) => i.ingredient_name);

    // "bok choy" toggled back on — have=false again → still needs buying
    expect(names).toContain("bok choy");
  });
});

// ---------------------------------------------------------------------------
// T-Toggle-4: fresh recipe list clears exclusions for removed/replaced cards
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Toggle-4: fresh recipe list clears per-card exclusions", () => {
  it("test_fresh_recipes_clears_exclusions", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    function HarnessToggle() {
      const session = useSessionOptional();
      const [phase, setPhase] = React.useState<1 | 2>(1);

      useEffect(() => {
        if (!session) return;
        session.dispatch({ type: "start_loading" });
        session.dispatch({ type: "start_streaming" });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: recipe1 },
        });
        session.dispatch({ type: "complete", status: "complete" });
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (!session || phase !== 2) return;
        session.dispatch({ type: "reset" });
        session.dispatch({ type: "start_loading" });
        session.dispatch({ type: "start_streaming" });
        const freshRecipe = makeRecipeSummary({
          id: "r_fresh2",
          name: "Fresh Noodles",
          ingredients: [
            { name: "scallion", amount: "2 stalks", pcsv: ["veggie"] },
          ],
          ingredients_need: ["scallion"],
          ingredients_have: [],
          alternatives: [],
        });
        session.dispatch({
          type: "receive_event",
          event: { event_type: "recipe_card", recipe: freshRecipe },
        });
        session.dispatch({ type: "complete", status: "complete" });
      }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

      return (
        <>
          <button
            type="button"
            data-testid="advance-toggle-phase"
            onClick={() => setPhase(2)}
          >
            advance
          </button>
          <RecipesScreen />
        </>
      );
    }

    renderWithSession(<HarnessToggle />, {
      chatService: mock.service,
      initialPath: "/recipes",
    });

    // Toggle "scallion" off in the first session (recipe1 canonical ingredients, have=false)
    const scallionPill = screen.getByRole("button", { name: /scallion/i });
    await user.click(scallionPill);
    expect(scallionPill).toHaveAttribute("aria-pressed", "true"); // scallion have=false XOR flipped=true → isChecked=true

    // Advance to a fresh recipe list
    await user.click(screen.getByTestId("advance-toggle-phase"));

    // Fresh Noodles card appears with scallion in canonical ingredients (have=false,
    // not in ingredients_have=[]) — exclusions were reset, so pill is unchecked (aria-pressed=false)
    await waitFor(() => {
      expect(screen.getByText("Fresh Noodles")).toBeInTheDocument();
    });

    const freshScallionPill = screen.getByRole("button", { name: /scallion/i });
    expect(freshScallionPill).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// T-Pill-Source: pill labels come from canonical ingredients[*].name,
// not from ingredients_have / ingredients_need strings.
// have flag is derived by substring-matching the canonical name (lowercased)
// against any entry in ingredients_have (case-insensitive).
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Pill-Source: pills use canonical ingredients[*].name with substring have-flag", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Recipe with mismatched fuzzy strings vs canonical names.
    // ingredients_have contains fuzzy hints ("Jumbo Shrimp", "Fresh Garlic")
    // that do NOT equal the canonical names exactly but do substring-match.
    // ingredients_need contains "Spring Onion" which does NOT match canonical "scallion".
    const mismatchRecipe: RecipeSummary = makeRecipeSummary({
      id: "r_mismatch",
      name: "Mismatch Recipe",
      ingredients: [
        { name: "shrimp", amount: "200g", pcsv: ["protein"] },
        { name: "garlic", amount: "4 cloves", pcsv: ["sauce"] },
        { name: "scallion", amount: "2 stalks", pcsv: ["veggie"] },
      ],
      // Fuzzy hints: "shrimp" and "garlic" appear as substrings of these hints.
      // "scallion" does NOT appear as a substring of "spring onion".
      ingredients_have: ["Jumbo Shrimp", "Fresh Garlic Cloves"],
      ingredients_need: ["Spring Onion"],
      alternatives: [],
    });

    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: {
        ...initialScreenData,
        recipes: [mismatchRecipe],
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
      excludedByCard: {},
      toggleIngredientExclusion: vi.fn(),
      dispatch: vi.fn(),
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("test_pill_labels_come_from_canonical_ingredients_not_fuzzy_strings", () => {
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <RecipesScreen />
      </MemoryRouter>
    );

    // Canonical names are rendered as pills — not the fuzzy hint strings.
    expect(screen.getByRole("button", { name: /^shrimp$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^garlic$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^scallion$/i })).toBeInTheDocument();

    // Fuzzy hint strings must NOT appear as pill labels.
    expect(screen.queryByRole("button", { name: /jumbo shrimp/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /fresh garlic cloves/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /spring onion/i })).toBeNull();
  });

  it("test_have_flag_set_by_substring_match_of_canonical_name_in_ingredients_have", () => {
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <RecipesScreen />
      </MemoryRouter>
    );

    // "shrimp" lowercase is a substring of "Jumbo Shrimp" lowercase → have=true → aria-pressed=true
    const shrimpPill = screen.getByRole("button", { name: /^shrimp$/i });
    expect(shrimpPill).toHaveAttribute("aria-pressed", "true");

    // "garlic" lowercase is a substring of "Fresh Garlic Cloves" lowercase → have=true → aria-pressed=true
    const garlicPill = screen.getByRole("button", { name: /^garlic$/i });
    expect(garlicPill).toHaveAttribute("aria-pressed", "true");

    // "scallion" lowercase is NOT a substring of "Spring Onion" lowercase → have=false → aria-pressed=false
    const scallionPill = screen.getByRole("button", { name: /^scallion$/i });
    expect(scallionPill).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// T17: "Save meal plan" button renders when recipes are present
// ---------------------------------------------------------------------------

describe("RecipesScreen — T17: Save meal plan button renders when recipes present", () => {
  it("test_recipes_screen_save_meal_plan_button_renders_with_recipes", () => {
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1, recipe2] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    expect(
      screen.getByRole("button", { name: /save meal plan/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T18: click "Save meal plan" → calls saveMealPlan("My Meal Plan", sessionId)
// ---------------------------------------------------------------------------

describe("RecipesScreen — T18: Save meal plan calls saveMealPlan with correct args", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockResolvedValue({
      id: "plan-42",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-14T00:00:00Z",
      updated_at: "2026-04-14T00:00:00Z",
    });
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: { ...initialScreenData, recipes: [recipe1], completionStatus: "complete" },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: "sess-plan-1",
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
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
  });

  it("test_recipes_screen_save_meal_plan_calls_api_with_name_and_session", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /save meal plan/i }));

    await waitFor(() => {
      expect(vi.mocked(saveMealPlan)).toHaveBeenCalledWith("My Meal Plan", "sess-plan-1");
    });
  });
});

// ---------------------------------------------------------------------------
// T19: success → navigates to /saved/plan/:id
// ---------------------------------------------------------------------------

describe("RecipesScreen — T19: Save meal plan success navigates to /saved/plan/:id", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockResolvedValue({
      id: "plan-42",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-14T00:00:00Z",
      updated_at: "2026-04-14T00:00:00Z",
    });
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: { ...initialScreenData, recipes: [recipe1], completionStatus: "complete" },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: "sess-plan-1",
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
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
  });

  it("test_recipes_screen_save_meal_plan_navigates_to_saved_plan", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /save meal plan/i }));

    await waitFor(() => {
      expect(screen.getByTestId("saved-plan-screen")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T20: failure → error banner shown, does NOT navigate
// ---------------------------------------------------------------------------

describe("RecipesScreen — T20: Save meal plan failure shows error banner", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockRejectedValue(new Error("Server error"));
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: { ...initialScreenData, recipes: [recipe1], completionStatus: "complete" },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: "sess-plan-1",
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
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
  });

  it("test_recipes_screen_save_meal_plan_failure_shows_banner_no_navigate", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /save meal plan/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't save your meal plan/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("saved-plan-screen")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T21: button disabled while save in flight and while streaming
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T-SwapClear-1: picking a different alternative clears that card's exclusions
// T-SwapClear-2: restoring the original recipe (same id) does NOT clear exclusions
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-SwapClear: swap to different recipe clears exclusions; restore preserves them", () => {
  const altSwap = makeRecipeSummary({
    id: "alt_swap",
    name: "Swap Alt Recipe",
    name_zh: "替換菜",
    cooking_method: "Boil",
    flavor_tags: ["Mild"],
    ingredients: [
      { name: "tofu", amount: "300g", pcsv: ["protein"] },
    ],
    ingredients_have: ["tofu"],
    ingredients_need: [],
    alternatives: [],
  });

  const recipeWithAlt = makeRecipeSummary({
    id: "r_with_alt",
    name: "Original Recipe",
    name_zh: "原始菜",
    cooking_method: "Stir-fry",
    flavor_tags: ["Savory"],
    ingredients: [
      { name: "shrimp", amount: "200g", pcsv: ["protein"] },
      { name: "bok choy", amount: "1 head", pcsv: ["veggie"] },
    ],
    ingredients_have: ["shrimp"],
    ingredients_need: ["bok choy"],
    alternatives: [altSwap],
  });

  it("test_swap_to_different_recipe_clears_exclusions_for_that_card", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipeWithAlt] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Toggle "bok choy" pill to mark it as excluded (have=false → click → excluded=true → aria-pressed=true)
    const bokChoyPill = screen.getByRole("button", { name: /bok choy/i });
    await user.click(bokChoyPill);
    expect(bokChoyPill).toHaveAttribute("aria-pressed", "true");

    // Open swap panel and select a different alternative
    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);
    await user.click(screen.getByRole("button", { name: /select swap alt recipe/i }));

    // Card now shows the alt recipe's ingredient "tofu" — not "bok choy"
    // The exclusion for card slot "r_with_alt" must be cleared.
    // Verify by restoring original: open swap panel, select original (same id)
    // then check bok choy pill is back to aria-pressed=false (not excluded)
    const swapBtnAfter = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtnAfter);
    // Select original recipe (restore) — original id = "r_with_alt"
    await user.click(screen.getByRole("button", { name: /select original recipe/i }));

    // Bok choy pill must be unchecked — exclusion was cleared by the earlier different-recipe swap
    const bokChoyPillAfterRestore = screen.getByRole("button", { name: /bok choy/i });
    expect(bokChoyPillAfterRestore).toHaveAttribute("aria-pressed", "false");
  });

  it("test_restore_same_recipe_does_not_clear_exclusions", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipeWithAlt] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    // Toggle "bok choy" pill to mark it as excluded
    const bokChoyPill = screen.getByRole("button", { name: /bok choy/i });
    await user.click(bokChoyPill);
    expect(bokChoyPill).toHaveAttribute("aria-pressed", "true");

    // Open swap panel and re-select the original recipe (same id = restore path)
    const swapBtn = screen.getByRole("button", { name: /try another/i });
    await user.click(swapBtn);
    await user.click(screen.getByRole("button", { name: /select original recipe/i }));

    // Exclusions must still be present: bok choy still excluded → aria-pressed=true
    const bokChoyPillAfter = screen.getByRole("button", { name: /bok choy/i });
    expect(bokChoyPillAfter).toHaveAttribute("aria-pressed", "true");
  });
});

// ---------------------------------------------------------------------------
describe("RecipesScreen — T21: Save meal plan button disabled while in-flight or streaming", () => {
  it("test_recipes_screen_save_meal_plan_disabled_while_streaming", () => {
    const mock = createMockChatService();

    renderWithSession(
      <RecipesWith drive={{ kind: "streaming", recipes: [recipe1] }} />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    expect(
      screen.getByRole("button", { name: /save meal plan/i })
    ).toBeDisabled();
  });

  it("test_recipes_screen_save_meal_plan_disabled_while_saving", async () => {
    let resolvePromise!: (v: import("@/types/api").SavedMealPlan) => void;
    vi.mocked(saveMealPlan).mockReturnValue(
      new Promise((res) => { resolvePromise = res; })
    );

    const spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: { ...initialScreenData, recipes: [recipe1], completionStatus: "complete" },
      isLoading: false,
      isStreaming: false,
      isComplete: true,
      isError: false,
      sessionId: "sess-plan-1",
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

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <RecipesScreen />
      </MemoryRouter>
    );

    const btn = screen.getByRole("button", { name: /save meal plan/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /saving/i })
      ).toBeDisabled();
    });

    resolvePromise({
      id: "plan-42",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-14T00:00:00Z",
      updated_at: "2026-04-14T00:00:00Z",
    });

    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
  });
});

// ---------------------------------------------------------------------------
// T17: pill exclusion state persists across navigation to GroceryScreen and back
// ---------------------------------------------------------------------------
//
// This is the UAT regression test for issue #69.
// RecipesScreen previously held `excludedByCard` in component-local useState,
// which was lost when React-Router unmounted the component on navigation.
// After the fix, `excludedByCard` lives in SessionContext and survives navigation.

describe("RecipesScreen — T17: pill exclusion persists through navigation round-trip", () => {
  it("excluded ingredient pill stays excluded after navigating to /grocery and back", async () => {
    const user = userEvent.setup();

    vi.mocked(postGroceryList).mockResolvedValueOnce(STORES);

    // Render the full route tree: /recipes + /grocery
    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-t17",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={
              <RecipesWith
                drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
              />
            }
          />
          <Route path="/grocery" element={<GroceryScreen />} />
        </Routes>
      ),
    });

    // Wait for recipe cards to appear (useEffect in RecipesWith fires async)
    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // "scallion" is a "need" ingredient (not in ingredients_have), so initially
    // have=false, isFlipped=false → isChecked=false → aria-pressed="false".
    const scallionButton = await screen.findByRole("button", { name: /scallion/i });
    expect(scallionButton).toHaveAttribute("aria-pressed", "false");

    // Toggle the pill to exclude "scallion"
    await user.click(scallionButton);
    expect(scallionButton).toHaveAttribute("aria-pressed", "true");

    // Wait for "Build list →" to be enabled (complete state)
    const buildBtn = await screen.findByRole("button", { name: /build list/i });
    expect(buildBtn).not.toBeDisabled();

    // Click "Build list →" — this calls postGroceryList then navigates to /grocery
    await user.click(buildBtn);

    // Wait for GroceryScreen to appear (RecipesScreen unmounts)
    await waitFor(() => {
      expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
    });

    // Navigate back to /recipes via the GroceryScreen back button (navigate(-1))
    const backBtn = screen.getByRole("button", { name: /go back/i });
    await user.click(backBtn);

    // Wait for RecipesScreen to remount and cards to render
    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // The excluded pill must still show excluded state — context survived navigation
    const scallionButtonAfterReturn = screen.getByRole("button", { name: /scallion/i });
    expect(scallionButtonAfterReturn).toHaveAttribute("aria-pressed", "true");
  });
});
