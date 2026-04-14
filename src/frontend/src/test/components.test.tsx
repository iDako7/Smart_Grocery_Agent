// Tests for Phase 2B shared components.
// All external dependencies (Sheet/Dialog portals) are mocked so tests run in jsdom.
// Base-ui mocks (menu + dialog) are in setup.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StepProgress } from "@/components/step-progress";
import { QuickStartChip } from "@/components/quick-start-chip";
import { PcvBadge } from "@/components/pcv-badge";
import { ChatInput } from "@/components/chat-input";
import { Sidebar } from "@/components/sidebar";
import { InfoSheet } from "@/components/info-sheet";
import { RecipeCard } from "@/components/recipe-card";
import { SwapPanel } from "@/components/swap-panel";
import { ChecklistRow } from "@/components/checklist-row";
import { StoreSection } from "@/components/store-section";
import { ExpandableRecipe } from "@/components/expandable-recipe";

// ---------------------------------------------------------------------------
// 1. StepProgress
// ---------------------------------------------------------------------------
describe("StepProgress", () => {
  it("renders without errors", () => {
    render(<StepProgress currentStep={2} totalSteps={4} label="Clarify" />);
    expect(screen.getByText("Step 2 of 4 — Clarify")).toBeInTheDocument();
  });

  it("renders the correct number of dots", () => {
    render(<StepProgress currentStep={1} totalSteps={4} label="Start" />);
    expect(screen.getByTestId("step-dot-1")).toBeInTheDocument();
    expect(screen.getByTestId("step-dot-4")).toBeInTheDocument();
  });

  it("marks steps before currentStep as done (jade)", () => {
    render(<StepProgress currentStep={3} totalSteps={4} label="Review" />);
    const dot1 = screen.getByTestId("step-dot-1");
    const dot2 = screen.getByTestId("step-dot-2");
    expect(dot1.className).toContain("bg-jade");
    expect(dot2.className).toContain("bg-jade");
  });

  it("marks currentStep dot as active (persimmon)", () => {
    render(<StepProgress currentStep={2} totalSteps={4} label="Clarify" />);
    const active = screen.getByTestId("step-dot-2");
    expect(active.className).toContain("bg-persimmon");
  });

  it("marks steps after currentStep as inactive (cream-deep)", () => {
    render(<StepProgress currentStep={2} totalSteps={4} label="Clarify" />);
    const dot3 = screen.getByTestId("step-dot-3");
    const dot4 = screen.getByTestId("step-dot-4");
    expect(dot3.className).toContain("bg-cream-deep");
    expect(dot4.className).toContain("bg-cream-deep");
  });

  it("renders step 1 of 1 without crashing", () => {
    render(<StepProgress currentStep={1} totalSteps={1} label="Only" />);
    expect(screen.getByText("Step 1 of 1 — Only")).toBeInTheDocument();
  });

  it("renders the label text", () => {
    render(<StepProgress currentStep={1} totalSteps={3} label="Shopping" />);
    expect(screen.getByText(/Shopping/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. QuickStartChip
// ---------------------------------------------------------------------------
describe("QuickStartChip", () => {
  it("renders the label", () => {
    render(<QuickStartChip label="Weekend BBQ" onClick={() => {}} />);
    expect(screen.getByText("Weekend BBQ")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<QuickStartChip label="Weeknight meals" onClick={onClick} />);
    await user.click(screen.getByText("Weeknight meals"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as a button element", () => {
    render(<QuickStartChip label="Test" onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders empty label without crashing", () => {
    render(<QuickStartChip label="" onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. PcvBadge
// ---------------------------------------------------------------------------
describe("PcvBadge", () => {
  it("renders category label for ok status", () => {
    render(<PcvBadge category="Protein" status="ok" />);
    expect(screen.getByText("Protein")).toBeInTheDocument();
  });

  it("renders category label for warn status", () => {
    render(<PcvBadge category="Carb" status="warn" />);
    expect(screen.getByText("Carb")).toBeInTheDocument();
  });

  it("renders category label for gap status", () => {
    render(<PcvBadge category="Veggie" status="gap" />);
    expect(screen.getByText("Veggie")).toBeInTheDocument();
  });

  it("ok status has jade-soft background class", () => {
    const { container } = render(<PcvBadge category="Protein" status="ok" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-jade-soft");
  });

  it("warn status has apricot background class", () => {
    const { container } = render(<PcvBadge category="Carb" status="warn" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-apricot/30");
  });

  it("gap status has persimmon-soft background class", () => {
    const { container } = render(<PcvBadge category="Veggie" status="gap" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-persimmon-soft");
  });

  it("ok icon shows checkmark symbol", () => {
    const { container } = render(<PcvBadge category="Protein" status="ok" />);
    const icon = container.querySelector("span span");
    expect(icon?.textContent).toBe("✓");
  });

  it("gap icon shows exclamation symbol", () => {
    const { container } = render(<PcvBadge category="Veggie" status="gap" />);
    const icon = container.querySelector("span span");
    expect(icon?.textContent).toBe("!");
  });
});

// ---------------------------------------------------------------------------
// 4. ChatInput
// ---------------------------------------------------------------------------
describe("ChatInput", () => {
  it("renders the placeholder text", () => {
    render(<ChatInput placeholder="Type something..." onSend={() => {}} />);
    expect(screen.getByPlaceholderText("Type something...")).toBeInTheDocument();
  });

  it("renders hint text when provided", () => {
    render(<ChatInput placeholder="..." hint="Press Enter to send" onSend={() => {}} />);
    expect(screen.getByText("Press Enter to send")).toBeInTheDocument();
  });

  it("does not render hint when not provided", () => {
    render(<ChatInput placeholder="..." onSend={() => {}} />);
    expect(screen.queryByText(/Press Enter/)).not.toBeInTheDocument();
  });

  it("calls onSend with trimmed value on Enter key", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput placeholder="..." onSend={onSend} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "  chicken tacos  {Enter}");
    expect(onSend).toHaveBeenCalledWith("chicken tacos");
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatInput placeholder="..." onSend={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.type(input, "hello{Enter}");
    expect(input.value).toBe("");
  });

  it("does not call onSend when input is empty or whitespace", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput placeholder="..." onSend={onSend} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders defaultValue in the input", () => {
    render(<ChatInput placeholder="..." onSend={() => {}} defaultValue="prefilled" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("prefilled");
  });

  it("shows send button when there is text", async () => {
    const user = userEvent.setup();
    render(<ChatInput placeholder="..." onSend={() => {}} />);
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "hello");
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("calls onSend when send button clicked", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput placeholder="..." onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "pizza");
    await user.click(screen.getByLabelText("Send message"));
    expect(onSend).toHaveBeenCalledWith("pizza");
  });
});

// ---------------------------------------------------------------------------
// 5. Sidebar
// ---------------------------------------------------------------------------
describe("Sidebar", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    mealPlans: [{ id: "1", name: "Week 1", meta: "3 recipes" }],
    savedRecipes: [{ id: "2", name: "Teriyaki", meta: "Saved Jan 1" }],
    groceryLists: [{ id: "3", name: "Weekend shop", meta: "12 items" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title when open", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Smart Grocery")).toBeInTheDocument();
  });

  it("renders meal plan items", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("3 recipes")).toBeInTheDocument();
  });

  it("renders saved recipe items", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Teriyaki")).toBeInTheDocument();
  });

  it("renders grocery list items", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Weekend shop")).toBeInTheDocument();
  });

  it("renders section headings", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Meal plans")).toBeInTheDocument();
    expect(screen.getByText("Saved recipes")).toBeInTheDocument();
    expect(screen.getByText("Grocery lists")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Sidebar {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByLabelText("Close sidebar"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render content when closed", () => {
    render(<Sidebar {...defaultProps} open={false} />);
    expect(screen.queryByText("Smart Grocery")).not.toBeInTheDocument();
  });

  it("renders empty sections without crashing", () => {
    render(
      <Sidebar
        open={true}
        onClose={() => {}}
        mealPlans={[]}
        savedRecipes={[]}
        groceryLists={[]}
      />
    );
    expect(screen.getByText("Smart Grocery")).toBeInTheDocument();
  });

  it("calls onItemClick with item id and type when item clicked", async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    render(<Sidebar {...defaultProps} onItemClick={onItemClick} />);
    await user.click(screen.getByText("Week 1"));
    // Sidebar now passes (id, type) so callers can build the correct route
    expect(onItemClick).toHaveBeenCalledWith("1", "plan");
  });
});

// ---------------------------------------------------------------------------
// 6. InfoSheet
// ---------------------------------------------------------------------------
describe("InfoSheet", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    name: "Teriyaki Chicken",
    nameCjk: "照烧鸡",
    flavorTags: ["savory", "umami", "sweet"],
    description: "A classic Japanese dish with a glossy glaze.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dish name when open", () => {
    render(<InfoSheet {...defaultProps} />);
    expect(screen.getByText("Teriyaki Chicken")).toBeInTheDocument();
  });

  it("renders CJK name", () => {
    render(<InfoSheet {...defaultProps} />);
    expect(screen.getByText("照烧鸡")).toBeInTheDocument();
  });

  it("renders all flavor tags", () => {
    render(<InfoSheet {...defaultProps} />);
    expect(screen.getByText("savory")).toBeInTheDocument();
    expect(screen.getByText("umami")).toBeInTheDocument();
    expect(screen.getByText("sweet")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<InfoSheet {...defaultProps} />);
    expect(screen.getByText("A classic Japanese dish with a glossy glaze.")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<InfoSheet {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render when closed", () => {
    render(<InfoSheet {...defaultProps} open={false} />);
    expect(screen.queryByText("Teriyaki Chicken")).not.toBeInTheDocument();
  });

  it("renders without CJK name", () => {
    render(<InfoSheet {...defaultProps} nameCjk={undefined} />);
    expect(screen.getByText("Teriyaki Chicken")).toBeInTheDocument();
    expect(screen.queryByText("照烧鸡")).not.toBeInTheDocument();
  });

  it("renders with empty flavor tags", () => {
    render(<InfoSheet {...defaultProps} flavorTags={[]} />);
    expect(screen.getByText("Teriyaki Chicken")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. RecipeCard
// ---------------------------------------------------------------------------
describe("RecipeCard", () => {
  const defaultProps = {
    index: 0,
    name: "Korean BBQ",
    nameCjk: "韩式烤肉",
    flavorProfile: "savory",
    cookingMethod: "grill",
    time: "30 min",
    ingredients: [
      { name: "chicken", have: true },
      { name: "gochujang", have: false },
    ],
    onSwap: vi.fn(),
    onInfoClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dish name", () => {
    render(<RecipeCard {...defaultProps} />);
    expect(screen.getByText("Korean BBQ")).toBeInTheDocument();
  });

  it("renders CJK name when lang=zh", () => {
    // CJK name is only rendered when lang prop is "zh".
    render(<RecipeCard {...defaultProps} lang="zh" />);
    expect(screen.getByText("韩式烤肉")).toBeInTheDocument();
  });

  it("does not render CJK name when lang=en (default)", () => {
    // Default lang is "en" — CJK name should not appear in the DOM.
    render(<RecipeCard {...defaultProps} />);
    expect(screen.queryByText("韩式烤肉")).not.toBeInTheDocument();
  });

  it("renders DISH ONE label for index 0", () => {
    render(<RecipeCard {...defaultProps} />);
    expect(screen.getByText("DISH ONE")).toBeInTheDocument();
  });

  it("renders DISH TWO label for index 1", () => {
    render(<RecipeCard {...defaultProps} index={1} />);
    expect(screen.getByText("DISH TWO")).toBeInTheDocument();
  });

  it("renders ingredient tags", () => {
    render(<RecipeCard {...defaultProps} />);
    expect(screen.getByText("chicken")).toBeInTheDocument();
    expect(screen.getByText("gochujang")).toBeInTheDocument();
  });

  it("renders meta information", () => {
    render(<RecipeCard {...defaultProps} />);
    expect(screen.getByText("savory")).toBeInTheDocument();
    expect(screen.getByText("grill")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("does NOT render an overflow menu trigger button", () => {
    render(<RecipeCard {...defaultProps} />);
    expect(screen.queryByLabelText("Recipe options")).not.toBeInTheDocument();
  });

  it("renders Try another as a visible pill button", () => {
    render(<RecipeCard {...defaultProps} />);
    expect(screen.getByText(/try another/i)).toBeInTheDocument();
  });

  it("calls onSwap when Try another pill is clicked", async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    render(<RecipeCard {...defaultProps} onSwap={onSwap} />);
    await user.click(screen.getByText(/try another/i));
    expect(onSwap).toHaveBeenCalledOnce();
  });

  it("hides Try another pill when isSwapping", () => {
    render(<RecipeCard {...defaultProps} isSwapping={true} />);
    expect(screen.queryByText(/try another/i)).not.toBeInTheDocument();
  });

  it("calls onInfoClick when info button clicked", async () => {
    const user = userEvent.setup();
    const onInfoClick = vi.fn();
    render(<RecipeCard {...defaultProps} onInfoClick={onInfoClick} />);
    await user.click(screen.getByLabelText("Info about Korean BBQ"));
    expect(onInfoClick).toHaveBeenCalledOnce();
  });

  it("shows SWAPPING state when isSwapping=true (no Try another pill)", () => {
    render(<RecipeCard {...defaultProps} isSwapping={true} />);
    expect(screen.getByText("SWAPPING")).toBeInTheDocument();
    expect(screen.queryByText(/try another/i)).not.toBeInTheDocument();
  });

  it("shows Try another pill when isSwapping=false", () => {
    render(<RecipeCard {...defaultProps} isSwapping={false} />);
    expect(screen.getByText(/try another/i)).toBeInTheDocument();
    expect(screen.queryByText("SWAPPING")).not.toBeInTheDocument();
  });

  it("renders without CJK name", () => {
    render(<RecipeCard {...defaultProps} nameCjk={undefined} />);
    expect(screen.getByText("Korean BBQ")).toBeInTheDocument();
  });

  it("renders with empty ingredients without crashing", () => {
    render(<RecipeCard {...defaultProps} ingredients={[]} />);
    expect(screen.getByText("Korean BBQ")).toBeInTheDocument();
  });

  it("shows swapping animation indicator", () => {
    render(<RecipeCard {...defaultProps} isSwapping={true} />);
    expect(screen.getByLabelText("swapping indicator")).toBeInTheDocument();
  });

  it("disables Try another when swapDisabled=true and does not fire onSwap on click", async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    render(<RecipeCard {...defaultProps} onSwap={onSwap} swapDisabled={true} />);
    const button = screen.getByRole("button", { name: /try another/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Coming soon");
    await user.click(button);
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("swapping state wins over swapDisabled", () => {
    render(<RecipeCard {...defaultProps} swapDisabled={true} isSwapping={true} />);
    expect(screen.getByLabelText("swapping indicator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try another/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. SwapPanel
// ---------------------------------------------------------------------------
describe("SwapPanel", () => {
  const defaultProps = {
    alternatives: [
      { name: "Tofu", nameCjk: "豆腐", description: "Plant-based protein" },
      { name: "Tempeh", description: "Fermented soy" },
    ],
    onPick: vi.fn(),
    onKeepOriginal: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TRY INSTEAD label", () => {
    render(<SwapPanel {...defaultProps} />);
    expect(screen.getByText("TRY INSTEAD")).toBeInTheDocument();
  });

  it("renders all alternative names", () => {
    render(<SwapPanel {...defaultProps} />);
    expect(screen.getByText("Tofu")).toBeInTheDocument();
    expect(screen.getByText("Tempeh")).toBeInTheDocument();
  });

  it("renders CJK name when provided", () => {
    render(<SwapPanel {...defaultProps} />);
    expect(screen.getByText("豆腐")).toBeInTheDocument();
  });

  it("renders descriptions", () => {
    render(<SwapPanel {...defaultProps} />);
    expect(screen.getByText("Plant-based protein")).toBeInTheDocument();
    expect(screen.getByText("Fermented soy")).toBeInTheDocument();
  });

  it("calls onPick with correct index when pick button clicked", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SwapPanel {...defaultProps} onPick={onPick} />);
    await user.click(screen.getByLabelText("Pick Tofu"));
    expect(onPick).toHaveBeenCalledWith(0);
  });

  it("calls onPick with index 1 for second alternative", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SwapPanel {...defaultProps} onPick={onPick} />);
    await user.click(screen.getByLabelText("Pick Tempeh"));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("calls onKeepOriginal when keep original clicked", async () => {
    const user = userEvent.setup();
    const onKeepOriginal = vi.fn();
    render(<SwapPanel {...defaultProps} onKeepOriginal={onKeepOriginal} />);
    await user.click(screen.getByText(/keep the original/));
    expect(onKeepOriginal).toHaveBeenCalledOnce();
  });

  it("renders with empty alternatives without crashing", () => {
    render(<SwapPanel alternatives={[]} onPick={() => {}} onKeepOriginal={() => {}} />);
    expect(screen.getByText("TRY INSTEAD")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. ChecklistRow
// ---------------------------------------------------------------------------
describe("ChecklistRow", () => {
  const defaultProps = {
    id: "item-1",
    name: "Chicken thighs",
    subtitle: "2 kg",
    checked: false,
    onToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders item name", () => {
    render(<ChecklistRow {...defaultProps} />);
    expect(screen.getByText("Chicken thighs")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<ChecklistRow {...defaultProps} />);
    expect(screen.getByText("2 kg")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", () => {
    render(<ChecklistRow {...defaultProps} subtitle={undefined} />);
    expect(screen.queryByText("2 kg")).not.toBeInTheDocument();
  });

  it("renders aisle tag when provided", () => {
    render(<ChecklistRow {...defaultProps} aisle="Meat" />);
    expect(screen.getByText("Meat")).toBeInTheDocument();
  });

  it("calls onToggle with id when checkbox clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ChecklistRow {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("item-1");
  });

  it("checkbox has aria-checked=false when unchecked", () => {
    render(<ChecklistRow {...defaultProps} checked={false} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });

  it("checkbox has aria-checked=true when checked", () => {
    render(<ChecklistRow {...defaultProps} checked={true} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("checked checkbox shows jade background", () => {
    render(<ChecklistRow {...defaultProps} checked={true} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.className).toContain("bg-jade");
  });

  it("unchecked checkbox does not have jade background", () => {
    render(<ChecklistRow {...defaultProps} checked={false} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.className).not.toContain("bg-jade");
  });

  it("name gets opacity-[0.38] when checked", () => {
    const { container } = render(<ChecklistRow {...defaultProps} checked={true} />);
    const nameEl = container.querySelector(".text-\\[13px\\]");
    expect(nameEl?.className).toContain("opacity-[0.38]");
  });

  it("name does not get opacity when unchecked", () => {
    const { container } = render(<ChecklistRow {...defaultProps} checked={false} />);
    const nameEl = container.querySelector(".text-\\[13px\\]");
    expect(nameEl?.className).not.toContain("opacity-[0.38]");
  });

  it("shows checkmark ✓ when checked", () => {
    render(<ChecklistRow {...defaultProps} checked={true} />);
    expect(screen.getByRole("checkbox").textContent).toBe("✓");
  });

  it("does not show remove button when onRemove not provided", () => {
    render(<ChecklistRow {...defaultProps} />);
    expect(screen.queryByLabelText("Remove Chicken thighs")).not.toBeInTheDocument();
  });

  it("shows remove button when onRemove provided", () => {
    render(<ChecklistRow {...defaultProps} onRemove={() => {}} />);
    expect(screen.getByLabelText("Remove Chicken thighs")).toBeInTheDocument();
  });

  it("calls onRemove with id when remove button clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ChecklistRow {...defaultProps} onRemove={onRemove} />);
    await user.click(screen.getByLabelText("Remove Chicken thighs"));
    expect(onRemove).toHaveBeenCalledWith("item-1");
  });
});

// ---------------------------------------------------------------------------
// 10. StoreSection
// ---------------------------------------------------------------------------
describe("StoreSection", () => {
  it("renders store name in header", () => {
    render(
      <StoreSection storeName="COSTCO">
        <div>Child content</div>
      </StoreSection>
    );
    expect(screen.getByText("COSTCO")).toBeInTheDocument();
  });

  it("renders children in body", () => {
    render(
      <StoreSection storeName="T&T">
        <div>Child content</div>
      </StoreSection>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("default variant has cream-deep background", () => {
    const { container } = render(
      <StoreSection storeName="Store">
        <span />
      </StoreSection>
    );
    const header = container.querySelector("[class*='bg-cream-deep']");
    expect(header).toBeInTheDocument();
  });

  it("renders multiple children", () => {
    render(
      <StoreSection storeName="Costco">
        <div>Item 1</div>
        <div>Item 2</div>
      </StoreSection>
    );
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 11. ExpandableRecipe
// ---------------------------------------------------------------------------
describe("ExpandableRecipe", () => {
  const defaultProps = {
    name: "Teriyaki Chicken",
    meta: "Japanese · pan-fry · 20 min",
    detail: "1. Marinate chicken\n2. Pan-fry until golden",
  };

  it("renders name", () => {
    render(<ExpandableRecipe {...defaultProps} />);
    expect(screen.getByText("Teriyaki Chicken")).toBeInTheDocument();
  });

  it("renders meta", () => {
    render(<ExpandableRecipe {...defaultProps} />);
    expect(screen.getByText("Japanese · pan-fry · 20 min")).toBeInTheDocument();
  });

  it("detail block is hidden initially", () => {
    render(<ExpandableRecipe {...defaultProps} />);
    expect(screen.queryByText(/Marinate chicken/)).not.toBeInTheDocument();
  });

  it("shows detail block when clicked", async () => {
    const user = userEvent.setup();
    render(<ExpandableRecipe {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /teriyaki chicken/i }));
    expect(screen.getByText(/Marinate chicken/)).toBeInTheDocument();
  });

  it("hides detail block when clicked again (toggle)", async () => {
    const user = userEvent.setup();
    render(<ExpandableRecipe {...defaultProps} />);
    const row = screen.getByRole("button", { name: /teriyaki chicken/i });
    await user.click(row);
    await user.click(row);
    expect(screen.queryByText(/Marinate chicken/)).not.toBeInTheDocument();
  });

  it("aria-expanded is false initially", () => {
    render(<ExpandableRecipe {...defaultProps} />);
    expect(screen.getByRole("button", { name: /teriyaki chicken/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("aria-expanded is true after click", async () => {
    const user = userEvent.setup();
    render(<ExpandableRecipe {...defaultProps} />);
    const row = screen.getByRole("button", { name: /teriyaki chicken/i });
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("renders remove button when onRemove provided", () => {
    render(<ExpandableRecipe {...defaultProps} onRemove={() => {}} />);
    expect(screen.getByLabelText("Remove Teriyaki Chicken")).toBeInTheDocument();
  });

  it("does not render remove button when onRemove not provided", () => {
    render(<ExpandableRecipe {...defaultProps} />);
    expect(screen.queryByLabelText("Remove Teriyaki Chicken")).not.toBeInTheDocument();
  });

  it("calls onRemove when remove button clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ExpandableRecipe {...defaultProps} onRemove={onRemove} />);
    await user.click(screen.getByLabelText("Remove Teriyaki Chicken"));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("clicking remove does not toggle the detail", async () => {
    const user = userEvent.setup();
    render(<ExpandableRecipe {...defaultProps} onRemove={() => {}} />);
    await user.click(screen.getByLabelText("Remove Teriyaki Chicken"));
    // Detail should still be hidden since only the remove button was clicked
    expect(screen.queryByText(/Marinate chicken/)).not.toBeInTheDocument();
  });

  it("chevron rotates 180deg when open", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpandableRecipe {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /teriyaki chicken/i }));
    const chevron = container.querySelector("[aria-hidden='true']");
    expect(chevron?.className).toContain("rotate-180");
  });

  it("responds to keyboard Enter to expand", async () => {
    const user = userEvent.setup();
    render(<ExpandableRecipe {...defaultProps} />);
    const row = screen.getByRole("button", { name: /teriyaki chicken/i });
    row.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Marinate chicken/)).toBeInTheDocument();
  });
});
