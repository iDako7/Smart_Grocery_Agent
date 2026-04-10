// Stage 3 Phase 5 tests — ErrorBanner component + saved screen chat wiring.
// Written BEFORE implementation (RED phase). All tests should FAIL until
// ErrorBanner component is created and screen files are updated.

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Base-ui mocks (menu + dialog) are in setup.ts

import { ErrorBanner } from "@/components/error-banner";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { createMockChatService, renderWithSession } from "@/test/test-utils";

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
      <ErrorBanner message="Some results may be incomplete" variant="partial" />
    );
    expect(container.firstChild).toHaveClass("bg-apricot");
  });

  it("does not use persimmon-soft for partial variant", () => {
    const { container } = render(
      <ErrorBanner message="Some results may be incomplete" variant="partial" />
    );
    expect(container.firstChild).not.toHaveClass("bg-persimmon-soft");
  });

  it("partial variant uses ink text color", () => {
    const { container } = render(
      <ErrorBanner message="Some results may be incomplete" variant="partial" />
    );
    expect(container.firstChild).toHaveClass("text-ink");
  });
});

// ---------------------------------------------------------------------------
// 5. SavedMealPlanScreen — chat input calls sendMessage
// ---------------------------------------------------------------------------

describe("SavedMealPlanScreen — chat input calls sendMessage", () => {
  it("calls chatService when user types and submits the chat input", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<SavedMealPlanScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/Add a dessert/i);
    await user.click(chatInput);
    await user.type(chatInput, "Add a chocolate cake");
    await user.keyboard("{Enter}");

    expect(mock.serviceFn).toHaveBeenCalledTimes(1);
    expect(mock.serviceFn.mock.calls[0][0]).toBe("Add a chocolate cake");
  });

  it("does not call chatService when chat input is empty", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<SavedMealPlanScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/Add a dessert/i);
    await user.click(chatInput);
    await user.keyboard("{Enter}");

    expect(mock.serviceFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. SavedRecipeScreen — chat input calls sendMessage
// ---------------------------------------------------------------------------

describe("SavedRecipeScreen — chat input calls sendMessage", () => {
  it("calls chatService when user types and submits the chat input", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<SavedRecipeScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/Adjust this recipe/i);
    await user.click(chatInput);
    await user.type(chatInput, "Make it serve 12 people");
    await user.keyboard("{Enter}");

    expect(mock.serviceFn).toHaveBeenCalledTimes(1);
    expect(mock.serviceFn.mock.calls[0][0]).toBe("Make it serve 12 people");
  });

  it("does not call chatService when chat input is empty", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<SavedRecipeScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/Adjust this recipe/i);
    await user.click(chatInput);
    await user.keyboard("{Enter}");

    expect(mock.serviceFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. ClarifyScreen — shows error banner on error state
// ---------------------------------------------------------------------------

describe("ClarifyScreen — shows error banner on error state", () => {
  it("renders ErrorBanner when an error event is received", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Trigger sendMessage to start the session
    const chatInput = screen.getByPlaceholderText(/kimchi/i);
    await user.click(chatInput);
    await user.type(chatInput, "BBQ for 8");
    await user.keyboard("{Enter}");

    // Emit an error via onError callback
    act(() => {
      mock.getOnError()("Something went wrong with the AI");
    });

    expect(screen.getByText("Something went wrong with the AI")).toBeInTheDocument();
  });

  it("shows a Try again button in the error banner on ClarifyScreen", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/kimchi/i);
    await user.click(chatInput);
    await user.type(chatInput, "test input");
    await user.keyboard("{Enter}");

    act(() => {
      mock.getOnError()("Connection failed");
    });

    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. ClarifyScreen — shows partial banner on partial completion
// ---------------------------------------------------------------------------

describe("ClarifyScreen — shows partial banner on partial completion", () => {
  it("renders partial ErrorBanner when done with partial status", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/kimchi/i);
    await user.click(chatInput);
    await user.type(chatInput, "BBQ for 8");
    await user.keyboard("{Enter}");

    // Enter streaming state first
    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "Analyzing..." });
    });

    // Complete with partial status
    act(() => {
      mock.getOnDone()("partial", "timeout");
    });

    expect(
      screen.getByText(/Some results may be incomplete/i)
    ).toBeInTheDocument();
  });

  it("does not show retry button in partial banner on ClarifyScreen", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/kimchi/i);
    await user.click(chatInput);
    await user.type(chatInput, "BBQ for 8");
    await user.keyboard("{Enter}");

    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "Analyzing..." });
    });

    act(() => {
      mock.getOnDone()("partial", "timeout");
    });

    // Partial banner should NOT have a retry button
    expect(
      screen.queryByRole("button", { name: /try again/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. RecipesScreen — shows error banner on error state
// ---------------------------------------------------------------------------

describe("RecipesScreen — shows error banner on error state", () => {
  it("renders ErrorBanner when an error occurs during streaming", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<RecipesScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/Refine/i);
    await user.click(chatInput);
    await user.type(chatInput, "show recipes");
    await user.keyboard("{Enter}");

    act(() => {
      mock.getOnError()("Recipe lookup failed");
    });

    expect(screen.getByText("Recipe lookup failed")).toBeInTheDocument();
  });

  it("shows partial banner on RecipesScreen when done with partial status", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<RecipesScreen />, { chatService: mock.service });

    const chatInput = screen.getByPlaceholderText(/Refine/i);
    await user.click(chatInput);
    await user.type(chatInput, "show recipes");
    await user.keyboard("{Enter}");

    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "Searching..." });
    });

    act(() => {
      mock.getOnDone()("partial", "max_iterations");
    });

    expect(
      screen.getByText(/Some results may be incomplete/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 10. Error retry calls sendMessage
// ---------------------------------------------------------------------------

describe("ErrorBanner retry — calls sendMessage in ClarifyScreen", () => {
  it("clicking Try again in error banner calls sendMessage with 'retry'", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // First send to get into error state
    const chatInput = screen.getByPlaceholderText(/kimchi/i);
    await user.click(chatInput);
    await user.type(chatInput, "BBQ for 8");
    await user.keyboard("{Enter}");

    act(() => {
      mock.getOnError()("Network timeout");
    });

    // Reset call count before clicking retry
    mock.serviceFn.mockClear();

    // Click retry button
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    await user.click(retryBtn);

    expect(mock.serviceFn).toHaveBeenCalledTimes(1);
    expect(mock.serviceFn.mock.calls[0][0]).toBe("retry");
  });
});
