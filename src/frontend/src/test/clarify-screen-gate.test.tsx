// ClarifyScreen "Looks good" gating — issue #150
//
// The CTA must remain disabled until every clarify question has at least one
// selected option. When there are zero questions, the CTA is immediately
// enabled (confirmation-only flow).

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useEffect } from "react";

// Inline base-ui/alert-dialog mock — same pattern as clarify-screen.test.tsx.
vi.mock("@base-ui/react/alert-dialog", async () => {
  const ReactLib = await import("react");
  type Props = { children?: React.ReactNode; className?: string };
  type RootProps = Props & {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  };
  const RootCtx = ReactLib.createContext<((v: boolean) => void) | undefined>(
    undefined
  );
  return {
    AlertDialog: {
      Root: ({ open, onOpenChange, children }: RootProps) =>
        open ? (
          <RootCtx.Provider value={onOpenChange}>
            <div data-testid="alert-dialog-root">{children}</div>
          </RootCtx.Provider>
        ) : null,
      Trigger: ({ children }: Props) => <>{children}</>,
      Portal: ({ children }: Props) => <>{children}</>,
      Backdrop: ({ children, className }: Props) => (
        <div className={className}>{children}</div>
      ),
      Popup: ({ children, className }: Props) => (
        <div className={className}>{children}</div>
      ),
      Title: ({ children, className }: Props) => (
        <h2 className={className}>{children}</h2>
      ),
      Description: ({ children, className }: Props) => (
        <p className={className}>{children}</p>
      ),
      Close: ({ children }: Props) => <button>{children}</button>,
    },
  };
});

import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { renderWithSession, createMockChatService } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import type { ClarifyQuestion } from "@/types/sse";

const q1: ClarifyQuestion = {
  id: "cooking_setup",
  text: "What's your cooking setup?",
  selection_mode: "single",
  options: [
    { label: "Stovetop", is_exclusive: false },
    { label: "Outdoor grill", is_exclusive: false },
  ],
};

const q2: ClarifyQuestion = {
  id: "dietary",
  text: "Any dietary restrictions?",
  selection_mode: "multi",
  options: [
    { label: "Vegetarian", is_exclusive: false },
    { label: "None", is_exclusive: true },
  ],
};

function ClarifyWith({ questions }: { questions: ClarifyQuestion[] }) {
  const session = useSessionOptional();
  useEffect(() => {
    if (!session) return;
    session.dispatch({ type: "start_loading" });
    session.dispatch({ type: "start_streaming" });
    session.dispatch({
      type: "receive_event",
      event: {
        event_type: "clarify_turn",
        explanation: "I need more info.",
        questions,
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <ClarifyScreen />;
}

describe("ClarifyScreen — Looks good gates on answering all questions", () => {
  it("is disabled when no question is answered", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyWith questions={[q1, q2]} />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    const btn = screen.getByRole("button", { name: /looks good, show recipes/i });
    expect(btn).toBeDisabled();
  });

  it("remains disabled when only one of two questions is answered", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderWithSession(<ClarifyWith questions={[q1, q2]} />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    await user.click(screen.getByTestId("chip-cooking_setup-Outdoor grill"));

    expect(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    ).toBeDisabled();
  });

  it("enables once every question has at least one selection", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderWithSession(<ClarifyWith questions={[q1, q2]} />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    await user.click(screen.getByTestId("chip-cooking_setup-Outdoor grill"));
    await user.click(screen.getByTestId("chip-dietary-Vegetarian"));

    expect(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    ).toBeEnabled();
  });

  it("clicking the disabled button does not send a message", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderWithSession(<ClarifyWith questions={[q1, q2]} />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    // Select just one, leaving the button disabled.
    await user.click(screen.getByTestId("chip-cooking_setup-Outdoor grill"));

    await user.click(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    );

    expect(mock.serviceFn).not.toHaveBeenCalled();
  });
});

describe("ClarifyScreen — Looks good is enabled immediately when there are zero questions", () => {
  it("renders the CTA enabled when clarifyTurn has no questions (confirmation-only flow)", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyWith questions={[]} />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    expect(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    ).toBeEnabled();
  });
});
