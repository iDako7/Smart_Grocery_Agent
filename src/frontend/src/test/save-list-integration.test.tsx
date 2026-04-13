// save-list-integration.test.tsx
//
// TDD integration tests for wiring "Save list" on GroceryScreen to the real API.
// Tests the NEW behavior:
//   - handleSave calls saveGroceryList(name, sessionId)
//   - navigates to /saved/list/{returned_id}
//   - button disabled when no sessionId
//   - button disabled during save

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import * as ReactRouter from "react-router";
import type { NavigateFunction } from "react-router";

import { ScenarioProvider } from "@/context/scenario-context";
import { GroceryScreen } from "@/screens/GroceryScreen";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Mock saveGroceryList from api-client — prevents real network calls.
vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/services/api-client")>("@/services/api-client");
  return {
    ...actual,
    saveGroceryList: vi.fn(),
  };
});

// Mock useSessionOptional — provides a controllable sessionId.
vi.mock("@/context/session-context", async () => {
  const actual = await vi.importActual<typeof import("@/context/session-context")>(
    "@/context/session-context"
  );
  return {
    ...actual,
    useSessionOptional: vi.fn(() => ({
      sessionId: "test-session-id",
      sendMessage: vi.fn(),
      screenData: {
        recipes: [],
        groceryList: [],
        pcsv: null,
        explanation: null,
        error: null,
        completionStatus: null,
      },
      screenState: "idle",
      isComplete: false,
      isLoading: false,
      isStreaming: false,
      isError: false,
      conversationHistory: [],
      currentScreen: "grocery",
      navigateToScreen: vi.fn(),
      resetSession: vi.fn(),
      addLocalTurn: vi.fn(),
      dispatch: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import * as ApiClient from "@/services/api-client";
import * as SessionContext from "@/context/session-context";

type SaveGroceryListMock = ReturnType<typeof vi.fn>;

function getSaveGroceryListMock(): SaveGroceryListMock {
  return ApiClient.saveGroceryList as SaveGroceryListMock;
}

function getUseSessionOptionalMock(): ReturnType<typeof vi.fn> {
  return SessionContext.useSessionOptional as ReturnType<typeof vi.fn>;
}

/** Base mock session value — all tests that need a sessionId start from here. */
function mockSessionWith(overrides: Partial<{ sessionId: string | null }> = {}) {
  getUseSessionOptionalMock().mockReturnValue({
    sessionId: "test-session-id",
    sendMessage: vi.fn(),
    screenData: {
      recipes: [],
      groceryList: [],
      pcsv: null,
      explanation: null,
      error: null,
      completionStatus: null,
    },
    screenState: "idle",
    isComplete: false,
    isLoading: false,
    isStreaming: false,
    isError: false,
    conversationHistory: [],
    currentScreen: "grocery",
    navigateToScreen: vi.fn(),
    resetSession: vi.fn(),
    addLocalTurn: vi.fn(),
    dispatch: vi.fn(),
    ...overrides,
  });
}

/**
 * Minimal render wrapper. Does NOT include SessionProvider — we mock
 * useSessionOptional at the module level, so the hook returns our value
 * without needing the real provider.
 */
function renderGrocery() {
  return render(
    <MemoryRouter initialEntries={["/grocery"]}>
      <ScenarioProvider>
        <GroceryScreen />
      </ScenarioProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAVED_GROCERY_LIST_FIXTURE = {
  id: "list-xyz",
  name: "Grocery list",
  stores: [],
  created_at: "2026-04-12T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Suite 1: saveGroceryList called with correct arguments
// ---------------------------------------------------------------------------

describe("GroceryScreen — Save list calls API with correct args", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset mock implementations between tests
    mockSessionWith();
  });

  it("calls saveGroceryList with name 'Grocery list' and the current sessionId", async () => {
    mockSessionWith({ sessionId: "test-session-id" });
    getSaveGroceryListMock().mockResolvedValueOnce(SAVED_GROCERY_LIST_FIXTURE);
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(vi.fn() as unknown as NavigateFunction);

    const user = userEvent.setup();
    renderGrocery();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save list/i }));
    });

    expect(getSaveGroceryListMock()).toHaveBeenCalledOnce();
    expect(getSaveGroceryListMock()).toHaveBeenCalledWith("Grocery list", "test-session-id");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Navigation to returned ID
// ---------------------------------------------------------------------------

describe("GroceryScreen — handleSave navigates to returned ID", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockSessionWith();
  });

  it("navigates to /saved/list/{returned_id} with justSaved state", async () => {
    mockSessionWith({ sessionId: "test-session-id" });
    getSaveGroceryListMock().mockResolvedValueOnce(SAVED_GROCERY_LIST_FIXTURE);
    const navigateMock = vi.fn();
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(navigateMock as unknown as NavigateFunction);

    const user = userEvent.setup();
    renderGrocery();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save list/i }));
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/saved/list/list-xyz",
        { state: { justSaved: true } }
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Button disabled when no sessionId
// ---------------------------------------------------------------------------

describe("GroceryScreen — Save list button disabled without sessionId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockSessionWith();
  });

  it("button is disabled when sessionId is null", () => {
    mockSessionWith({ sessionId: null });
    renderGrocery();

    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).toBeDisabled();
  });

  it("button is not disabled when sessionId is present", () => {
    mockSessionWith({ sessionId: "test-session-id" });
    getSaveGroceryListMock().mockResolvedValue(SAVED_GROCERY_LIST_FIXTURE);
    renderGrocery();

    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Button disabled during save (saving state)
// ---------------------------------------------------------------------------

describe("GroceryScreen — Save list button disabled while saving", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockSessionWith();
  });

  it("button becomes disabled immediately after click (while promise is pending)", async () => {
    mockSessionWith({ sessionId: "test-session-id" });

    // Never-resolving promise simulates an in-flight request.
    getSaveGroceryListMock().mockReturnValue(new Promise(() => {}));
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(vi.fn() as unknown as NavigateFunction);

    const user = userEvent.setup();
    renderGrocery();

    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).not.toBeDisabled();

    // Click but do NOT await the full act — we want to inspect the
    // in-flight state.  We start the click then check synchronously.
    const clickPromise = user.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save list/i })).toBeDisabled();
    });

    // Clean up — let the click settle even though the promise never resolves.
    await act(async () => {
      await clickPromise;
    });
  });
});
