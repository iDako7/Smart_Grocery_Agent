// Tests for Phase 2C screen components.
// Each screen is wrapped in MemoryRouter since they use useNavigate.
// Base-ui mocks (menu + dialog) are in setup.ts

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { ScenarioProvider } from "@/context/scenario-context";

// Mock api-client so HomeScreen's fetchSidebarData resolves without hitting the network.
// All HomeScreen tests below work with empty sidebar lists except the one that
// explicitly opens the sidebar and checks for a meal plan name — which provides
// its own mock value via the module-level default below.
vi.mock("@/services/api-client", () => ({
  listSavedMealPlans: vi.fn().mockResolvedValue([
    { id: "p1", name: "BBQ weekend", recipe_count: 3, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  ]),
  listSavedRecipes: vi.fn().mockResolvedValue([]),
  listSavedGroceryLists: vi.fn().mockResolvedValue([]),
  getAuthToken: vi.fn().mockResolvedValue("test-token"),
  getSavedMealPlan: vi.fn().mockResolvedValue({
    id: "plan-1",
    name: "BBQ weekend",
    recipes: [
      { id: "r1", name: "Korean BBQ Pork Belly", name_zh: "韩式烤五花肉", source: "KB", source_url: "", cuisine: "Korean", cooking_method: "grill", effort_level: "medium", time_minutes: 30, flavor_tags: [], serves: 8, ingredients: [], instructions: "slice pork belly 3-4mm thick\n\ngrill high heat, 2-3 min/side\nchar marks = done", is_ai_generated: false },
      { id: "r2", name: "Grilled Corn & Cucumber Salad", name_zh: "烤玉米黄瓜沙拉", source: "KB", source_url: "", cuisine: "Side", cooking_method: "grill", effort_level: "quick", time_minutes: 15, flavor_tags: [], serves: 8, ingredients: [], instructions: "grill corn and toss with cucumber.", is_ai_generated: false },
      { id: "r3", name: "Classic Smash Burgers", name_zh: "经典手压汉堡", source: "KB", source_url: "", cuisine: "American", cooking_method: "cast iron", effort_level: "quick", time_minutes: 15, flavor_tags: [], serves: 8, ingredients: [], instructions: "smash and cook on cast iron.", is_ai_generated: false },
    ],
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T00:00:00Z",
  }),
  getSavedRecipe: vi.fn().mockResolvedValue({
    id: "recipe-1",
    recipe_snapshot: { id: "r-wings", name: "Salt & Pepper Chicken Wings", name_zh: "椒盐炸鸡翅", source: "Kenji / The Wok", source_url: "", cuisine: "Chinese", cooking_method: "air fryer or oven", effort_level: "long", time_minutes: 30, flavor_tags: [], serves: 4, ingredients: [], instructions: "baking powder : starch : salt = 1:1:0.5\ntoss wings to coat, rest 10 min", is_ai_generated: false },
    notes: "",
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T00:00:00Z",
  }),
  getSavedGroceryList: vi.fn().mockResolvedValue({
    id: "list-1",
    name: "BBQ weekend",
    stores: [
      { store_name: "Costco", departments: [{ name: "Produce", items: [
        { id: "sl1", name: "Corn on the cob", amount: "12-pack · produce", recipe_context: "", checked: false },
        { id: "sl2", name: "Cheese slices", amount: "For burgers · dairy", recipe_context: "", checked: false },
        { id: "sl3", name: "Gochujang paste", amount: "1 jar · Korean foods", recipe_context: "", checked: false },
        { id: "sl4", name: "Burger buns", amount: "12-pack · bakery", recipe_context: "", checked: false },
      ] }] },
      { store_name: "Community Market", departments: [{ name: "Produce", items: [
        { id: "sl5", name: "Cucumber (2)", amount: "For corn salad · produce", recipe_context: "", checked: false },
        { id: "sl6", name: "Fresh lettuce", amount: "For burgers · produce", recipe_context: "", checked: false },
        { id: "sl7", name: "Sesame oil (small)", amount: "For marinade · condiments", recipe_context: "", checked: false },
        { id: "sl8", name: "Green onion (bunch)", amount: "For garnish · produce", recipe_context: "", checked: false },
      ] }] },
    ],
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T00:00:00Z",
  }),
  createSession: vi.fn().mockResolvedValue({ session_id: "test-session", created_at: "2026-01-01T00:00:00Z" }),
  saveMealPlan: vi.fn().mockResolvedValue({}),
  saveGroceryList: vi.fn().mockResolvedValue({}),
  resetAuthToken: vi.fn(),
}));

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

// Helper: render a saved detail screen with a real route so useParams works.
// Used by SavedMealPlanScreen, SavedRecipeScreen, SavedGroceryListScreen tests.
function renderSavedWithRoute(
  routePattern: string,
  initialPath: string,
  element: React.ReactElement
) {
  return render(
    <ScenarioProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={routePattern} element={element} />
        </Routes>
      </MemoryRouter>
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

  it("renders CJK name for first dish after toggling to zh", () => {
    // CJK names are hidden by default (lang=en). Toggle to zh first.
    renderWithRouter(<RecipesScreen />);
    const toggleButton = screen.getByRole("button", { name: /toggle language/i });
    fireEvent.click(toggleButton);
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

  it("renders stat chip: dish count", () => {
    renderWithRouter(<RecipesScreen />);
    // Stat chip has <b>3</b> dishes — text is split across elements, use getAllByText
    expect(screen.getAllByText(/dishes/i).length).toBeGreaterThan(0);
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
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    expect(screen.getByTestId("screen-saved-meal-plan")).toBeInTheDocument();
  });

  it("renders a back button in the nav bar", () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("renders SGA text in the nav bar", () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    expect(screen.getByText("SGA")).toBeInTheDocument();
  });

  it("renders the eyebrow saved date", async () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    // Date is derived from created_at ISO string via toLocaleDateString().
    // We just verify the plan loads (heading visible) and the date badge wrapper renders.
    await waitFor(() =>
      expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument()
    );
    // The date badge is the inline-flex pill next to the plan name — it exists in the DOM
    const dateBadge = document.querySelector(".inline-flex");
    expect(dateBadge).not.toBeNull();
  });

  it("renders the plan heading", async () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    await waitFor(() =>
      expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument()
    );
  });

  it("renders the deck text", async () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    await waitFor(() =>
      expect(screen.getByText(/3 recipes/i)).toBeInTheDocument()
    );
  });

  it("renders Korean BBQ Pork Belly recipe row", async () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    await waitFor(() =>
      expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument()
    );
  });

  it("renders Grilled Corn & Cucumber Salad row", async () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Grilled Corn/i)).toBeInTheDocument()
    );
  });

  it("renders Classic Smash Burgers row", async () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    await waitFor(() =>
      expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument()
    );
  });

  it("expands recipe detail when clicked", async () => {
    const user = userEvent.setup();
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    // Wait for recipe rows to render first
    const expandButton = await waitFor(() => {
      const btn = screen
        .getAllByRole("button", { name: /Korean BBQ Pork Belly/i })
        .find((b) => b.hasAttribute("aria-expanded"))!;
      expect(btn).toBeTruthy();
      return btn;
    });
    await user.click(expandButton);
    // "char marks = done" is only in the detail block, not the meta
    expect(screen.getByText(/char marks/i)).toBeInTheDocument();
  });

  it("does not render a chat input (spec S2: no chat on saved screens)", () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    expect(screen.queryByPlaceholderText(/dessert/i)).not.toBeInTheDocument();
  });

  it("renders footer", () => {
    renderSavedWithRoute("/saved/plan/:id", "/saved/plan/1", <SavedMealPlanScreen />);
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. SavedRecipeScreen
// ---------------------------------------------------------------------------
describe("SavedRecipeScreen", () => {
  it("renders the screen container", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    expect(screen.getByTestId("screen-saved-recipe")).toBeInTheDocument();
  });

  it("renders a back button in the nav bar", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("renders SGA text in the nav bar", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    expect(screen.getByText("SGA")).toBeInTheDocument();
  });

  it("renders Edit button in the nav bar (top-right)", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    // Edit should be inside the nav bar, not in a separate toolbar
    const navBar = screen.getByTestId("saved-recipe-nav");
    expect(navBar.querySelector("button")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("does not render a separate toolbar section for Edit", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    // The old toolbar div between header and content should not exist
    expect(screen.queryByTestId("recipe-toolbar")).not.toBeInTheDocument();
  });

  it("renders recipe name", async () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText("Salt & Pepper Chicken Wings")).toBeInTheDocument()
    );
  });

  it("renders CJK name", async () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText("椒盐炸鸡翅")).toBeInTheDocument()
    );
  });

  it("renders deck text", async () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Chinese/i)).toBeInTheDocument()
    );
  });

  it("renders jade pill for cooking method", async () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText("air fryer or oven")).toBeInTheDocument()
    );
  });

  it("renders plain pill", async () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText(/Kenji/i)).toBeInTheDocument()
    );
  });

  it("renders Edit button", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("renders recipe detail in view mode", async () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText(/baking powder/i)).toBeInTheDocument()
    );
  });

  it("switches to edit mode when Edit clicked", async () => {
    const user = userEvent.setup();
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    // Wait for recipe to load before clicking Edit
    await waitFor(() =>
      expect(screen.getByText("Salt & Pepper Chicken Wings")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Edit"));
    // textarea is present (not just ChatInput's input)
    expect(screen.getByRole("textbox", { name: "" })).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("returns to view mode when Cancel clicked", async () => {
    const user = userEvent.setup();
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText("Salt & Pepper Chicken Wings")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Edit"));
    await user.click(screen.getByText("Cancel"));
    // textarea is gone (edit mode exited, no textboxes remain)
    expect(screen.queryByRole("textbox", { name: "" })).not.toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("returns to view mode when Save clicked", async () => {
    const user = userEvent.setup();
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    await waitFor(() =>
      expect(screen.getByText("Salt & Pepper Chicken Wings")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Edit"));
    await user.click(screen.getByText("Save"));
    expect(screen.queryByRole("textbox", { name: "" })).not.toBeInTheDocument();
  });

  it("does not render a chat input (spec S3: modifications via in-place edit)", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    expect(screen.queryByPlaceholderText(/Adjust this recipe/i)).not.toBeInTheDocument();
  });

  it("renders footer", () => {
    renderSavedWithRoute("/saved/recipe/:id", "/saved/recipe/1", <SavedRecipeScreen />);
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. SavedGroceryListScreen
// ---------------------------------------------------------------------------
describe("SavedGroceryListScreen", () => {
  it("renders the screen container", () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    expect(
      screen.getByTestId("screen-saved-grocery-list")
    ).toBeInTheDocument();
  });

  it("renders a back button in the nav bar", () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("renders SGA text in the nav bar", () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    expect(screen.getByText("SGA")).toBeInTheDocument();
  });

  it("renders the header eyebrow", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    // Date is derived from created_at via toLocaleDateString(); verify list loads and badge exists.
    await waitFor(() =>
      expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument()
    );
    const dateBadge = document.querySelector(".inline-flex");
    expect(dateBadge).not.toBeNull();
  });

  it("renders the list heading", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getByText(/BBQ weekend/i)).toBeInTheDocument()
    );
  });

  it("renders Costco store section", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getByText("COSTCO")).toBeInTheDocument()
    );
  });

  it("renders Community Market store section", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getByText("COMMUNITY MARKET")).toBeInTheDocument()
    );
  });

  it("renders Corn on the cob item", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getAllByText(/Corn on the cob/i).length).toBeGreaterThan(0)
    );
  });

  it("renders Green onion item", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getAllByText(/Green onion/i).length).toBeGreaterThan(0)
    );
  });

  it("renders add item input for Costco section", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Add to Costco/i)).toBeInTheDocument()
    );
  });

  it("renders add item input for Market section", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Add to Market/i)).toBeInTheDocument()
    );
  });

  it("renders top-level add item row", async () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() => {
      const addBtns = screen.getAllByText("Add");
      expect(addBtns.length).toBeGreaterThan(0);
    });
  });

  it("can toggle a checklist item", async () => {
    const user = userEvent.setup();
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0)
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "false");
    await user.click(checkboxes[0]);
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "true");
  });

  it("can remove a checklist item", async () => {
    const user = userEvent.setup();
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    const initial = await waitFor(() => {
      const items = screen.getAllByText(/Corn on the cob/i);
      expect(items.length).toBeGreaterThan(0);
      return items;
    });
    const removeBtn = screen.getAllByLabelText(/Remove Corn on the cob/i)[0];
    await user.click(removeBtn);
    // After removal the item should be gone
    expect(
      screen.queryAllByText(/Corn on the cob/i).length
    ).toBeLessThan(initial.length);
  });

  it("renders footer", () => {
    renderSavedWithRoute("/saved/list/:id", "/saved/list/1", <SavedGroceryListScreen />);
    expect(screen.getByText(/Vancouver/i)).toBeInTheDocument();
  });
});
