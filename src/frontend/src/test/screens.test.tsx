// Tests for Phase 2C screen components.
// Each screen is wrapped in MemoryRouter since they use useNavigate.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// ---------------------------------------------------------------------------
// Mock @base-ui/react/menu so DropdownMenu renders inline (no portal)
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
            return React.cloneElement(child as React.ReactElement<{ onToggle?: () => void; open?: boolean }>, {
              onToggle: () => setOpen((v) => !v),
              open,
            });
          }
          return child;
        })}
      </div>
    );
  }
  function MenuTrigger({ children, onToggle }: { children: React.ReactNode; onToggle?: () => void }) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, { onClick: onToggle });
  }
  function MenuPortal({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function MenuPositioner({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function MenuPopup({ children, open }: { children: React.ReactNode; open?: boolean }) {
    return open ? <div role="menu">{children}</div> : null;
  }
  function MenuItem({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
    return <div role="menuitem" onClick={onClick} style={{ cursor: "pointer" }}>{children}</div>;
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
      GroupLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Separator: () => <hr />,
      SubmenuRoot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      SubmenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      CheckboxItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <div role="menuitem" onClick={onClick}>{children}</div>,
      CheckboxItemIndicator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      RadioGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      RadioItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <div role="menuitem" onClick={onClick}>{children}</div>,
      RadioItemIndicator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
  };
});

// ---------------------------------------------------------------------------
// Mock @base-ui/react/dialog so Sheet renders inline (no portal)
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

import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { ScenarioProvider } from "@/context/scenario-context";

// Helper: render a screen with MemoryRouter + ScenarioProvider (defaults to bbq)
function renderWithRouter(
  ui: React.ReactElement,
  initialPath = "/"
) {
  return render(
    <ScenarioProvider>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </ScenarioProvider>
  );
}

// ---------------------------------------------------------------------------
// 1. HomeScreen
// ---------------------------------------------------------------------------
describe("HomeScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByTestId("screen-home")).toBeInTheDocument();
  });

  it("renders the main heading", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText(/What are you/i)).toBeInTheDocument();
  });

  it("renders the subtitle text", () => {
    renderWithRouter(<HomeScreen />);
    expect(
      screen.getByText(/Tell me what you have/i)
    ).toBeInTheDocument();
  });

  it("renders the Smart Grocery nav title", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText("Smart Grocery")).toBeInTheDocument();
  });

  it("renders the text input with placeholder", () => {
    renderWithRouter(<HomeScreen />);
    expect(
      screen.getByPlaceholderText(/BBQ for 8/i)
    ).toBeInTheDocument();
  });

  it("renders the Quick start label", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText(/Quick start/i)).toBeInTheDocument();
  });

  it("renders Weekend BBQ chip", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText("Weekend BBQ")).toBeInTheDocument();
  });

  it("renders Weeknight meals chip", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText("Weeknight meals")).toBeInTheDocument();
  });

  it("renders Use my leftovers chip", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText("Use my leftovers")).toBeInTheDocument();
  });

  it("renders footer with Vancouver text", () => {
    renderWithRouter(<HomeScreen />);
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });

  it("renders hamburger button", () => {
    renderWithRouter(<HomeScreen />);
    expect(
      screen.getByLabelText(/open menu/i)
    ).toBeInTheDocument();
  });

  it("opens sidebar when hamburger is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HomeScreen />);
    await user.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByText("Smart Grocery", { selector: "h2" })).toBeInTheDocument();
  });

  it("closes sidebar when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HomeScreen />);
    await user.click(screen.getByLabelText(/open menu/i));
    await user.click(screen.getByLabelText("Close sidebar"));
    expect(
      screen.queryByLabelText("Close sidebar")
    ).not.toBeInTheDocument();
  });

  it("renders sidebar with mock meal plan", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HomeScreen />);
    await user.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByText("BBQ weekend")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. ClarifyScreen
// ---------------------------------------------------------------------------
describe("ClarifyScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();
  });

  it("renders StepProgress with Clarify label", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText(/Step 2 of 4.*Clarify/i)).toBeInTheDocument();
  });

  it("renders the eyebrow pill", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText(/Your ingredients/i)).toBeInTheDocument();
  });

  it("renders the heading", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText(/Here's what I/i)).toBeInTheDocument();
  });

  it("renders the deck text", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText(/BBQ for 8/i)).toBeInTheDocument();
  });

  it("renders Protein PCV badge", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText("Protein")).toBeInTheDocument();
  });

  it("renders Carb PCV badge", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText("Carb")).toBeInTheDocument();
  });

  it("renders Veggie PCV badge", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText("Veggie")).toBeInTheDocument();
  });

  it("renders cooking setup question", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(
      screen.getByText(/What's your cooking setup/i)
    ).toBeInTheDocument();
  });

  it("renders Outdoor grill chip (pre-selected)", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText("Outdoor grill")).toBeInTheDocument();
  });

  it("renders dietary restrictions question", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(
      screen.getByText(/Any dietary restrictions/i)
    ).toBeInTheDocument();
  });

  it("renders None chip in dietary section", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("renders Halal chip", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText("Halal")).toBeInTheDocument();
  });

  it("renders chat input", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(
      screen.getByPlaceholderText(/kimchi/i)
    ).toBeInTheDocument();
  });

  it("renders show recipes button", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(
      screen.getByText(/show recipes/i)
    ).toBeInTheDocument();
  });

  it("renders PCV info button", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(
      screen.getByLabelText(/PCV info/i)
    ).toBeInTheDocument();
  });

  it("toggles cooking chip selection", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ClarifyScreen />);
    const oven = screen.getByText("Oven");
    await user.click(oven);
    expect(oven.className).toMatch(/shoyu|selected/);
  });

  it("renders footer", () => {
    renderWithRouter(<ClarifyScreen />);
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. RecipesScreen
// ---------------------------------------------------------------------------
describe("RecipesScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();
  });

  it("renders StepProgress with Recipes label", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText(/Step 3 of 4.*Recipes/i)).toBeInTheDocument();
  });

  it("renders header eyebrow", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText(/Saturday's Plan/i)).toBeInTheDocument();
  });

  it("renders heading", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText(/Your meal/i)).toBeInTheDocument();
  });

  it("renders Korean BBQ Pork Belly", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument();
  });

  it("renders CJK name for first dish", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText("韩式烤五花肉")).toBeInTheDocument();
  });

  it("renders Grilled Corn & Cucumber Salad", () => {
    renderWithRouter(<RecipesScreen />);
    expect(
      screen.getByText(/Grilled Corn/i)
    ).toBeInTheDocument();
  });

  it("renders Classic Smash Burgers", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument();
  });

  it("renders stat chips: 3 dishes, serves 8", () => {
    renderWithRouter(<RecipesScreen />);
    // Stat chips have <b>3</b> dishes — text is split across elements, use getAllByText
    expect(screen.getAllByText(/dishes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/serves/i).length).toBeGreaterThan(0);
  });

  it("renders chat input for refinement", () => {
    renderWithRouter(<RecipesScreen />);
    expect(
      screen.getByPlaceholderText(/Refine/i)
    ).toBeInTheDocument();
  });

  it("renders Save plan button", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText(/Save plan/i)).toBeInTheDocument();
  });

  it("renders Build list button", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText(/Build list/i)).toBeInTheDocument();
  });

  it("shows SwapPanel when Try another pill clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecipesScreen />);
    // Click "Try another" pill directly on the first recipe card
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    expect(screen.getByText("TRY INSTEAD")).toBeInTheDocument();
  });

  it("shows Asian Slaw in swap alternatives", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecipesScreen />);
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    expect(screen.getByText("Asian Slaw")).toBeInTheDocument();
  });

  it("shows Grilled Veggie Skewers in swap alternatives", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecipesScreen />);
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    expect(screen.getByText("Grilled Veggie Skewers")).toBeInTheDocument();
  });

  it("hides SwapPanel when keep original clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecipesScreen />);
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    await user.click(screen.getByText(/keep the original/i));
    expect(screen.queryByText("TRY INSTEAD")).not.toBeInTheDocument();
  });

  it("opens InfoSheet when info button clicked on first dish", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecipesScreen />);
    await user.click(
      screen.getByLabelText("Info about Korean BBQ Pork Belly")
    );
    expect(screen.getByText(/spicy/i)).toBeInTheDocument();
  });

  it("EN/中 language toggle is visible", () => {
    renderWithRouter(<RecipesScreen />);
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("中")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. GroceryScreen
// ---------------------------------------------------------------------------
describe("GroceryScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });

  it("renders StepProgress step 4", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/Step 4 of 4/i)).toBeInTheDocument();
  });

  it("renders header eyebrow BBQ weekend", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument();
  });

  it("renders heading", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/Your shopping/i)).toBeInTheDocument();
  });

  it("renders deck text with item count", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/8 items/i)).toBeInTheDocument();
  });

  it("does NOT render a By store toggle button", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.queryByRole("button", { name: /by store/i })).not.toBeInTheDocument();
    expect(screen.queryByText("By store")).not.toBeInTheDocument();
  });

  it("does NOT render a By aisle toggle button", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.queryByRole("button", { name: /by aisle/i })).not.toBeInTheDocument();
    expect(screen.queryByText("By aisle")).not.toBeInTheDocument();
  });

  it("shows Costco section directly without clicking anything", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText("COSTCO")).toBeInTheDocument();
  });

  it("shows Community Market section directly without clicking anything", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText("COMMUNITY MARKET")).toBeInTheDocument();
  });

  it("renders Corn on the cob item", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/Corn on the cob/i)).toBeInTheDocument();
  });

  it("renders Gochujang paste item", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/Gochujang paste/i)).toBeInTheDocument();
  });

  it("renders Cucumber item", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getAllByText(/Cucumber/i).length).toBeGreaterThan(0);
  });

  it("does NOT render PRODUCE aisle section (aisle view removed)", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.queryByText("PRODUCE")).not.toBeInTheDocument();
  });

  it("does NOT render DAIRY aisle section (aisle view removed)", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.queryByText("DAIRY")).not.toBeInTheDocument();
  });

  it("toggles item checked state", async () => {
    const user = userEvent.setup();
    renderWithRouter(<GroceryScreen />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "false");
    await user.click(checkboxes[0]);
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "true");
  });

  it("renders Save list button", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText("Save list")).toBeInTheDocument();
  });

  it("renders footer", () => {
    renderWithRouter(<GroceryScreen />);
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. SavedMealPlanScreen
// ---------------------------------------------------------------------------
describe("SavedMealPlanScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
  });

  it("renders a back button in the nav bar", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("renders SGA text in the nav bar", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText("SGA")).toBeInTheDocument();
  });

  it("renders the eyebrow saved date", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText(/Saved Mar 29/i)).toBeInTheDocument();
  });

  it("renders the plan heading", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument();
  });

  it("renders the deck text", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText(/3 recipes/i)).toBeInTheDocument();
  });

  it("renders Korean BBQ Pork Belly recipe row", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument();
  });

  it("renders Grilled Corn & Cucumber Salad row", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(
      screen.getByText(/Grilled Corn/i)
    ).toBeInTheDocument();
  });

  it("renders Classic Smash Burgers row", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument();
  });

  it("expands recipe detail when clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    await user.click(
      screen.getByRole("button", { name: /Korean BBQ Pork Belly/i })
    );
    // "char marks = done" is only in the detail block, not the meta
    expect(screen.getByText(/char marks/i)).toBeInTheDocument();
  });

  it("renders chat input for recipe questions", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(
      screen.getByPlaceholderText(/dessert/i)
    ).toBeInTheDocument();
  });

  it("renders footer", () => {
    renderWithRouter(<SavedMealPlanScreen />, "/saved/plan/1");
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. SavedRecipeScreen
// ---------------------------------------------------------------------------
describe("SavedRecipeScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByTestId("screen-saved-recipe")).toBeInTheDocument();
  });

  it("renders a back button in the nav bar", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("renders SGA text in the nav bar", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText("SGA")).toBeInTheDocument();
  });

  it("renders Edit button in the nav bar (top-right)", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    // Edit should be inside the nav bar, not in a separate toolbar
    const navBar = screen.getByTestId("saved-recipe-nav");
    expect(navBar.querySelector("button")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("does not render a separate toolbar section for Edit", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    // The old toolbar div between header and content should not exist
    expect(screen.queryByTestId("recipe-toolbar")).not.toBeInTheDocument();
  });

  it("renders recipe name", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(
      screen.getByText("Salt & Pepper Chicken Wings")
    ).toBeInTheDocument();
  });

  it("renders CJK name", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText("椒盐炸鸡翅")).toBeInTheDocument();
  });

  it("renders deck text", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText(/Chinese/i)).toBeInTheDocument();
  });

  it("renders jade pill for cooking method", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText("air fryer or oven")).toBeInTheDocument();
  });

  it("renders plain pill", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText(/Kenji/i)).toBeInTheDocument();
  });

  it("renders Edit button", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("renders recipe detail in view mode", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText(/baking powder/i)).toBeInTheDocument();
  });

  it("switches to edit mode when Edit clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    await user.click(screen.getByText("Edit"));
    // textarea is present (not just ChatInput's input)
    expect(screen.getByRole("textbox", { name: "" })).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("returns to view mode when Cancel clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    await user.click(screen.getByText("Edit"));
    await user.click(screen.getByText("Cancel"));
    // textarea is gone, only ChatInput's text input remains
    expect(screen.queryByRole("textbox", { name: "" })).not.toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("returns to view mode when Save clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    await user.click(screen.getByText("Edit"));
    await user.click(screen.getByText("Save"));
    expect(screen.queryByRole("textbox", { name: "" })).not.toBeInTheDocument();
  });

  it("renders chat input", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(
      screen.getByPlaceholderText(/Adjust this recipe/i)
    ).toBeInTheDocument();
  });

  it("renders footer", () => {
    renderWithRouter(<SavedRecipeScreen />, "/saved/recipe/1");
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. SavedGroceryListScreen
// ---------------------------------------------------------------------------
describe("SavedGroceryListScreen", () => {
  it("renders the screen container", () => {
    renderWithRouter(
      <SavedGroceryListScreen />,
      "/saved/list/1"
    );
    expect(
      screen.getByTestId("screen-saved-grocery-list")
    ).toBeInTheDocument();
  });

  it("renders a back button in the nav bar", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("renders SGA text in the nav bar", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByText("SGA")).toBeInTheDocument();
  });

  it("renders the header eyebrow", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByText(/Saved Mar 29/i)).toBeInTheDocument();
  });

  it("renders the list heading", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument();
  });

  it("renders Costco store section", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByText("COSTCO")).toBeInTheDocument();
  });

  it("renders Community Market store section", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByText("COMMUNITY MARKET")).toBeInTheDocument();
  });

  it("renders Corn on the cob item", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getAllByText(/Corn on the cob/i).length).toBeGreaterThan(0);
  });

  it("renders Green onion item", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getAllByText(/Green onion/i).length).toBeGreaterThan(0);
  });

  it("renders add item input for Costco section", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(
      screen.getByPlaceholderText(/Add to Costco/i)
    ).toBeInTheDocument();
  });

  it("renders add item input for Market section", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(
      screen.getByPlaceholderText(/Add to Market/i)
    ).toBeInTheDocument();
  });

  it("renders top-level add item row", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    // There should be an Add button in the page
    const addBtns = screen.getAllByText("Add");
    expect(addBtns.length).toBeGreaterThan(0);
  });

  it("can toggle a checklist item", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "false");
    await user.click(checkboxes[0]);
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "true");
  });

  it("can remove a checklist item", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    const initial = screen.getAllByText(/Corn on the cob/i);
    const removeBtn = screen.getAllByLabelText(/Remove Corn on the cob/i)[0];
    await user.click(removeBtn);
    // After removal the item should be gone
    expect(
      screen.queryAllByText(/Corn on the cob/i).length
    ).toBeLessThan(initial.length);
  });

  it("renders footer", () => {
    renderWithRouter(<SavedGroceryListScreen />, "/saved/list/1");
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});
