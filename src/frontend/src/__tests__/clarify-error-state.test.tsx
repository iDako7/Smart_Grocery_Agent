// clarify-error-state.test.tsx — TDD RED phase
//
// Tests for ClarifyScreen error state behavior:
//   1. When screenState is "error" and no pcsv data — PCV badges NOT rendered
//   2. When screenState is "error" and no pcsv data — "Looks good" button NOT rendered
//   3. When screenState is "error" and no pcsv data — error banner IS rendered with retry
//   4. When screenState is "idle" (no request sent) — scenario PCV data IS shown (preserve existing)
//   5. When screenState is "error" BUT pcsv data exists (partial) — PCV badges ARE shown alongside error banner

import { describe, it, expect } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { createMockChatService, renderWithSession } from "@/test/test-utils";

// ---------------------------------------------------------------------------
// Helper: drive ClarifyScreen into error state with no pcsv data
//
// Strategy: send a message (starts loading), then call onError immediately
// without emitting any pcsv_update event first. This matches the
// network-error-before-any-SSE scenario described in the bug report.
// ---------------------------------------------------------------------------

async function renderClarifyInErrorState(errorMessage = "Network error — please try again") {
  const user = userEvent.setup();
  const mock = createMockChatService();

  renderWithSession(<ClarifyScreen />, {
    chatService: mock.service,
    initialPath: "/clarify",
  });

  // Trigger sendMessage to start loading
  const chatInput = screen.getByPlaceholderText(/kimchi/i);
  await user.click(chatInput);
  await user.type(chatInput, "I have chicken and rice");
  await user.keyboard("{Enter}");

  // Fire the error callback immediately — no pcsv_update event emitted first
  act(() => {
    mock.getOnError()(errorMessage);
  });

  return { mock };
}

// ---------------------------------------------------------------------------
// Helper: drive ClarifyScreen into error state WITH pcsv data already received
//
// Strategy: send a message, emit a pcsv_update event (so screenData.pcsv != null),
// then call onError to simulate a partial-response error.
// ---------------------------------------------------------------------------

async function renderClarifyInErrorStateWithPcsv(errorMessage = "Partial results — some tools failed") {
  const user = userEvent.setup();
  const mock = createMockChatService();

  renderWithSession(<ClarifyScreen />, {
    chatService: mock.service,
    initialPath: "/clarify",
  });

  const chatInput = screen.getByPlaceholderText(/kimchi/i);
  await user.click(chatInput);
  await user.type(chatInput, "I have chicken and rice");
  await user.keyboard("{Enter}");

  // First emit a pcsv_update — this sets screenData.pcsv != null
  act(() => {
    mock.getOnEvent()({
      event_type: "pcsv_update",
      pcsv: {
        protein: { status: "ok", items: ["chicken"] },
        carb: { status: "gap", items: [] },
        veggie: { status: "ok", items: ["broccoli"] },
        sauce: { status: "ok", items: [] },
      },
    });
  });

  // Now fire the error — screen is in error state but has pcsv data
  act(() => {
    mock.getOnError()(errorMessage);
  });

  return { mock };
}

// ---------------------------------------------------------------------------
// Test 1: error + no pcsv → PCV badges NOT rendered
// ---------------------------------------------------------------------------

describe("ClarifyScreen — error state with no real data", () => {
  it("does NOT render PCV badges when error occurs before any pcsv_update", async () => {
    await renderClarifyInErrorState();

    // PcvBadge renders category name text — none should appear
    expect(screen.queryByText("Protein")).not.toBeInTheDocument();
    expect(screen.queryByText("Carb")).not.toBeInTheDocument();
    expect(screen.queryByText("Veggie")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 2: error + no pcsv → "Looks good" button NOT rendered
  // -------------------------------------------------------------------------

  it("does NOT render 'Looks good, show recipes' button when error has no pcsv data", async () => {
    await renderClarifyInErrorState();

    expect(
      screen.queryByRole("button", { name: /looks good/i })
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 3: error + no pcsv → error banner IS rendered with retry button
  // -------------------------------------------------------------------------

  it("renders error banner with retry button when error occurs before any pcsv_update", async () => {
    await renderClarifyInErrorState("Network error — please try again");

    // ErrorBanner renders with role="alert"
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Network error — please try again")
    ).toBeInTheDocument();

    // Retry button exists (onRetry is wired in error state)
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 4: idle state → scenario PCV data IS shown (preserve existing behavior)
// ---------------------------------------------------------------------------

describe("ClarifyScreen — idle state shows scenario fallback data", () => {
  it("renders PCV badges from scenario data when no request has been sent", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    // Default bbq scenario has pcsv data — badges should appear in idle state
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Carb")).toBeInTheDocument();
    expect(screen.getByText("Veggie")).toBeInTheDocument();
  });

  it("renders 'Looks good, show recipes' button in idle state", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    expect(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 5: error + pcsv exists (partial response) → PCV badges ARE shown
// alongside error banner
// ---------------------------------------------------------------------------

describe("ClarifyScreen — error state WITH partial pcsv data", () => {
  it("renders PCV badges when error occurs after a pcsv_update was already received", async () => {
    await renderClarifyInErrorStateWithPcsv();

    // Real pcsv data arrived before error — badges should still be visible
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Carb")).toBeInTheDocument();
    expect(screen.getByText("Veggie")).toBeInTheDocument();
  });

  it("renders both PCV badges and error banner in partial error state", async () => {
    await renderClarifyInErrorStateWithPcsv("Partial results — some tools failed");

    // PCV content visible
    expect(screen.getByText("Protein")).toBeInTheDocument();

    // Error banner visible alongside
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Partial results — some tools failed")
    ).toBeInTheDocument();
  });
});
