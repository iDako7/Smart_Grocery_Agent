// Integration tests for the "Save plan" button on RecipesScreen.
//
// Covers:
//   1. Button renders
//   2. Button disabled when sessionId is null
//   3. Clicking calls saveMealPlan with correct args
//   4. Clicking navigates to the returned plan ID
//   5. Button disabled during save (prevents double-click)

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import * as ReactRouter from "react-router";
import type { NavigateFunction } from "react-router";

import { ScenarioProvider } from "@/context/scenario-context";
import * as SessionContextModule from "@/context/session-context";
import * as ApiClient from "@/services/api-client";
import { RecipesScreen } from "@/screens/RecipesScreen";
import type { SavedMealPlan } from "@/types/api";

// ---------------------------------------------------------------------------
// Mock saveMealPlan
// ---------------------------------------------------------------------------

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual<typeof ApiClient>("@/services/api-client");
  return {
    ...actual,
    saveMealPlan: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SESSION_ID = "test-session-id";

const DEFAULT_SESSION_VALUE = {
  sessionId: MOCK_SESSION_ID as string | null,
  sendMessage: vi.fn(),
  navigateToScreen: vi.fn(),
  addLocalTurn: vi.fn(),
  resetSession: vi.fn(),
  dispatch: vi.fn(),
  screenState: "idle" as const,
  screenData: {
    recipes: [],
    groceryList: [],
    pcsv: null,
    explanation: "",
    thinkingMessage: "",
    error: null,
    completionStatus: null,
    completionReason: null,
  },
  isComplete: false,
  isLoading: false,
  isStreaming: false,
  isError: false,
  conversationHistory: [],
  currentScreen: "recipes" as const,
};

/**
 * Render RecipesScreen with a mocked useSessionOptional value.
 * The mock replaces the hook import so we can control sessionId precisely.
 */
function renderRecipesScreen(
  sessionOverrides: Partial<typeof DEFAULT_SESSION_VALUE> | null = {}
) {
  const sessionValue =
    sessionOverrides === null
      ? null
      : { ...DEFAULT_SESSION_VALUE, ...sessionOverrides };

  vi.spyOn(SessionContextModule, "useSessionOptional").mockReturnValue(
    sessionValue as ReturnType<typeof SessionContextModule.useSessionOptional>
  );

  return render(
    <MemoryRouter initialEntries={["/recipes"]}>
      <ScenarioProvider>
        <RecipesScreen />
      </ScenarioProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Suite 1: Button renders
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" button renders', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a button with text 'Save plan'", () => {
    renderRecipesScreen();
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent?.trim()).toBe("Save plan");
  });

  it("button has type='button'", () => {
    renderRecipesScreen();
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).toHaveAttribute("type", "button");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Button disabled when sessionId is null
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" button disabled without session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is disabled when sessionId is null (session present but no ID yet)", () => {
    renderRecipesScreen({ sessionId: null });
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).toBeDisabled();
  });

  it("is disabled when useSessionOptional returns null (no SessionProvider)", () => {
    renderRecipesScreen(null);
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).toBeDisabled();
  });

  it("is NOT disabled when sessionId is a non-empty string", () => {
    renderRecipesScreen({ sessionId: MOCK_SESSION_ID });
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Clicking calls saveMealPlan with correct args
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" calls saveMealPlan', () => {
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateMock = vi.fn();
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(
      navigateMock as unknown as NavigateFunction
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls saveMealPlan with planName and sessionId on click", async () => {
    const user = userEvent.setup();
    const mockSave = vi.mocked(ApiClient.saveMealPlan);
    mockSave.mockResolvedValue({
      id: "plan-abc",
      name: "Test",
      recipes: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderRecipesScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save plan/i }));
    });

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(
      expect.stringContaining("Meal plan"),
      MOCK_SESSION_ID
    );
  });

  it("plan name includes the number of displayed dishes", async () => {
    const user = userEvent.setup();
    const mockSave = vi.mocked(ApiClient.saveMealPlan);
    mockSave.mockResolvedValue({
      id: "plan-abc",
      name: "Meal plan · 3 dishes",
      recipes: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderRecipesScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save plan/i }));
    });

    // The name format is "Meal plan · N dishes" where N is displayedRecipes.length
    const [nameArg] = mockSave.mock.calls[0];
    expect(nameArg).toMatch(/Meal plan · \d+ dishes/);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Navigates to returned plan ID
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" navigates to returned ID', () => {
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateMock = vi.fn();
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(
      navigateMock as unknown as NavigateFunction
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates to /saved/plan/{returned id} with justSaved state", async () => {
    const user = userEvent.setup();
    vi.mocked(ApiClient.saveMealPlan).mockResolvedValue({
      id: "plan-abc",
      name: "Meal plan · 3 dishes",
      recipes: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderRecipesScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save plan/i }));
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/saved/plan/plan-abc", {
        state: { justSaved: true },
      });
    });
  });

  it("navigates using the exact id string returned by the API", async () => {
    const user = userEvent.setup();
    vi.mocked(ApiClient.saveMealPlan).mockResolvedValue({
      id: "real-uuid-from-backend",
      name: "Test",
      recipes: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderRecipesScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save plan/i }));
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/saved/plan/real-uuid-from-backend",
        { state: { justSaved: true } }
      );
    });
  });

  it("does NOT navigate to the hardcoded /saved/plan/1", async () => {
    const user = userEvent.setup();
    vi.mocked(ApiClient.saveMealPlan).mockResolvedValue({
      id: "plan-xyz",
      name: "Test",
      recipes: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderRecipesScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save plan/i }));
    });

    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalledWith(
        "/saved/plan/1",
        expect.anything()
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Button disabled during save (prevents double-click)
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" disabled during save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("button is disabled while saveMealPlan is in flight", async () => {
    const user = userEvent.setup();
    // Return a promise that never resolves — simulates in-flight request
    vi.mocked(ApiClient.saveMealPlan).mockReturnValue(
      new Promise(() => {}) as Promise<SavedMealPlan>
    );

    renderRecipesScreen();

    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).not.toBeDisabled(); // starts enabled

    await act(async () => {
      await user.click(btn);
    });

    expect(btn).toBeDisabled(); // disabled once save is in flight
  });

  it("does not call saveMealPlan a second time if clicked while disabled", async () => {
    const user = userEvent.setup();
    const mockSave = vi.mocked(ApiClient.saveMealPlan);
    mockSave.mockReturnValue(new Promise(() => {}));

    renderRecipesScreen();

    const btn = screen.getByRole("button", { name: /save plan/i });

    await act(async () => {
      await user.click(btn); // first click — starts save
    });

    // Button is now disabled; second click should be a no-op
    await act(async () => {
      await user.click(btn);
    });

    expect(mockSave).toHaveBeenCalledOnce();
  });
});
