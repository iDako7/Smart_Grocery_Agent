// SwapPanel component tests — UAT fixes for issue #56.
//
// Interaction model:
//   - Shows original recipe first (labeled "Current"), then alternatives
//   - Clicking any option fires onSelect AND onClose (auto-close on pick)
//   - X button dismisses without selecting (onClose only)
//   - Esc key also fires onClose

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SwapPanel } from "@/components/swap-panel";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import type { RecipeSummary } from "@/types/tools";

function makeR(overrides?: Partial<RecipeSummary>): RecipeSummary {
  return makeRecipeSummary(overrides);
}

const original = makeR({ id: "r0", name: "Original Recipe", name_zh: "原始菜" });
const alt1 = makeR({ id: "r1", name: "Kung Pao Chicken", name_zh: "宮保雞丁" });
const alt2 = makeR({ id: "r2", name: "Mapo Tofu", name_zh: "麻婆豆腐" });

describe("SwapPanel", () => {
  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  it("renders original recipe and all alternatives", () => {
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1, alt2]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Original Recipe")).toBeInTheDocument();
    expect(screen.getByText("Kung Pao Chicken")).toBeInTheDocument();
    expect(screen.getByText("Mapo Tofu")).toBeInTheDocument();
  });

  it("marks the original row with a 'Current' label", () => {
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("renders name_zh for all options when lang=zh", () => {
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1, alt2]}
        lang="zh"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("原始菜")).toBeInTheDocument();
    expect(screen.getByText("宮保雞丁")).toBeInTheDocument();
    expect(screen.getByText("麻婆豆腐")).toBeInTheDocument();
  });

  it("does NOT render name_zh when lang=en", () => {
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText("原始菜")).not.toBeInTheDocument();
    expect(screen.queryByText("宮保雞丁")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Radio-group selection behavior
  // ---------------------------------------------------------------------------

  it("currently selected option has aria-pressed=true, others have aria-pressed=false", () => {
    render(
      <SwapPanel
        original={original}
        selected={alt1}
        alternatives={[alt1, alt2]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /select kung pao chicken/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /select original recipe/i })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /select mapo tofu/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking an alternative fires onSelect with that recipe and auto-closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1, alt2]}
        lang="en"
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: /select mapo tofu/i }));
    expect(onSelect).toHaveBeenCalledWith(alt2);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // Auto-closes after pick
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the original row fires onSelect with the original recipe and auto-closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <SwapPanel
        original={original}
        selected={alt1}
        alternatives={[alt1]}
        lang="en"
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: /select original recipe/i }));
    expect(onSelect).toHaveBeenCalledWith(original);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Dismiss button (X)
  // ---------------------------------------------------------------------------

  it("renders an X dismiss button (aria-label='Close') and no 'keep the original' text", () => {
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByText(/keep the original/i)).not.toBeInTheDocument();
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1]}
        lang="en"
        onSelect={() => {}}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  it("Esc key triggers onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1]}
        lang="en"
        onSelect={() => {}}
        onClose={onClose}
      />
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Focus management
  // ---------------------------------------------------------------------------

  it("focuses the currently selected option button on mount (alt selected)", () => {
    render(
      <SwapPanel
        original={original}
        selected={alt1}
        alternatives={[alt1, alt2]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /select kung pao chicken/i })
    ).toHaveFocus();
  });

  it("focuses the original button on mount when selected is the original", () => {
    render(
      <SwapPanel
        original={original}
        selected={original}
        alternatives={[alt1]}
        lang="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /select original recipe/i })
    ).toHaveFocus();
  });
});
