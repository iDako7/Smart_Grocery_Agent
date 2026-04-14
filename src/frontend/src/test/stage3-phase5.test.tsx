// Stage 3 Phase 5 tests — ErrorBanner component + saved screen chat wiring.
// Written BEFORE implementation (RED phase). All tests should FAIL until
// ErrorBanner component is created and screen files are updated.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Base-ui mocks (menu + dialog) are in setup.ts

import { ErrorBanner } from "@/components/error-banner";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { renderWithSession } from "@/test/test-utils";

// ---------------------------------------------------------------------------
// 1. ErrorBanner renders error message
// ---------------------------------------------------------------------------

describe("ErrorBanner — renders error message", () => {
  it("displays the provided message text", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders with error variant by default", () => {
    const { container } = render(<ErrorBanner message="An error occurred" />);
    // error variant uses persimmon-soft background class
    expect(container.firstChild).toHaveClass("bg-persimmon-soft");
  });
});

// ---------------------------------------------------------------------------
// 2. ErrorBanner renders retry button when onRetry provided
// ---------------------------------------------------------------------------

describe("ErrorBanner — retry button presence", () => {
  it("shows a retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Network error" onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorBanner message="Network error" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. ErrorBanner does not render retry button when onRetry not provided
// ---------------------------------------------------------------------------

describe("ErrorBanner — no retry button when onRetry not provided", () => {
  it("does not render a Try again button", () => {
    render(<ErrorBanner message="Partial results" />);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. ErrorBanner partial variant renders differently
// ---------------------------------------------------------------------------

describe("ErrorBanner — partial variant styling", () => {
  it("uses apricot background for partial variant", () => {
    const { container } = render(
      <ErrorBanner message="The assistant hit its thinking limit. Some results may be incomplete." variant="partial" />
    );
    expect(container.firstChild).toHaveClass("bg-apricot");
  });

  it("does not use persimmon-soft for partial variant", () => {
    const { container } = render(
      <ErrorBanner message="The assistant hit its thinking limit. Some results may be incomplete." variant="partial" />
    );
    expect(container.firstChild).not.toHaveClass("bg-persimmon-soft");
  });

  it("partial variant uses ink text color", () => {
    const { container } = render(
      <ErrorBanner message="The assistant hit its thinking limit. Some results may be incomplete." variant="partial" />
    );
    expect(container.firstChild).toHaveClass("text-ink");
  });
});

// ---------------------------------------------------------------------------
// 5. SavedMealPlanScreen — no chat input (spec S2)
// ---------------------------------------------------------------------------

describe("SavedMealPlanScreen — no chat input", () => {
  it("does not render a chat input (spec S2: modifications are manual)", () => {
    renderWithSession(<SavedMealPlanScreen />);
    expect(screen.queryByPlaceholderText(/Add a dessert/i)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. SavedRecipeScreen — no chat input (spec S3)
// ---------------------------------------------------------------------------

describe("SavedRecipeScreen — no chat input", () => {
  it("does not render a chat input (spec S3: modifications via in-place edit)", () => {
    renderWithSession(<SavedRecipeScreen />);
    expect(screen.queryByPlaceholderText(/Adjust this recipe/i)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
