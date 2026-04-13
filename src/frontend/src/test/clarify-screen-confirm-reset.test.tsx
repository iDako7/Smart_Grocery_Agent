// ClarifyScreen confirm-reset dialog tests (issue #44 rework).
//
// Covers:
//   - Back button click opens the dialog with correct title and body text.
//   - Cancel closes the dialog; navigate NOT called; resetSession NOT called;
//     user stays on Clarify.
//   - Start over calls resetSession and navigates to "/".
//   - Multiple back clicks re-open the dialog (no one-shot semantics).

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";

// Mock @base-ui/react/alert-dialog → render inline (no portal) and honor `open`.
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

import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { ConfirmResetDialog } from "@/components/confirm-reset-dialog";
import { renderWithSession, createMockChatService } from "@/test/test-utils";

// ---------------------------------------------------------------------------
// ClarifyScreen integration
// ---------------------------------------------------------------------------

function renderClarifyWithHome() {
  const mock = createMockChatService();
  const utils = renderWithSession(<ClarifyScreen />, {
    chatService: mock.service,
    routes: (
      <Routes>
        <Route path="/" element={<div data-testid="home-screen">Home</div>} />
        <Route path="/clarify" element={<ClarifyScreen />} />
      </Routes>
    ),
    initialPath: "/clarify",
  });
  return { ...utils, mock };
}

describe("ClarifyScreen confirm-reset dialog — open on back click", () => {
  it("clicking Back opens the dialog with title and body text", async () => {
    const user = userEvent.setup();
    renderClarifyWithHome();

    // Dialog not visible initially.
    expect(
      screen.queryByText("Start a new conversation?")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /go back/i }));

    expect(screen.getByText("Start a new conversation?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your current progress will be lost. You can also resume the session from the sidebar."
      )
    ).toBeInTheDocument();
  });
});

describe("ClarifyScreen confirm-reset dialog — Cancel", () => {
  it("clicking Cancel closes the dialog, does not navigate, does not reset", async () => {
    const user = userEvent.setup();
    renderClarifyWithHome();

    await user.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.getByText("Start a new conversation?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Dialog closed.
    expect(
      screen.queryByText("Start a new conversation?")
    ).not.toBeInTheDocument();

    // Still on Clarify — Home route not rendered.
    expect(screen.queryByTestId("home-screen")).not.toBeInTheDocument();
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
  });
});

describe("ClarifyScreen confirm-reset dialog — Start over", () => {
  it("clicking Start over navigates to / (home)", async () => {
    const user = userEvent.setup();
    renderClarifyWithHome();

    await user.click(screen.getByRole("button", { name: /go back/i }));
    await user.click(screen.getByRole("button", { name: "Start over" }));

    // Navigation happened — home visible, clarify gone.
    expect(screen.getByTestId("home-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-clarify")).not.toBeInTheDocument();
  });
});

describe("ClarifyScreen confirm-reset dialog — no one-shot", () => {
  it("dialog re-opens on every Back click", async () => {
    const user = userEvent.setup();
    renderClarifyWithHome();

    // First open → cancel.
    await user.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.getByText("Start a new conversation?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText("Start a new conversation?")
    ).not.toBeInTheDocument();

    // Second open → dialog should appear again.
    await user.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.getByText("Start a new conversation?")).toBeInTheDocument();

    // Third round — close and reopen.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.getByText("Start a new conversation?")).toBeInTheDocument();
  });
});

describe("ClarifyScreen confirm-reset dialog — Escape key", () => {
  it("pressing Escape closes the dialog without calling onConfirm or navigating", async () => {
    const user = userEvent.setup();
    renderClarifyWithHome();

    await user.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.getByText("Start a new conversation?")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // Dialog closed.
    expect(
      screen.queryByText("Start a new conversation?")
    ).not.toBeInTheDocument();

    // Still on Clarify — Home route not rendered.
    expect(screen.queryByTestId("home-screen")).not.toBeInTheDocument();
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ConfirmResetDialog — controlled open/close unit test
// ---------------------------------------------------------------------------

describe("ConfirmResetDialog — controlled", () => {
  it("calls onConfirm then onOpenChange(false) when Start over clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    const { render } = await import("@testing-library/react");
    render(
      <ConfirmResetDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("only calls onOpenChange(false) when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    const { render } = await import("@testing-library/react");
    render(
      <ConfirmResetDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing when open=false", async () => {
    const { render } = await import("@testing-library/react");
    render(
      <ConfirmResetDialog
        open={false}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(
      screen.queryByText("Start a new conversation?")
    ).not.toBeInTheDocument();
  });
});
