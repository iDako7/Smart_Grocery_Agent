import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { renderWithSession } from "./test-utils";

describe("SavedGroceryListScreen — saved toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows saved toast when navigated with justSaved state", () => {
    renderWithSession(<SavedGroceryListScreen />, {
      initialPath: "/saved/list/1",
      initialState: { justSaved: true },
    });
    expect(screen.getByTestId("saved-toast")).toBeInTheDocument();
    expect(screen.getByTestId("saved-toast").textContent).toContain("Saved");
  });

  it("does NOT show saved toast when navigated without justSaved state", () => {
    renderWithSession(<SavedGroceryListScreen />, {
      initialPath: "/saved/list/1",
    });
    expect(screen.queryByTestId("saved-toast")).not.toBeInTheDocument();
  });

  it("toast disappears after timeout when navigated with justSaved state", () => {
    renderWithSession(<SavedGroceryListScreen />, {
      initialPath: "/saved/list/1",
      initialState: { justSaved: true },
    });
    expect(screen.getByTestId("saved-toast")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId("saved-toast")).not.toBeInTheDocument();
  });
});
