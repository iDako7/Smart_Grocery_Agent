import "@testing-library/jest-dom";
import { vi, beforeAll, afterEach, afterAll } from "vitest";
import { server } from "./msw/server";

// ---------------------------------------------------------------------------
// MSW lifecycle — intercepts unhandled requests with 'bypass' so existing
// vi.stubGlobal("fetch", ...) tests continue to work unchanged.
// TODO(#90): tighten to 'error' once B2 (#90) migrates remaining vi.stubGlobal("fetch") files
// ---------------------------------------------------------------------------
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Shared mock: @base-ui/react/menu — renders inline (no portal)
// Extracted from 4 test files to eliminate ~250 lines of duplication.
// Individual test files can still override with their own vi.mock if needed.
// ---------------------------------------------------------------------------
vi.mock("@base-ui/react/menu", async () => {
  const React = await import("react");
  const { useState } = React;
  function MenuRoot({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
      <div data-testid="menu-root">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(
              child as React.ReactElement<{
                onToggle?: () => void;
                open?: boolean;
              }>,
              {
                onToggle: () => setOpen((v: boolean) => !v),
                open,
              }
            );
          }
          return child;
        })}
      </div>
    );
  }
  function MenuTrigger({
    children,
    onToggle,
  }: {
    children: React.ReactNode;
    onToggle?: () => void;
  }) {
    return React.cloneElement(
      children as React.ReactElement<{ onClick?: () => void }>,
      { onClick: onToggle }
    );
  }
  function MenuPortal({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function MenuPositioner({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function MenuPopup({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) {
    return open ? <div role="menu">{children}</div> : null;
  }
  function MenuItem({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) {
    return (
      <div role="menuitem" onClick={onClick} style={{ cursor: "pointer" }}>
        {children}
      </div>
    );
  }
  return {
    Menu: {
      Root: MenuRoot,
      Trigger: MenuTrigger,
      Portal: MenuPortal,
      Positioner: MenuPositioner,
      Popup: MenuPopup,
      Item: MenuItem,
      Group: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      GroupLabel: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
      Separator: () => <hr />,
      SubmenuRoot: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
      SubmenuTrigger: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
      CheckboxItem: ({
        children,
        onClick,
      }: {
        children: React.ReactNode;
        onClick?: () => void;
      }) => (
        <div role="menuitem" onClick={onClick}>
          {children}
        </div>
      ),
      CheckboxItemIndicator: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
      RadioGroup: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
      RadioItem: ({
        children,
        onClick,
      }: {
        children: React.ReactNode;
        onClick?: () => void;
      }) => (
        <div role="menuitem" onClick={onClick}>
          {children}
        </div>
      ),
      RadioItemIndicator: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
    },
  };
});

// ---------------------------------------------------------------------------
// Shared mock: @base-ui/react/dialog — renders inline (no portal)
// Extracted from 7 test files to eliminate ~490 lines of duplication.
// ---------------------------------------------------------------------------
vi.mock("@base-ui/react/dialog", async () => {
  const React = await import("react");
  return {
    Dialog: {
      Root: ({
        open,
        children,
      }: {
        open?: boolean;
        onOpenChange?: (v: boolean) => void;
        children: React.ReactNode;
      }) => (open ? <div data-testid="sheet-root">{children}</div> : null),
      Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Close: ({
        children,
        render: renderProp,
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
      }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, {}, children);
        }
        return <button>{children}</button>;
      },
      Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Backdrop: ({
        children,
        className,
      }: {
        children?: React.ReactNode;
        className?: string;
      }) => <div className={className}>{children}</div>,
      Popup: ({
        children,
        className,
        "data-side": side,
      }: {
        children: React.ReactNode;
        className?: string;
        "data-side"?: string;
      }) => (
        <div className={className} data-side={side}>
          {children}
        </div>
      ),
      Title: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) => <h2 className={className}>{children}</h2>,
      Description: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) => <p className={className}>{children}</p>,
    },
  };
});
