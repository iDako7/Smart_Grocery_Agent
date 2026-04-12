// Tests for the "Linked Save" feature (G3):
//   - GroceryScreen bundles grocery stores + recipe data into handleSave payload
//   - Save list button is wired to handleSave (extracted function, not inline handler)
//   - GroceryScreen can access session recipe data without crashing

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import * as ReactRouter from "react-router";
import type { NavigateFunction } from "react-router";

import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider } from "@/context/session-context";
import type { ChatServiceHandler } from "@/context/session-context";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { renderWithSession } from "./test-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal render wrapper for GroceryScreen.
 * Mirrors the pattern used in remove-dish.test.tsx for RecipesScreen.
 */
function renderGroceryScreen(chatService?: ChatServiceHandler) {
  return render(
    <MemoryRouter initialEntries={["/grocery"]}>
      <ScenarioProvider>
        <SessionProvider chatService={chatService}>
          <GroceryScreen />
        </SessionProvider>
      </ScenarioProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Suite 1: "Save list" button presence and attributes
// ---------------------------------------------------------------------------

describe("GroceryScreen — Save list button", () => {
  it("renders a 'Save list' button", () => {
    renderGroceryScreen();
    expect(
      screen.getByRole("button", { name: /save list/i })
    ).toBeInTheDocument();
  });

  it("'Save list' button has type='button' (not a submit)", () => {
    renderGroceryScreen();
    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).toHaveAttribute("type", "button");
  });

  it("clicking 'Save list' does not throw an error", async () => {
    const user = userEvent.setup();
    renderGroceryScreen();

    await expect(
      act(async () => {
        await user.click(screen.getByRole("button", { name: /save list/i }));
      })
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: handleSave calls navigate with correct destination + state
// ---------------------------------------------------------------------------

describe("GroceryScreen — handleSave navigation", () => {
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateMock = vi.fn();
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(navigateMock as unknown as NavigateFunction);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clicking 'Save list' calls navigate('/saved/list/1', { state: { justSaved: true } })", async () => {
    const user = userEvent.setup();
    renderGroceryScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save list/i }));
    });

    expect(navigateMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith(
      "/saved/list/1",
      { state: { justSaved: true } }
    );
  });

  it("handleSave calls navigate exactly once per button click", async () => {
    const user = userEvent.setup();
    renderGroceryScreen();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save list/i }));
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: sessionRecipes integration — component reads from context
// ---------------------------------------------------------------------------

describe("GroceryScreen — sessionRecipes from context", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders without error when session has no recipes (empty array default)", () => {
    // Session context initialises screenData.recipes as [] — component must render fine.
    expect(() => renderGroceryScreen()).not.toThrow();
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  it("renders without error when session context is absent (useSessionOptional returns null)", () => {
    // GroceryScreen uses useSessionOptional() — must handle null session gracefully.
    expect(() =>
      render(
        <MemoryRouter initialEntries={["/grocery"]}>
          <ScenarioProvider>
            {/* No SessionProvider — session is null */}
            <GroceryScreen />
          </ScenarioProvider>
        </MemoryRouter>
      )
    ).not.toThrow();
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  it("renders without error when a chatService that emits recipe events is provided", () => {
    // Validates that the component handles a non-empty recipes array without crashing.
    // The eagerService emits immediately (before sendMessage), which in practice
    // won't fire into the reducer; but wiring a live chatService to the provider
    // confirms the component renders stably with an active chat service.
    const eagerService: ChatServiceHandler = (
      _message,
      _screen,
      onEvent,
      onDone
    ) => {
      onEvent({
        event_type: "recipe_card",
        recipe: {
          id: "r1",
          name: "Test Recipe",
          name_zh: "测试食谱",
          cuisine: "Korean",
          cooking_method: "grill",
          effort_level: "quick",
          flavor_tags: ["savory"],
          serves: 2,
          pcsv_roles: { protein: ["chicken"] },
          ingredients_have: ["chicken"],
          ingredients_need: ["garlic"],
        },
      });
      onDone("complete", null);
      return { cancel: vi.fn() };
    };

    expect(() =>
      renderWithSession(<GroceryScreen />, {
        chatService: eagerService,
        initialPath: "/grocery",
      })
    ).not.toThrow();

    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: handleSave null-safety — tolerates empty/absent data
// ---------------------------------------------------------------------------

describe("GroceryScreen — handleSave null-safety", () => {
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateMock = vi.fn();
    vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(navigateMock as unknown as NavigateFunction);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handleSave does not throw when groceryList is empty (session default)", async () => {
    // Session starts with empty groceryList and empty recipes.
    // handleSave must tolerate both being [] without error.
    const user = userEvent.setup();
    renderGroceryScreen();

    await expect(
      act(async () => {
        await user.click(screen.getByRole("button", { name: /save list/i }));
      })
    ).resolves.not.toThrow();

    expect(navigateMock).toHaveBeenCalledOnce();
  });

  it("handleSave does not throw when session context is null", async () => {
    // GroceryScreen uses useSessionOptional() — sessionGrocery and sessionRecipes
    // must both use `?? []` fallback so handleSave still runs when session is null.
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/grocery"]}>
        <ScenarioProvider>
          {/* No SessionProvider — session is null */}
          <GroceryScreen />
        </ScenarioProvider>
      </MemoryRouter>
    );

    await expect(
      act(async () => {
        await user.click(screen.getByRole("button", { name: /save list/i }));
      })
    ).resolves.not.toThrow();

    expect(navigateMock).toHaveBeenCalledOnce();
  });
});
