// RecipesScreen integration tests — TDD RED → GREEN (issue #39, T-C).
// Migrated from vi.mock("@/services/api-client") + vi.spyOn(sessionContextModule)
// to MSW-based behavioral testing (issue #91).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
import { Routes, Route } from "react-router";
import { http, HttpResponse } from "msw";

import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { resetRecipeCacheForTests } from "@/components/recipe-cache";
import { renderWithSession } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import { server } from "@/test/msw/server";
import { makeSseStream, toSseSpecs } from "@/test/msw/sse";
import { EVENT_THINKING_ANALYZING, EVENT_DONE_COMPLETE } from "@/test/fixtures/sse-sequences";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import type { RecipeSummary } from "@/types/tools";
import type { GroceryStore } from "@/types/sse";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = "http://localhost:8000";
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
const STUB_TIMESTAMP = "2026-04-14T00:00:00Z";

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

// Stores returned by the MSW grocery-list endpoint (T9, T16).
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
    renderWithSession(<RecipesWith drive={{ kind: "idle" }} />, {
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
    renderWithSession(<RecipesWith drive={{ kind: "loading" }} />, {
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
    renderWithSession(
      <RecipesWith
        drive={{ kind: "streaming", recipes: [recipe1, recipe2] }}
      />,
      { initialPath: "/recipes" }
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
    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2, recipe3] }}
      />,
      { initialPath: "/recipes" }
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
    renderWithSession(<RecipesWith drive={{ kind: "error" }} />, {
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

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { initialPath: "/recipes" }
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
  it("test_recipes_screen_complete_empty_shows_empty_state", () => {
    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [] }} />,
      { initialPath: "/recipes" },
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
    renderWithSession(
      <RecipesWith
        drive={{
          kind: "complete",
          recipes: [recipe1, recipe2],
          completionStatus: "partial",
          completionReason: "max_iterations",
        }}
      />,
      { initialPath: "/recipes" }
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
  it("test_recipes_screen_build_list_calls_post_grocery_list", async () => {
    const user = userEvent.setup();

    let capturedGroceryBody: unknown = null;
    let chatCalled = false;
    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, async ({ request }) => {
        capturedGroceryBody = await request.json();
        return HttpResponse.json(STORES);
      }),
      http.post(`${BASE}/session/:sessionId/chat`, () => {
        chatCalled = true;
        return new HttpResponse(
          makeSseStream(toSseSpecs([EVENT_THINKING_ANALYZING, EVENT_DONE_COMPLETE])),
          { status: 200, headers: SSE_HEADERS },
        );
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-1",
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

    const cta = screen.getByRole("button", { name: /build list/i });
    await user.click(cta);

    // postGroceryList must be called with items (body contains { items: [...] })
    await waitFor(() => {
      expect(capturedGroceryBody).not.toBeNull();
    });
    expect(
      (capturedGroceryBody as Record<string, unknown>).items
    ).toBeInstanceOf(Array);

    // sendMessage must NOT be called — it was the root cause of the bug
    expect(chatCalled).toBe(false);

    // GroceryScreen renders items (proves navigation + dispatch happened)
    await waitFor(() => {
      expect(screen.getByText("scallion")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T10: click info on card 2 → InfoSheet opens with card 2 fields
// ---------------------------------------------------------------------------

describe("RecipesScreen — T10: info button triggers getRecipeDetail fetch", () => {
  beforeEach(() => {
    resetRecipeCacheForTests();
  });

  it("test_recipes_screen_info_button_calls_get_recipe_detail", async () => {
    const user = userEvent.setup();

    let capturedRecipeId: string | null = null;
    server.use(
      http.get(`${BASE}/recipe/:id`, ({ params }) => {
        capturedRecipeId = params.id as string;
        return HttpResponse.json({
          id: "r_tacos",
          name: "Chicken Tinga Tacos",
          name_zh: "雞肉墨西哥捲",
          source: "KB",
          source_url: "",
          cuisine: "Mexican",
          cooking_method: "Braise",
          effort_level: "medium",
          time_minutes: 35,
          flavor_tags: ["Smoky", "Spicy"],
          serves: 2,
          ingredients: [],
          instructions: "",
          is_ai_generated: false,
        });
      }),
    );

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { initialPath: "/recipes" }
    );

    // Click the info button on card 2
    const infoButton = screen.getByRole("button", {
      name: /info about chicken tinga tacos/i,
    });
    await user.click(infoButton);

    // RecipeInfoSheet (Phase 3 component) fetches full detail by id.
    await waitFor(() => {
      expect(capturedRecipeId).toBe("r_tacos");
    });
  });
});

// ---------------------------------------------------------------------------
// T11: swap button rendered but disabled
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T12: back button → ConfirmResetDialog → confirm → resetSession + navigate /
// ---------------------------------------------------------------------------

describe("RecipesScreen — T12: confirm reset calls resetSession and navigates home", () => {
  it("test_recipes_screen_back_confirm_resets_and_navigates_home", async () => {
    const user = userEvent.setup();

    renderWithSession(<></>, {
      initialPath: "/recipes",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={
              <RecipesWith
                drive={{ kind: "complete", recipes: [recipe1] }}
              />
            }
          />
          <Route
            path="/"
            element={<div data-testid="screen-home">Home route</div>}
          />
        </Routes>
      ),
    });

    // Click back button to open the dialog
    const backBtn = screen.getByRole("button", { name: /go back/i });
    await user.click(backBtn);

    // Click "Start over" in the dialog
    const confirmBtn = screen.getByRole("button", { name: /start over/i });
    await user.click(confirmBtn);

    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T13: error retry → sendMessage("retry")
// ---------------------------------------------------------------------------

describe("RecipesScreen — T13: error retry calls sendMessage('retry')", () => {
  it("test_recipes_screen_error_retry_sends_retry_message", async () => {
    const user = userEvent.setup();

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/session/:sessionId/chat`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(
          makeSseStream(toSseSpecs([EVENT_THINKING_ANALYZING, EVENT_DONE_COMPLETE])),
          { status: 200, headers: SSE_HEADERS },
        );
      }),
    );

    renderWithSession(<RecipesWith drive={{ kind: "error" }} />, {
      initialPath: "/recipes",
    });

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody!.message).toBe("retry");
  });
});

// ---------------------------------------------------------------------------
// T14: InfoSheet close button clears infoRecipe
// ---------------------------------------------------------------------------

describe("RecipesScreen — T14: info button fetches correct recipe id", () => {
  beforeEach(() => {
    resetRecipeCacheForTests();
  });

  it("test_recipes_screen_info_button_fetches_recipe1_id", async () => {
    const user = userEvent.setup();

    let capturedRecipeId: string | null = null;
    server.use(
      http.get(`${BASE}/recipe/:id`, ({ params }) => {
        capturedRecipeId = params.id as string;
        return HttpResponse.json({
          id: "r_shrimp",
          name: "Garlic Shrimp Stir-Fry",
          name_zh: "蒜蓉蝦炒",
          source: "KB",
          source_url: "",
          cuisine: "Chinese",
          cooking_method: "Stir-fry",
          effort_level: "quick",
          time_minutes: 20,
          flavor_tags: ["Savory", "Garlicky"],
          serves: 2,
          ingredients: [],
          instructions: "",
          is_ai_generated: false,
        });
      }),
    );

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { initialPath: "/recipes" }
    );

    // Open the info sheet
    const infoButton = screen.getByRole("button", {
      name: /info about garlic shrimp stir-fry/i,
    });
    await user.click(infoButton);

    // RecipeInfoSheet (Phase 3) handles rendering/close — here we assert the
    // wiring: the recipe id flows through to getRecipeDetail.
    await waitFor(() => {
      expect(capturedRecipeId).toBe("r_shrimp");
    });
  });
});

// ---------------------------------------------------------------------------
// T15: back button focus restoration after dialog cancel + EN lang toggle
// ---------------------------------------------------------------------------

describe("RecipesScreen — T15: dialog cancel restores back-button focus", () => {
  it("test_recipes_screen_dialog_cancel_focus_restored", async () => {
    const user = userEvent.setup();

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { initialPath: "/recipes" }
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
      { initialPath: "/recipes" }
    );

    const tryAnotherBtn = screen.getByRole("button", { name: /try another/i });
    expect(tryAnotherBtn).toBeInTheDocument();
    expect(tryAnotherBtn).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: /no alternative/i })).toBeNull();
  });

  it("card with no alternatives renders disabled 'No alternative' button and no 'Try another'", () => {
    const withoutAlts = makeRecipeSummary({
      id: "r_no_alts",
      name: "No Alts",
      alternatives: [],
    });

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [withoutAlts] }}
      />,
      { initialPath: "/recipes" }
    );

    const noAltBtn = screen.getByRole("button", { name: /no alternative/i });
    expect(noAltBtn).toBeInTheDocument();
    expect(noAltBtn).toBeDisabled();
    expect(screen.queryByRole("button", { name: /try another/i })).toBeNull();
  });

  it("clicking disabled 'No alternative' button does NOT open SwapPanel", async () => {
    const user = userEvent.setup();
    const withoutAlts = makeRecipeSummary({
      id: "r_no_alts",
      name: "No Alts",
      alternatives: [],
    });

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [withoutAlts] }}
      />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [r1, r2] }} />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2, recipe3] }}
      />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith
        drive={{ kind: "complete", recipes: [recipe1, recipe2] }}
      />,
      { initialPath: "/recipes" }
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
  it("test_build_list_populates_grocery_screen_not_empty_state", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, () => {
        return HttpResponse.json(STORES);
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-t16",
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

    // Verify initial RecipesScreen state
    expect(screen.getByRole("button", { name: /build list/i })).not.toBeDisabled();

    // Click "Build list →"
    await user.click(screen.getByRole("button", { name: /build list/i }));

    // After postGroceryList resolves:
    //   1. dispatch({ type: "set_grocery_list", stores }) is called
    //   2. navigate("/grocery") is called → GroceryScreen mounts
    //   3. GroceryScreen reads session context → groceryList (populated)
    //   4. GroceryScreen renders items, NOT "No grocery list yet."
    await waitFor(() => {
      expect(screen.getByText("scallion")).toBeInTheDocument();
    });

    // The empty-state message must NOT be visible
    expect(screen.queryByText(/no grocery list yet/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-Toggle-1: clicking an ingredient pill marks it as excluded (visual)
// ---------------------------------------------------------------------------

describe("RecipesScreen — T-Toggle-1: clicking ingredient pill visually marks it excluded", () => {
  it("test_ingredient_pill_click_toggles_excluded_visual", async () => {
    const user = userEvent.setup();

    // recipe1: ingredients[*].name = ["shrimp", "garlic", "scallion", "bok choy"]
    // have flag: lowercased name substring-matched against ingredients_have ["shrimp", "garlic"]
    // "shrimp" appears in ingredients_have → have=true → pill aria-pressed=true (checked/green)
    // after clicking it, exclusion is flipped → aria-pressed=false (unchecked/red)
    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { initialPath: "/recipes" }
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
  it("test_excluded_ingredient_not_in_grocery_list", async () => {
    const user = userEvent.setup();

    let capturedItems: unknown[] | null = null;
    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        capturedItems = body.items as unknown[];
        return HttpResponse.json(STORES);
      }),
    );

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
      expect(capturedItems).not.toBeNull();
    });

    const names = (capturedItems as unknown as { ingredient_name: string }[]).map(
      (i) => i.ingredient_name
    );

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
  it("test_toggle_off_then_on_restores_ingredient_in_list", async () => {
    const user = userEvent.setup();

    let capturedItems: unknown[] | null = null;
    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        capturedItems = body.items as unknown[];
        return HttpResponse.json(STORES);
      }),
    );

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
      expect(capturedItems).not.toBeNull();
    });

    const names = (capturedItems as unknown as { ingredient_name: string }[]).map(
      (i) => i.ingredient_name
    );

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
  // Recipe with mismatched fuzzy strings vs canonical names.
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

  it("test_pill_labels_come_from_canonical_ingredients_not_fuzzy_strings", () => {
    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [mismatchRecipe] }} />,
      { initialPath: "/recipes" },
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
    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [mismatchRecipe] }} />,
      { initialPath: "/recipes" },
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
    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1, recipe2] }} />,
      { initialPath: "/recipes" }
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
  it("test_recipes_screen_save_meal_plan_calls_api_with_name_and_session", async () => {
    const user = userEvent.setup();

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/saved/meal-plans`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "plan-42",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-plan-1",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      ),
    });

    await user.click(screen.getByRole("button", { name: /save meal plan/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody!.name).toBe("My Meal Plan");
    expect(capturedBody!.session_id).toBe("sess-plan-1");
  });
});

// ---------------------------------------------------------------------------
// T19: success → navigates to /saved/plan/:id
// ---------------------------------------------------------------------------

describe("RecipesScreen — T19: Save meal plan success navigates to /saved/plan/:id", () => {
  it("test_recipes_screen_save_meal_plan_navigates_to_saved_plan", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/saved/meal-plans`, () => {
        return HttpResponse.json({
          id: "plan-42",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-plan-1",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      ),
    });

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
  it("test_recipes_screen_save_meal_plan_failure_shows_banner_no_navigate", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/saved/meal-plans`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-plan-1",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      ),
    });

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

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipeWithAlt] }} />,
      { initialPath: "/recipes" }
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

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipeWithAlt] }} />,
      { initialPath: "/recipes" }
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
    renderWithSession(
      <RecipesWith drive={{ kind: "streaming", recipes: [recipe1] }} />,
      { initialPath: "/recipes" }
    );

    expect(
      screen.getByRole("button", { name: /save meal plan/i })
    ).toBeDisabled();
  });

  it("test_recipes_screen_save_meal_plan_disabled_while_saving", async () => {
    let resolveSave: (() => void) | null = null;
    server.use(
      http.post(`${BASE}/saved/meal-plans`, async () => {
        await new Promise<void>((r) => { resolveSave = r; });
        return HttpResponse.json({
          id: "plan-42",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    const user = userEvent.setup();

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-plan-1",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/saved/plan/:id" element={<div data-testid="saved-plan-screen" />} />
        </Routes>
      ),
    });

    const btn = screen.getByRole("button", { name: /save meal plan/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /saving/i })
      ).toBeDisabled();
    });

    // Resolve the deferred save to clean up
    if (resolveSave) (resolveSave as () => void)();
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

describe("RecipesScreen — T-PillNav: pill exclusion persists through navigation round-trip", () => {
  it("excluded ingredient pill stays excluded after navigating to /grocery and back", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, () => {
        return HttpResponse.json(STORES);
      }),
    );

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

// ---------------------------------------------------------------------------
// PR #74 regression tests (issue #91)
//
// PR #74 shipped 499/499 green tests with 4 user-visible bugs because tests
// asserted implementation details instead of user-observable outcomes.
// These dedicated regression tests verify each bug at the behavioral level.
// ---------------------------------------------------------------------------

describe("PR #74 regressions", () => {
  // R1: "Try another" was disabled on ALL cards because swapDisabled was
  // hardcoded. The fix: button text + disabled state derive from alternatives[].
  it("R1: cards with alternatives show 'Try another' (enabled); cards without show 'No alternative' (disabled)", () => {
    const withAlts = makeRecipeSummary({
      id: "r_with",
      name: "With Alternatives",
      alternatives: [makeRecipeSummary({ id: "alt1", name: "Alt 1" })],
    });
    const withoutAlts = makeRecipeSummary({
      id: "r_without",
      name: "Without Alternatives",
      alternatives: [],
    });

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [withAlts, withoutAlts] }} />,
      { initialPath: "/recipes" },
    );

    // Card with alternatives: "Try another" enabled, accessible by name
    const tryBtn = screen.getByRole("button", { name: /try another/i });
    expect(tryBtn).not.toBeDisabled();

    // Card without alternatives: "No alternative" disabled, accessible by name
    const noAltBtn = screen.getByRole("button", { name: /no alternative/i });
    expect(noAltBtn).toBeDisabled();
  });

  // R2: Toggling a pill off then clicking "Build list" should exclude that
  // ingredient from the POST body. Previously tests asserted on spy call args;
  // now we capture the real MSW request body.
  it("R2: toggled-off pill is absent from MSW grocery-list POST body", async () => {
    const user = userEvent.setup();
    let capturedBody: { items: Array<{ ingredient_name: string }> } | null = null;

    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, async ({ request }) => {
        capturedBody = (await request.json()) as { items: Array<{ ingredient_name: string }> };
        return HttpResponse.json(STORES);
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-r2",
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

    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // Toggle "scallion" pill (need → toggle → excluded)
    await user.click(screen.getByRole("button", { name: /scallion/i }));

    // Click "Build list"
    await user.click(screen.getByRole("button", { name: /build list/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    const names = capturedBody!.items.map((i) => i.ingredient_name);
    // "scallion" excluded by pill toggle — must be absent
    expect(names).not.toContain("scallion");
    // Other need ingredients still present
    expect(names).toContain("bok choy");
  });

  // R3: Pill exclusion state must survive Recipes → Grocery → back → Recipes.
  // PR #74 moved excludedByCard from component-local state to SessionContext.
  it("R3: pill exclusion persists through Recipes → Grocery → back → Recipes", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/session/:sessionId/grocery-list`, () => {
        return HttpResponse.json(STORES);
      }),
    );

    renderWithSession(<></>, {
      initialPath: "/recipes",
      initialSessionId: "sess-r3",
      routes: (
        <Routes>
          <Route
            path="/recipes"
            element={<RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />}
          />
          <Route path="/grocery" element={<GroceryScreen />} />
        </Routes>
      ),
    });

    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // Toggle "bok choy" pill
    const bokChoyPill = screen.getByRole("button", { name: /bok choy/i });
    await user.click(bokChoyPill);
    expect(bokChoyPill).toHaveAttribute("aria-pressed", "true");

    // Navigate to grocery via "Build list"
    await user.click(screen.getByRole("button", { name: /build list/i }));
    await waitFor(() => {
      expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
    });

    // Navigate back
    await user.click(screen.getByRole("button", { name: /go back/i }));
    await waitFor(() => {
      expect(screen.getByText("Garlic Shrimp Stir-Fry")).toBeInTheDocument();
    });

    // Pill exclusion must survive the round-trip
    const bokChoyPillAfter = screen.getByRole("button", { name: /bok choy/i });
    expect(bokChoyPillAfter).toHaveAttribute("aria-pressed", "true");
  });

  // R4: Instruction block line wrapping.
  // jsdom does not compute CSS layout, so we cannot verify visual wrapping.
  // This test verifies that multi-line instruction text renders correctly
  // (whitespace-pre-line preserves newlines in the source text).
  // TODO: requires Playwright for visual layout assertion (line overflow, scrolling)
  it("R4: instruction text with newlines renders in info sheet (visual wrapping needs Playwright)", async () => {
    const user = userEvent.setup();
    resetRecipeCacheForTests();

    const multiLineInstructions =
      "1. Heat oil in a wok over high heat.\n" +
      "2. Add shrimp and cook until pink, about 2 minutes.\n" +
      "3. Add garlic, scallion, and bok choy. Stir-fry for 1 minute.";

    server.use(
      http.get(`${BASE}/recipe/:id`, () => {
        return HttpResponse.json({
          id: "r_shrimp",
          name: "Garlic Shrimp Stir-Fry",
          name_zh: "蒜蓉蝦炒",
          source: "KB",
          source_url: "",
          cuisine: "Chinese",
          cooking_method: "Stir-fry",
          effort_level: "quick",
          time_minutes: 20,
          flavor_tags: ["Savory", "Garlicky"],
          serves: 2,
          ingredients: [
            { name: "shrimp", amount: "200g", pcsv: ["protein"] },
            { name: "garlic", amount: "4 cloves", pcsv: ["sauce"] },
          ],
          instructions: multiLineInstructions,
          is_ai_generated: false,
        });
      }),
    );

    renderWithSession(
      <RecipesWith drive={{ kind: "complete", recipes: [recipe1] }} />,
      { initialPath: "/recipes" },
    );

    // Open info sheet
    const infoBtn = screen.getByRole("button", { name: /info about garlic shrimp stir-fry/i });
    await user.click(infoBtn);

    // Instruction text renders
    await waitFor(() => {
      expect(screen.getByText(/Heat oil in a wok/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Add shrimp and cook until pink/)).toBeInTheDocument();
    expect(screen.getByText(/Add garlic, scallion, and bok choy/)).toBeInTheDocument();
  });
});
