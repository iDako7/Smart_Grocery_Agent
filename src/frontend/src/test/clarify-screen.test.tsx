// ClarifyScreen integration tests — TDD RED → GREEN
// Written FIRST before implementation exists.
//
// Tests T5 and T6 covering:
//   T5: renders questions from clarifyTurn when screenState === "complete"
//   T6: "Looks good" builds dynamic message from question text + selections

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Base-ui mock (alert-dialog) must match the pattern in clarify-screen-confirm-reset.test.tsx
vi.mock("@base-ui/react/alert-dialog", async () => {
  const React = await import("react");
  type Props = { children?: React.ReactNode; className?: string };
  type RootProps = Props & {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  };
  const RootCtx = React.createContext<((v: boolean) => void) | undefined>(
    undefined
  );
  return {
    AlertDialog: {
      Root: ({ open, onOpenChange, children }: RootProps) => {
        React.useEffect(() => {
          if (!open) return;
          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange?.(false);
          };
          document.addEventListener("keydown", handleKeyDown);
          return () => document.removeEventListener("keydown", handleKeyDown);
        }, [open, onOpenChange]);
        return open ? (
          <RootCtx.Provider value={onOpenChange}>
            <div data-testid="alert-dialog-root">{children}</div>
          </RootCtx.Provider>
        ) : null;
      },
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
      Close: ({
        children,
        render: renderProp,
      }: Props & { render?: React.ReactElement }) => {
        const onOpenChange = React.useContext(RootCtx);
        const handleClick = () => onOpenChange?.(false);
        if (renderProp) {
          return React.cloneElement(
            renderProp as React.ReactElement<{ onClick?: () => void }>,
            { onClick: handleClick },
            children
          );
        }
        return <button onClick={handleClick}>{children}</button>;
      },
    },
  };
});

import React, { useEffect } from "react";
import { Routes, Route } from "react-router";

import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { renderWithSession, createMockChatService } from "@/test/test-utils";
import { useSessionOptional } from "@/context/session-context";
import type { ClarifyQuestion } from "@/types/sse";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

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
    { label: "Gluten-free", is_exclusive: false },
    { label: "None", is_exclusive: true },
  ],
};

// ---------------------------------------------------------------------------
// Helper component: drives the session state machine into complete + clarifyTurn
// by dispatching SSE events directly via useSessionOptional dispatch.
// This avoids needing a full SSE stream and sendMessage trigger.
// ---------------------------------------------------------------------------

function ClarifyWithClarifyTurn({ questions }: { questions: ClarifyQuestion[] }) {
  const session = useSessionOptional();

  useEffect(() => {
    if (!session) return;
    // Drive: idle → loading → streaming → complete (via clarify_turn event)
    session.dispatch({ type: "start_loading" });
    session.dispatch({ type: "start_streaming" });
    session.dispatch({
      type: "receive_event",
      event: {
        event_type: "clarify_turn",
        explanation: "I need a bit more info to suggest the best recipes.",
        questions,
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <ClarifyScreen />;
}

// ---------------------------------------------------------------------------
// T5: ClarifyScreen renders questions from clarifyTurn
// ---------------------------------------------------------------------------

describe("ClarifyScreen — T5: renders questions from clarifyTurn", () => {
  it("test_clarify_screen_renders_questions_from_clarify_turn", () => {
    const mock = createMockChatService();

    renderWithSession(<ClarifyWithClarifyTurn questions={[q1, q2]} />, {
      chatService: mock.service,
      initialPath: "/clarify",
    });

    // Both question texts should appear
    expect(screen.getByText("What's your cooking setup?")).toBeInTheDocument();
    expect(screen.getByText("Any dietary restrictions?")).toBeInTheDocument();

    // All 5 option labels (2 + 3) should appear as chip buttons
    expect(screen.getByTestId("chip-cooking_setup-Stovetop")).toBeInTheDocument();
    expect(
      screen.getByTestId("chip-cooking_setup-Outdoor grill")
    ).toBeInTheDocument();
    expect(screen.getByTestId("chip-dietary-Vegetarian")).toBeInTheDocument();
    expect(screen.getByTestId("chip-dietary-Gluten-free")).toBeInTheDocument();
    expect(screen.getByTestId("chip-dietary-None")).toBeInTheDocument();

    // "Looks good, show recipes →" button is visible
    expect(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T6: "Looks good" builds dynamic message from question text + selections
// ---------------------------------------------------------------------------

describe("ClarifyScreen — T6: Looks good builds dynamic message", () => {
  it("test_clarify_screen_looks_good_builds_dynamic_message", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    renderWithSession(
      <ClarifyWithClarifyTurn questions={[q1, q2]} />,
      {
        chatService: mock.service,
        routes: (
          <Routes>
            <Route
              path="/clarify"
              element={<ClarifyWithClarifyTurn questions={[q1, q2]} />}
            />
            <Route
              path="/recipes"
              element={<div data-testid="screen-recipes">Recipes</div>}
            />
          </Routes>
        ),
        initialPath: "/clarify",
      }
    );

    // Click q1's "Outdoor grill" chip
    await user.click(screen.getByTestId("chip-cooking_setup-Outdoor grill"));

    // Click q2's "Vegetarian" chip
    await user.click(screen.getByTestId("chip-dietary-Vegetarian"));

    // Click "Looks good" button
    await user.click(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    );

    // sendMessage triggers chatService — serviceFn captures the message arg
    expect(mock.serviceFn).toHaveBeenCalledOnce();
    const messageArg: string = mock.serviceFn.mock.calls[0][0];

    // Starts with "Looks good, show recipes."
    expect(messageArg).toMatch(/^Looks good, show recipes\./);

    // Contains q1 text and selection
    expect(messageArg).toContain("What's your cooking setup?");
    expect(messageArg).toContain("Outdoor grill");

    // Contains q2 text and selection
    expect(messageArg).toContain("Any dietary restrictions?");
    expect(messageArg).toContain("Vegetarian");
  });
});
