import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { renderWithSession } from "./test-utils";

// ---------------------------------------------------------------------------
// "Save plan" button (RecipesScreen)
// ---------------------------------------------------------------------------

describe('RecipesScreen — "Save plan" button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a Save plan button", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });
    const btn = screen.getByRole("button", { name: /save plan/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("calls console.info on click", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    await user.click(screen.getByRole("button", { name: /save plan/i }));

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toMatch(/save/i);
  });

  it("shows visual feedback after click", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    const btn = screen.getByRole("button", { name: /save plan/i });
    await user.click(btn);

    // Button text changes to "Saved!" or data-saved attribute set
    await waitFor(() => {
      const hasSavedText = btn.textContent?.includes("Saved!");
      const hasSavedAttr = btn.getAttribute("data-saved") === "true";
      expect(hasSavedText || hasSavedAttr).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// "Save list" button (GroceryScreen)
// ---------------------------------------------------------------------------

describe('GroceryScreen — "Save list" button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a Save list button", () => {
    renderWithSession(<GroceryScreen />, { initialPath: "/grocery" });
    const btn = screen.getByRole("button", { name: /save list/i });
    expect(btn).toBeInTheDocument();
  });

  it("calls console.info on click", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithSession(<GroceryScreen />, { initialPath: "/grocery" });

    await user.click(screen.getByRole("button", { name: /save list/i }));

    expect(spy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// "EN/中" toggle (RecipesScreen)
// ---------------------------------------------------------------------------

describe('RecipesScreen — "EN/中" language toggle', () => {
  it("is a button element with accessible label", () => {
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });
    const btn = screen.getByRole("button", { name: /language/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it('clicking toggles bold to "中"', async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    const btn = screen.getByRole("button", { name: /language/i });
    await user.click(btn);

    // "中" should be bold, "EN" should not
    const zhEl = btn.querySelector("b");
    expect(zhEl?.textContent).toBe("中");
  });

  it("clicking again toggles bold back to EN", async () => {
    const user = userEvent.setup();
    renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });

    const btn = screen.getByRole("button", { name: /language/i });
    await user.click(btn);
    await user.click(btn);

    const boldEl = btn.querySelector("b");
    expect(boldEl?.textContent).toBe("EN");
  });
});
