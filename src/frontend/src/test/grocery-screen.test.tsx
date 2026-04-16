// GroceryScreen integration tests — MSW behavioral testing (issue #91, B3).
//
// Migrated from vi.mock("@/services/api-client") to MSW handlers.
// All assertions use visible DOM (getByRole, findByText) and MSW request
// capture — no component props, internal state, or vi.mock().toHaveBeenCalledWith().

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { Routes, Route } from "react-router";
import { http, HttpResponse } from "msw";

import { GroceryScreen } from "@/screens/GroceryScreen";
import { renderWithSession } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import { server } from "@/test/msw/server";
import { makeSseStream, toSseSpecs } from "@/test/msw/sse";
import {
  EVENT_THINKING_ANALYZING,
  EVENT_DONE_COMPLETE,
} from "@/test/fixtures/sse-sequences";
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
const STUB_TIMESTAMP = "2026-04-13T00:00:00Z";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STORES: GroceryStore[] = [
  {
    store_name: "Save-On-Foods",
    departments: [
      {
        name: "Meat & Seafood",
        items: [
          { id: "i1", name: "chicken breast", amount: "500g", recipe_context: "Stir Fry", checked: false },
          { id: "i2", name: "broccoli", amount: "1 head", recipe_context: "", checked: false },
        ],
      },
    ],
  },
  {
    store_name: "Costco",
    departments: [
      {
        name: "Bulk",
        items: [
          { id: "i3", name: "olive oil", amount: "3L", recipe_context: "", checked: false },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Drive helper — dispatches session events to put GroceryScreen in a target state
// ---------------------------------------------------------------------------

type DriveKind =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "streaming"; stores: GroceryStore[] }
  | { kind: "complete"; stores: GroceryStore[] }
  | { kind: "error" };

function GroceryWith({ drive }: { drive: DriveKind }) {
  const session = useSessionOptional();
  useEffect(() => {
    if (!session || drive.kind === "idle") return;
    session.dispatch({ type: "start_loading" });
    if (drive.kind === "loading") return;
    session.dispatch({ type: "start_streaming" });
    if (drive.kind === "streaming") {
      session.dispatch({
        type: "receive_event",
        event: { event_type: "grocery_list", stores: drive.stores },
      });
      return;
    }
    if (drive.kind === "complete") {
      session.dispatch({
        type: "receive_event",
        event: { event_type: "grocery_list", stores: drive.stores },
      });
      session.dispatch({ type: "complete", status: "complete" });
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
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <GroceryScreen />;
}

// ---------------------------------------------------------------------------
// Render helper for tests that need routing (save → navigate)
// ---------------------------------------------------------------------------

function renderGroceryWithRoutes(
  drive: DriveKind,
  options?: { initialSessionId?: string },
) {
  return renderWithSession(<></>, {
    initialPath: "/grocery",
    initialSessionId: options?.initialSessionId,
    routes: (
      <Routes>
        <Route
          path="/grocery"
          element={<GroceryWith drive={drive} />}
        />
        <Route
          path="/saved/list/:id"
          element={<div data-testid="saved-list-screen" />}
        />
      </Routes>
    ),
  });
}

// ---------------------------------------------------------------------------
// T1: idle → empty state
// ---------------------------------------------------------------------------

describe("GroceryScreen — T1: idle shows empty state", () => {
  it("test_grocery_screen_idle_empty_state", () => {
    renderWithSession(<GroceryWith drive={{ kind: "idle" }} />, {
      initialPath: "/grocery",
    });
    expect(screen.getByText(/no grocery list yet/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T2: loading → skeletons
// ---------------------------------------------------------------------------

describe("GroceryScreen — T2: loading shows skeletons", () => {
  it("test_grocery_screen_loading_skeletons", () => {
    renderWithSession(<GroceryWith drive={{ kind: "loading" }} />, {
      initialPath: "/grocery",
    });
    expect(screen.getAllByTestId("grocery-skeleton-row").length).toBeGreaterThan(0);
    expect(screen.queryByText("chicken breast")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T3: streaming → items visible, Save CTA disabled/absent
// ---------------------------------------------------------------------------

describe("GroceryScreen — T3: streaming shows items, Save disabled", () => {
  it("test_grocery_screen_streaming_items_cta_disabled", () => {
    renderWithSession(
      <GroceryWith drive={{ kind: "streaming", stores: STORES }} />,
      { initialPath: "/grocery" },
    );
    expect(screen.getByText("chicken breast")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save list/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// T4: complete → grouped by store, Save enabled
// ---------------------------------------------------------------------------

describe("GroceryScreen — T4: complete shows grouped list, Save enabled", () => {
  it("test_grocery_screen_complete_grouped_items_cta_enabled", () => {
    renderWithSession(
      <GroceryWith drive={{ kind: "complete", stores: STORES }} />,
      { initialPath: "/grocery" },
    );
    expect(screen.getByText("Save-On-Foods")).toBeInTheDocument();
    expect(screen.getByText("Costco")).toBeInTheDocument();
    expect(screen.getByText("chicken breast")).toBeInTheDocument();
    expect(screen.getByText("olive oil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save list/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// T5: error → ErrorBanner + retry sends "retry" to chat endpoint
// ---------------------------------------------------------------------------

describe("GroceryScreen — T5: error shows banner and retry", () => {
  it("test_grocery_screen_error_banner_retry", async () => {
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

    const user = userEvent.setup();
    renderWithSession(<GroceryWith drive={{ kind: "error" }} />, {
      initialPath: "/grocery",
    });

    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody!.message).toBe("retry");
  });
});

// ---------------------------------------------------------------------------
// T6: complete with empty groceryList → empty state
// ---------------------------------------------------------------------------

describe("GroceryScreen — T6: complete with empty groceryList shows empty state", () => {
  it("test_grocery_screen_complete_empty_shows_empty_state", () => {
    renderWithSession(
      <GroceryWith drive={{ kind: "complete", stores: [] }} />,
      { initialPath: "/grocery" },
    );
    expect(screen.getByText(/no grocery list yet/i)).toBeInTheDocument();
    expect(screen.queryByText("chicken breast")).toBeNull();
    expect(screen.queryByText("olive oil")).toBeNull();
    expect(screen.queryByRole("button", { name: /save list/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T7: save list → calls saveMealPlan then saveGroceryList, navigates
// ---------------------------------------------------------------------------

describe("GroceryScreen — T7: save list navigates to /saved/list/:id", () => {
  it("test_grocery_screen_save_list_navigates", async () => {
    const requestOrder: string[] = [];
    let capturedMealPlanBody: Record<string, unknown> | null = null;
    let capturedGroceryBody: Record<string, unknown> | null = null;

    server.use(
      http.post(`${BASE}/saved/meal-plans`, async ({ request }) => {
        capturedMealPlanBody = (await request.json()) as Record<string, unknown>;
        requestOrder.push("meal-plan");
        return HttpResponse.json({
          id: "plan-1",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
      http.post(`${BASE}/saved/grocery-lists`, async ({ request }) => {
        capturedGroceryBody = (await request.json()) as Record<string, unknown>;
        requestOrder.push("grocery-list");
        return HttpResponse.json({
          id: "list-99",
          name: "My Grocery List",
          stores: STORES,
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    const user = userEvent.setup();
    renderGroceryWithRoutes(
      { kind: "complete", stores: STORES },
      { initialSessionId: "session-abc" },
    );

    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByTestId("saved-list-screen")).toBeInTheDocument();
    });

    // Verify request bodies
    expect(capturedMealPlanBody).toEqual({ name: "My Meal Plan", session_id: "session-abc" });
    expect(capturedGroceryBody).toEqual({ name: "My Grocery List", session_id: "session-abc" });
    // Meal plan must be called before grocery list
    expect(requestOrder).toEqual(["meal-plan", "grocery-list"]);
  });
});

// ---------------------------------------------------------------------------
// T8: buy-pill filters checked items
// ---------------------------------------------------------------------------

describe("GroceryScreen — T8: buy-pill filters checked items", () => {
  it("test_grocery_screen_buy_pill_filters_checked", async () => {
    const user = userEvent.setup();
    renderWithSession(
      <GroceryWith drive={{ kind: "complete", stores: STORES }} />,
      { initialPath: "/grocery" },
    );
    // Check i1 (chicken breast)
    await user.click(screen.getByRole("checkbox", { name: /toggle chicken breast/i }));
    // Activate hide-checked pill
    await user.click(screen.getByRole("button", { name: /hide checked/i }));
    expect(screen.getByRole("button", { name: /hide checked/i })).toHaveAttribute("aria-pressed", "true");
    // i1 should be hidden (checked + pill active), i2 and i3 visible
    expect(screen.queryByText("chicken breast")).toBeNull();
    expect(screen.getByText("broccoli")).toBeInTheDocument();
    expect(screen.getByText("olive oil")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T9: copy to notes writes to clipboard
// ---------------------------------------------------------------------------

describe("GroceryScreen — T9: copy to notes writes to clipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("test_grocery_screen_copy_to_notes_writes_clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    renderWithSession(
      <GroceryWith drive={{ kind: "complete", stores: STORES }} />,
      { initialPath: "/grocery" },
    );

    await user.click(screen.getByRole("button", { name: /copy to notes/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0] as string;
    expect(written).toContain("chicken breast");
    expect(written).toContain("olive oil");
  });
});

// ---------------------------------------------------------------------------
// T10: checkbox toggles aria-checked
// ---------------------------------------------------------------------------

describe("GroceryScreen — T10: checkbox toggles aria-checked", () => {
  it("test_grocery_screen_checkbox_toggle", async () => {
    const user = userEvent.setup();
    renderWithSession(
      <GroceryWith drive={{ kind: "complete", stores: STORES }} />,
      { initialPath: "/grocery" },
    );
    const checkbox = screen.getByRole("checkbox", { name: /toggle chicken breast/i });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    await user.click(checkbox);
    expect(checkbox).toHaveAttribute("aria-checked", "true");
  });
});

// ---------------------------------------------------------------------------
// T11: buy-pill + copy excludes checked items from clipboard
// ---------------------------------------------------------------------------

describe("GroceryScreen — T11: copy respects buy-pill filter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("test_grocery_screen_copy_excludes_checked_when_pill_active", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    renderWithSession(
      <GroceryWith drive={{ kind: "complete", stores: STORES }} />,
      { initialPath: "/grocery" },
    );

    // Check i1 (chicken breast)
    await user.click(screen.getByRole("checkbox", { name: /toggle chicken breast/i }));
    // Activate hide-checked pill
    await user.click(screen.getByRole("button", { name: /hide checked/i }));
    // Copy — chicken breast should be absent, broccoli and olive oil present
    await user.click(screen.getByRole("button", { name: /copy to notes/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0] as string;
    expect(written).not.toContain("chicken breast");
    expect(written).toContain("broccoli");
    expect(written).toContain("olive oil");
  });
});

// ---------------------------------------------------------------------------
// T12: meal plan fails → saveGroceryList NOT called, error banner shown
// ---------------------------------------------------------------------------

describe("GroceryScreen — T12: meal plan fails → no grocery save, error shown", () => {
  it("test_grocery_screen_meal_plan_fail_no_grocery_save", async () => {
    let groceryCalled = false;
    server.use(
      http.post(`${BASE}/saved/meal-plans`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
      http.post(`${BASE}/saved/grocery-lists`, () => {
        groceryCalled = true;
        return HttpResponse.json({
          id: "list-99",
          name: "My Grocery List",
          stores: STORES,
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    const user = userEvent.setup();
    renderGroceryWithRoutes(
      { kind: "complete", stores: STORES },
      { initialSessionId: "session-abc" },
    );

    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to save meal plan/i)).toBeInTheDocument();
    });
    await waitFor(() => { expect(groceryCalled).toBe(false); });
    expect(screen.queryByTestId("saved-list-screen")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T13: meal plan succeeds but grocery list fails → correct error, no nav
// ---------------------------------------------------------------------------

describe("GroceryScreen — T13: meal plan ok but grocery list fails → partial error", () => {
  it("test_grocery_screen_grocery_fail_partial_error_banner", async () => {
    server.use(
      http.post(`${BASE}/saved/meal-plans`, () => {
        return HttpResponse.json({
          id: "plan-1",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
      http.post(`${BASE}/saved/grocery-lists`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const user = userEvent.setup();
    renderGroceryWithRoutes(
      { kind: "complete", stores: STORES },
      { initialSessionId: "session-abc" },
    );

    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByText(/grocery list save failed.*meal plan saved/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("saved-list-screen")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T14: retry after partial failure skips saveMealPlan
// ---------------------------------------------------------------------------

describe("GroceryScreen — T14: retry after partial failure does not re-save meal plan", () => {
  it("test_grocery_screen_retry_skips_meal_plan", async () => {
    let mealPlanCalls = 0;
    let groceryCalls = 0;

    server.use(
      http.post(`${BASE}/saved/meal-plans`, () => {
        mealPlanCalls++;
        return HttpResponse.json({
          id: "plan-1",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
      http.post(`${BASE}/saved/grocery-lists`, () => {
        groceryCalls++;
        if (groceryCalls === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({
          id: "list-99",
          name: "My Grocery List",
          stores: STORES,
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    const user = userEvent.setup();
    renderGroceryWithRoutes(
      { kind: "complete", stores: STORES },
      { initialSessionId: "session-abc" },
    );

    // First click — grocery list fails
    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByText(/grocery list save failed.*meal plan saved/i)).toBeInTheDocument();
    });
    // Retry — only saveGroceryList should be called again
    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByTestId("saved-list-screen")).toBeInTheDocument();
    });
    expect(mealPlanCalls).toBe(1);
    expect(groceryCalls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// T15: successful retry navigates to /saved/list/:id
// ---------------------------------------------------------------------------

describe("GroceryScreen — T15: successful retry navigates to /saved/list/:id", () => {
  it("test_grocery_screen_retry_success_navigates", async () => {
    let groceryCalls = 0;

    server.use(
      http.post(`${BASE}/saved/meal-plans`, () => {
        return HttpResponse.json({
          id: "plan-1",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
      http.post(`${BASE}/saved/grocery-lists`, () => {
        groceryCalls++;
        if (groceryCalls === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({
          id: "list-99",
          name: "My Grocery List",
          stores: STORES,
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    const user = userEvent.setup();
    renderGroceryWithRoutes(
      { kind: "complete", stores: STORES },
      { initialSessionId: "session-abc" },
    );

    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByText(/grocery list save failed.*meal plan saved/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByTestId("saved-list-screen")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T16: save button disabled while request is in flight
// ---------------------------------------------------------------------------

describe("GroceryScreen — T16: save button disabled while saving", () => {
  it("test_grocery_screen_button_disabled_while_saving", async () => {
    let resolveMealPlan: (() => void) | null = null;

    server.use(
      http.post(`${BASE}/saved/meal-plans`, async () => {
        await new Promise<void>((r) => {
          resolveMealPlan = r;
        });
        return HttpResponse.json({
          id: "plan-1",
          name: "My Meal Plan",
          recipes: [],
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
      http.post(`${BASE}/saved/grocery-lists`, () => {
        return HttpResponse.json({
          id: "list-99",
          name: "My Grocery List",
          stores: STORES,
          created_at: STUB_TIMESTAMP,
          updated_at: STUB_TIMESTAMP,
        });
      }),
    );

    const user = userEvent.setup();
    renderGroceryWithRoutes(
      { kind: "complete", stores: STORES },
      { initialSessionId: "session-abc" },
    );

    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).not.toBeDisabled();

    // Click but do NOT await — saveMealPlan is blocked so handleSave is in-flight
    const clickPromise = user.click(btn);

    // isSaving=true → button is disabled
    await waitFor(() => {
      const savingBtn = screen.getByRole("button", { name: /save list|saving/i });
      expect(savingBtn).toBeDisabled();
    });

    // Unblock the in-flight promise so React can clean up
    resolveMealPlan!();
    await clickPromise;
  });
});
