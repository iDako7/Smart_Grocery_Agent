// SwapPanel component tests — Phase 5 of issue #56

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SwapPanel } from "@/components/swap-panel";
import { makeRecipeSummary } from "@/test/fixtures/recipes";
import type { RecipeSummary } from "@/types/tools";

function makeAlt(overrides?: Partial<RecipeSummary>): RecipeSummary {
  return makeRecipeSummary(overrides);
}

describe("SwapPanel", () => {
  it("renders 2 alternatives when provided", () => {
    const alts = [
      makeAlt({ id: "r1", name: "Kung Pao Chicken" }),
      makeAlt({ id: "r2", name: "Mapo Tofu" }),
    ];
    render(
      <SwapPanel
        alternatives={alts}
        lang="en"
        onPick={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Kung Pao Chicken")).toBeInTheDocument();
    expect(screen.getByText("Mapo Tofu")).toBeInTheDocument();
  });

  it("renders name_zh when lang=zh and name_zh is present", () => {
    const alts = [
      makeAlt({ id: "r1", name: "Kung Pao Chicken", name_zh: "宮保雞丁" }),
    ];
    render(
      <SwapPanel
        alternatives={alts}
        lang="zh"
        onPick={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("宮保雞丁")).toBeInTheDocument();
  });

  it("does NOT render name_zh when lang=en", () => {
    const alts = [
      makeAlt({ id: "r1", name: "Kung Pao Chicken", name_zh: "宮保雞丁" }),
    ];
    render(
      <SwapPanel
        alternatives={alts}
        lang="en"
        onPick={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText("宮保雞丁")).not.toBeInTheDocument();
  });

  it("clicking an alternative button fires onPick with the correct RecipeSummary", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const alt1 = makeAlt({ id: "r1", name: "Kung Pao Chicken" });
    const alt2 = makeAlt({ id: "r2", name: "Mapo Tofu" });

    render(
      <SwapPanel
        alternatives={[alt1, alt2]}
        lang="en"
        onPick={onPick}
        onClose={() => {}}
      />
    );

    await user.click(screen.getByLabelText("Pick Mapo Tofu"));
    expect(onPick).toHaveBeenCalledWith(alt2);
  });

  it("empty state renders 'No alternatives available' and close button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SwapPanel
        alternatives={[]}
        lang="en"
        onPick={() => {}}
        onClose={onClose}
      />
    );
    expect(screen.getByTestId("swap-panel")).toBeInTheDocument();
    expect(screen.getByText("No alternatives available")).toBeInTheDocument();

    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc key triggers onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SwapPanel
        alternatives={[makeAlt({ id: "r1", name: "Kung Pao Chicken" })]}
        lang="en"
        onPick={() => {}}
        onClose={onClose}
      />
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the first alternative button on mount when non-empty", () => {
    const alt1 = makeAlt({ id: "r1", name: "Kung Pao Chicken" });
    const alt2 = makeAlt({ id: "r2", name: "Mapo Tofu" });
    render(
      <SwapPanel
        alternatives={[alt1, alt2]}
        lang="en"
        onPick={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByLabelText("Pick Kung Pao Chicken")).toHaveFocus();
  });
});
