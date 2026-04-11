import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { renderWithSession } from "./test-utils";

describe("SavedMealPlanScreen — saved toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows saved toast on mount", () => {
    renderWithSession(<SavedMealPlanScreen />, { initialPath: "/saved/plan/1" });
    expect(screen.getByTestId("saved-toast")).toBeInTheDocument();
    expect(screen.getByTestId("saved-toast").textContent).toContain("Saved");
  });

  it("toast disappears after timeout", () => {
    renderWithSession(<SavedMealPlanScreen />, { initialPath: "/saved/plan/1" });
    expect(screen.getByTestId("saved-toast")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId("saved-toast")).not.toBeInTheDocument();
  });
});
