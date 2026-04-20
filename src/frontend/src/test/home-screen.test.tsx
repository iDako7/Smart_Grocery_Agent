// HomeScreen tests — issue #150 behavior changes
//
// Quick Start chip click pre-fills the input (no navigation) + the new Next
// button gates navigation on non-empty input.
//
// Per frontend CLAUDE.md: screen-level tests assert visible DOM + MSW/service
// spy contents, not internal state.

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";

import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { renderWithSession, createMockChatService } from "@/test/test-utils";

// api-client needs to be stubbed: HomeScreen fires fetchSidebarData on mount.
vi.mock("@/services/api-client", () => ({
  listSavedMealPlans: vi.fn().mockResolvedValue([]),
  listSavedRecipes: vi.fn().mockResolvedValue([]),
  listSavedGroceryLists: vi.fn().mockResolvedValue([]),
  getAuthToken: vi.fn().mockResolvedValue("test-token"),
  createSession: vi
    .fn()
    .mockResolvedValue({ session_id: "s1", created_at: "2026-01-01T00:00:00Z" }),
  resetAuthToken: vi.fn(),
}));

const PLACEHOLDER = "BBQ for 8, or I have leftover chicken...";

function homeRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/clarify" element={<ClarifyScreen />} />
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// Issue #150 — Home Quick Start
// ---------------------------------------------------------------------------

describe("HomeScreen — Quick Start chip pre-fills input without navigating", () => {
  it("clicking a chip loads its label into the input and does not leave the home screen", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<HomeScreen />, {
      chatService: mock.service,
      routes: homeRoutes(),
      initialPath: "/",
    });

    await user.click(screen.getByRole("button", { name: "Weekend BBQ" }));

    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
    expect(input.value).toBe("Weekend BBQ");

    // Still on home — no navigation fired, no chat service call yet.
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-clarify")).not.toBeInTheDocument();
    expect(mock.serviceFn).not.toHaveBeenCalled();
  });
});

describe("HomeScreen — Next button gates on non-empty input", () => {
  it("is disabled when input is empty and enabled once user types", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<HomeScreen />, {
      chatService: mock.service,
      initialPath: "/",
    });

    const next = screen.getByRole("button", { name: /^next/i });
    expect(next).toBeDisabled();

    const input = screen.getByPlaceholderText(PLACEHOLDER);
    await user.type(input, "Meal prep");
    expect(next).toBeEnabled();
  });

  it("becomes enabled after clicking a Quick Start chip", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<HomeScreen />, {
      chatService: mock.service,
      initialPath: "/",
    });

    expect(screen.getByRole("button", { name: /^next/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Weeknight meals" }));
    expect(screen.getByRole("button", { name: /^next/i })).toBeEnabled();
  });

  it("clicking Next with a non-empty input navigates to /clarify and sends the message", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<HomeScreen />, {
      chatService: mock.service,
      routes: homeRoutes(),
      initialPath: "/",
    });

    await user.click(screen.getByRole("button", { name: "Weekend BBQ" }));
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
    expect(mock.serviceFn).toHaveBeenCalledOnce();
    const [message, targetScreen] = mock.serviceFn.mock.calls[0];
    expect(message).toBe("Weekend BBQ");
    expect(targetScreen).toBe("clarify");
  });

  it("sends the edited text when the user modifies the pre-filled chip label", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<HomeScreen />, {
      chatService: mock.service,
      routes: homeRoutes(),
      initialPath: "/",
    });

    await user.click(screen.getByRole("button", { name: "Weekend BBQ" }));
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    await user.type(input, " for 8 people");

    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(mock.serviceFn).toHaveBeenCalledOnce();
    expect(mock.serviceFn.mock.calls[0][0]).toBe("Weekend BBQ for 8 people");
  });
});

describe("HomeScreen — Enter still submits (regression)", () => {
  it("pressing Enter with non-empty input navigates and sends the typed message", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(<HomeScreen />, {
      chatService: mock.service,
      routes: homeRoutes(),
      initialPath: "/",
    });

    const input = screen.getByPlaceholderText(PLACEHOLDER);
    await user.type(input, "leftover chicken{Enter}");

    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
    expect(mock.serviceFn).toHaveBeenCalledOnce();
    expect(mock.serviceFn.mock.calls[0][0]).toBe("leftover chicken");
  });
});
