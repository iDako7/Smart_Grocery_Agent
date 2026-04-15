// GroceryScreen integration tests — TDD RED → GREEN (issue #40).
// Written FIRST before implementation. All 10 tests should RED on an
// empty GroceryScreen shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { Routes, Route, MemoryRouter } from "react-router";

import { GroceryScreen } from "@/screens/GroceryScreen";
import { renderWithSession, createMockChatService } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import * as sessionContextModule from "@/context/session-context";
import { initialScreenData } from "@/hooks/use-screen-state";
import { saveGroceryList, saveMealPlan } from "@/services/api-client";
import type { GroceryStore } from "@/types/sse";

// ---------------------------------------------------------------------------
// Module-level mock for api-client
// ---------------------------------------------------------------------------

vi.mock("@/services/api-client", () => ({
  saveGroceryList: vi.fn(),
  saveMealPlan: vi.fn(),
}));

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
// Drive helper — mirrors RecipesWith from recipes-screen.test.tsx
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
      // start_loading + start_streaming already dispatched above
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
// T1: idle → empty state
// ---------------------------------------------------------------------------

describe("GroceryScreen — T1: idle shows empty state", () => {
  it("test_grocery_screen_idle_empty_state", () => {
    renderWithSession(<GroceryWith drive={{ kind: "idle" }} />, {
      chatService: createMockChatService().service,
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
      chatService: createMockChatService().service,
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
      { chatService: createMockChatService().service, initialPath: "/grocery" }
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
      { chatService: createMockChatService().service, initialPath: "/grocery" }
    );
    expect(screen.getByText("Save-On-Foods")).toBeInTheDocument();
    expect(screen.getByText("Costco")).toBeInTheDocument();
    expect(screen.getByText("chicken breast")).toBeInTheDocument();
    expect(screen.getByText("olive oil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save list/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// T5: error → ErrorBanner + retry calls sendMessage
// ---------------------------------------------------------------------------

describe("GroceryScreen — T5: error shows banner and retry", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const sendMessageSpy = vi.fn();

  beforeEach(() => {
    sendMessageSpy.mockClear();
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "error",
      screenData: { ...initialScreenData, error: "Something went wrong. Please try again." },
      isLoading: false, isStreaming: false, isComplete: false, isError: true,
      sessionId: null, conversationHistory: [], currentScreen: "grocery",
      sendMessage: sendMessageSpy,
      navigateToScreen: vi.fn(), resetSession: vi.fn(), addLocalTurn: vi.fn(), dispatch: vi.fn(),
    });
  });

  afterEach(() => { spy.mockRestore(); });

  it("test_grocery_screen_error_banner_retry", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/grocery"]}><GroceryScreen /></MemoryRouter>);
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(sendMessageSpy).toHaveBeenCalledWith("retry");
  });
});

// ---------------------------------------------------------------------------
// T6: complete with empty groceryList → empty state
// ---------------------------------------------------------------------------

describe("GroceryScreen — T6: complete with empty groceryList shows empty state", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: { ...initialScreenData, groceryList: [], completionStatus: "complete" },
      isLoading: false, isStreaming: false, isComplete: true, isError: false,
      sessionId: null, conversationHistory: [], currentScreen: "grocery",
      sendMessage: vi.fn(), navigateToScreen: vi.fn(), resetSession: vi.fn(),
      addLocalTurn: vi.fn(), dispatch: vi.fn(),
    });
  });

  afterEach(() => { spy.mockRestore(); });

  it("test_grocery_screen_complete_empty_shows_empty_state", () => {
    render(<MemoryRouter initialEntries={["/grocery"]}><GroceryScreen /></MemoryRouter>);
    expect(screen.getByText(/no grocery list yet/i)).toBeInTheDocument();
    expect(screen.queryByText("chicken breast")).toBeNull();
    expect(screen.queryByText("olive oil")).toBeNull();
    expect(screen.queryByRole("button", { name: /save list/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T7: save list → calls saveGroceryList and navigates to /saved/list/:id
// ---------------------------------------------------------------------------

describe("GroceryScreen — T7: save list navigates to /saved/list/:id", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockResolvedValue({
      id: "plan-1",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    vi.mocked(saveGroceryList).mockResolvedValue({
      id: "list-99",
      name: "My Grocery List",
      stores: STORES,
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    spy = vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
      screenState: "complete",
      screenData: { ...initialScreenData, groceryList: STORES, completionStatus: "complete" },
      isLoading: false, isStreaming: false, isComplete: true, isError: false,
      sessionId: "session-abc",
      conversationHistory: [], currentScreen: "grocery",
      sendMessage: vi.fn(), navigateToScreen: vi.fn(), resetSession: vi.fn(),
      addLocalTurn: vi.fn(), dispatch: vi.fn(),
    });
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveGroceryList).mockReset();
    vi.mocked(saveMealPlan).mockReset();
  });

  it("test_grocery_screen_save_list_navigates", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <Routes>
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/list/:id" element={<div data-testid="saved-list-screen" />} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByTestId("saved-list-screen")).toBeInTheDocument();
    });
    expect(vi.mocked(saveMealPlan)).toHaveBeenCalledWith("My Meal Plan", "session-abc");
    expect(vi.mocked(saveGroceryList)).toHaveBeenCalledWith("My Grocery List", "session-abc");
    // meal plan must be called before grocery list
    const mpOrder = vi.mocked(saveMealPlan).mock.invocationCallOrder[0];
    const glOrder = vi.mocked(saveGroceryList).mock.invocationCallOrder[0];
    expect(mpOrder).toBeLessThan(glOrder);
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
      { chatService: createMockChatService().service, initialPath: "/grocery" }
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
      { chatService: createMockChatService().service, initialPath: "/grocery" }
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
      { chatService: createMockChatService().service, initialPath: "/grocery" }
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
      { chatService: createMockChatService().service, initialPath: "/grocery" }
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
// Shared spy setup for T12–T16
// ---------------------------------------------------------------------------

function makeCompleteSpy() {
  return vi.spyOn(sessionContextModule, "useSessionOptional").mockReturnValue({
    screenState: "complete",
    screenData: { ...initialScreenData, groceryList: STORES, completionStatus: "complete" },
    isLoading: false, isStreaming: false, isComplete: true, isError: false,
    sessionId: "session-abc",
    conversationHistory: [], currentScreen: "grocery",
    sendMessage: vi.fn(), navigateToScreen: vi.fn(), resetSession: vi.fn(),
    addLocalTurn: vi.fn(), dispatch: vi.fn(),
  });
}

// ---------------------------------------------------------------------------
// T12: meal plan fails → saveGroceryList NOT called, error banner shown
// ---------------------------------------------------------------------------

describe("GroceryScreen — T12: meal plan fails → no grocery save, error shown", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockRejectedValue(new Error("network error"));
    vi.mocked(saveGroceryList).mockResolvedValue({
      id: "list-99",
      name: "My Grocery List",
      stores: STORES,
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    spy = makeCompleteSpy();
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
    vi.mocked(saveGroceryList).mockReset();
  });

  it("test_grocery_screen_meal_plan_fail_no_grocery_save", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <Routes>
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/list/:id" element={<div data-testid="saved-list-screen" />} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: /save list/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to save meal plan/i)).toBeInTheDocument();
    });
    expect(vi.mocked(saveGroceryList)).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-list-screen")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T13: meal plan succeeds but grocery list fails → correct error, no nav
// ---------------------------------------------------------------------------

describe("GroceryScreen — T13: meal plan ok but grocery list fails → partial error", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockResolvedValue({
      id: "plan-1",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    vi.mocked(saveGroceryList).mockRejectedValue(new Error("grocery save failed"));
    spy = makeCompleteSpy();
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
    vi.mocked(saveGroceryList).mockReset();
  });

  it("test_grocery_screen_grocery_fail_partial_error_banner", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <Routes>
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/list/:id" element={<div data-testid="saved-list-screen" />} />
        </Routes>
      </MemoryRouter>
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
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockResolvedValue({
      id: "plan-1",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    vi.mocked(saveGroceryList)
      .mockRejectedValueOnce(new Error("grocery save failed"))
      .mockResolvedValue({
        id: "list-99",
        name: "My Grocery List",
        stores: STORES,
        created_at: "2026-04-13T00:00:00Z",
        updated_at: "2026-04-13T00:00:00Z",
      });
    spy = makeCompleteSpy();
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
    vi.mocked(saveGroceryList).mockReset();
  });

  it("test_grocery_screen_retry_skips_meal_plan", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <Routes>
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/list/:id" element={<div data-testid="saved-list-screen" />} />
        </Routes>
      </MemoryRouter>
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
    expect(vi.mocked(saveMealPlan)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveGroceryList)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// T15: successful retry navigates to /saved/list/:id
// ---------------------------------------------------------------------------

describe("GroceryScreen — T15: successful retry navigates to /saved/list/:id", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(saveMealPlan).mockResolvedValue({
      id: "plan-1",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    vi.mocked(saveGroceryList)
      .mockRejectedValueOnce(new Error("first attempt fails"))
      .mockResolvedValue({
        id: "list-99",
        name: "My Grocery List",
        stores: STORES,
        created_at: "2026-04-13T00:00:00Z",
        updated_at: "2026-04-13T00:00:00Z",
      });
    spy = makeCompleteSpy();
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
    vi.mocked(saveGroceryList).mockReset();
  });

  it("test_grocery_screen_retry_success_navigates", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <Routes>
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/list/:id" element={<div data-testid="saved-list-screen" />} />
        </Routes>
      </MemoryRouter>
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

type MealPlanResult = { id: string; name: string; recipes: unknown[]; created_at: string; updated_at: string };
let t16ResolvePlan: ((v: MealPlanResult) => void) | null = null;

describe("GroceryScreen — T16: save button disabled while saving", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const planPromise = new Promise<MealPlanResult>((res) => { t16ResolvePlan = res; });
    vi.mocked(saveMealPlan).mockReturnValue(planPromise as ReturnType<typeof saveMealPlan>);
    vi.mocked(saveGroceryList).mockResolvedValue({
      id: "list-99",
      name: "My Grocery List",
      stores: STORES,
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    spy = makeCompleteSpy();
  });

  afterEach(() => {
    spy.mockRestore();
    vi.mocked(saveMealPlan).mockReset();
    vi.mocked(saveGroceryList).mockReset();
    t16ResolvePlan = null;
  });

  it("test_grocery_screen_button_disabled_while_saving", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <Routes>
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/list/:id" element={<div data-testid="saved-list-screen" />} />
        </Routes>
      </MemoryRouter>
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
    t16ResolvePlan!({
      id: "plan-1",
      name: "My Meal Plan",
      recipes: [],
      created_at: "2026-04-13T00:00:00Z",
      updated_at: "2026-04-13T00:00:00Z",
    });
    await clickPromise;
  });
});
