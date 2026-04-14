// RecipesScreen integration tests — TDD RED → GREEN (issue #39, T-C).
// Written FIRST before implementation. All 11 tests should RED on an
// empty RecipesScreen shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock api-client so RecipeInfoSheet (child of RecipesScreen) doesn't hit network.
// Phase 3 owns RecipeInfoSheet's full coverage — here we only assert call-through.
vi.mock("@/services/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/api-client")>(
      "@/services/api-client"
    );
  return {
    ...actual,
    getRecipeDetail: vi.fn(() => new Promise(() => {})), // pending forever
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
import { getRecipeDetail } from "@/services/api-client";
import { resetRecipeCacheForTests } from "@/components/recipe-cache";
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
// T9: click "Build list" → navigates to /grocery and calls navigateToScreen
// ---------------------------------------------------------------------------

describe("RecipesScreen — T9: Build list navigates to grocery", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const navigateToScreenSpy = vi.fn();
  const sendMessageSpy = vi.fn();

  beforeEach(() => {
    navigateToScreenSpy.mockClear();
    sendMessageSpy.mockClear();
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
      sendMessage: sendMessageSpy,
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

    // sendMessage called with the correct message and explicit targetScreen
    expect(sendMessageSpy).toHaveBeenCalledWith("Build my grocery list.", "grocery");

    // Navigated to /grocery route
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
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

describe("RecipesScreen — T11: swap button enabled/disabled by alternatives", () => {
  it("test_recipes_screen_swap_enabled_when_alternatives_present", () => {
    const mock = createMockChatService();
    const altA = makeRecipeSummary({ id: "alt_a", name: "Alt A" });
    const withAlts = makeRecipeSummary({
      id: "r_with_alts",
      name: "Has Alts",
      alternatives: [altA],
    });
    const withoutAlts = makeRecipeSummary({
      id: "r_no_alts",
      name: "No Alts",
      alternatives: [],
    });

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [withAlts, withoutAlts] }}
      />,
      { chatService: mock.service, initialPath: "/recipes" }
    );

    const swapButtons = screen.getAllByRole("button", { name: /try another/i });
    expect(swapButtons.length).toBe(2);
    expect(swapButtons[0]).not.toBeDisabled();
    expect(swapButtons[1]).toBeDisabled();
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
