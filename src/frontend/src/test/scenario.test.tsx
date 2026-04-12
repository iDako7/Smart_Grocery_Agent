// Phase 2D — Scenario mock data + context tests
// TDD: these tests are written BEFORE implementation (RED phase)

import React, { useEffect, useRef } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Base-ui mocks (menu + dialog) are in setup.ts

// ---------------------------------------------------------------------------
// 1. bbqWeekend mock data — shape & runtime checks
// ---------------------------------------------------------------------------
describe("bbqWeekend mock data", () => {
  it("exports bbqWeekend object", async () => {
    const mod = await import("@/mocks/bbq-weekend");
    expect(mod.bbqWeekend).toBeDefined();
    expect(typeof mod.bbqWeekend).toBe("object");
  });

  it("has clarify field with pcsv", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.clarify).toBeDefined();
    expect(bbqWeekend.clarify.pcsv).toBeDefined();
    expect(bbqWeekend.clarify.pcsv.protein).toBeDefined();
    expect(bbqWeekend.clarify.pcsv.carb).toBeDefined();
    expect(bbqWeekend.clarify.pcsv.veggie).toBeDefined();
    expect(bbqWeekend.clarify.pcsv.sauce).toBeDefined();
  });

  it("pcsv categories each have status and items array", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    const { protein, carb, veggie, sauce } = bbqWeekend.clarify.pcsv;
    for (const cat of [protein, carb, veggie, sauce]) {
      expect(cat).toHaveProperty("status");
      expect(["gap", "low", "ok"]).toContain(cat.status);
      expect(Array.isArray(cat.items)).toBe(true);
    }
  });

  it("has clarify.deckText string", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(typeof bbqWeekend.clarify.deckText).toBe("string");
    expect(bbqWeekend.clarify.deckText.length).toBeGreaterThan(0);
  });

  it("has clarify.summaryText string", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(typeof bbqWeekend.clarify.summaryText).toBe("string");
  });

  it("has recipes array with at least 3 items", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(Array.isArray(bbqWeekend.recipes)).toBe(true);
    expect(bbqWeekend.recipes.length).toBeGreaterThanOrEqual(3);
  });

  it("each recipe has required fields", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    for (const r of bbqWeekend.recipes) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.nameCjk).toBe("string");
      expect(typeof r.flavorProfile).toBe("string");
      expect(typeof r.cookingMethod).toBe("string");
      expect(typeof r.time).toBe("string");
      expect(Array.isArray(r.ingredients)).toBe(true);
      expect(Array.isArray(r.infoFlavorTags)).toBe(true);
      expect(typeof r.infoDescription).toBe("string");
    }
  });

  it("first recipe is Korean BBQ Pork Belly", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.recipes[0].name).toBe("Korean BBQ Pork Belly");
    expect(bbqWeekend.recipes[0].nameCjk).toBe("韩式烤五花肉");
  });

  it("has swapAlternatives array", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(Array.isArray(bbqWeekend.swapAlternatives)).toBe(true);
    expect(bbqWeekend.swapAlternatives.length).toBeGreaterThan(0);
  });

  it("each swap alternative has name, nameCjk, description", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    for (const alt of bbqWeekend.swapAlternatives) {
      expect(typeof alt.name).toBe("string");
      expect(typeof alt.nameCjk).toBe("string");
      expect(typeof alt.description).toBe("string");
    }
  });

  it("has groceryItems array", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(Array.isArray(bbqWeekend.groceryItems)).toBe(true);
    expect(bbqWeekend.groceryItems.length).toBeGreaterThan(0);
  });

  it("each grocery item has id, name, subtitle, aisle, store", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    for (const item of bbqWeekend.groceryItems) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.subtitle).toBe("string");
      expect(typeof item.aisle).toBe("string");
      expect(["costco", "market"]).toContain(item.store);
    }
  });

  it("has aisleGroups array", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(Array.isArray(bbqWeekend.aisleGroups)).toBe(true);
  });

  it("has savedPlan object", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.savedPlan).toBeDefined();
    expect(typeof bbqWeekend.savedPlan.name).toBe("string");
    expect(typeof bbqWeekend.savedPlan.savedDate).toBe("string");
    expect(typeof bbqWeekend.savedPlan.deckText).toBe("string");
    expect(Array.isArray(bbqWeekend.savedPlan.recipes)).toBe(true);
  });

  it("has savedRecipe object", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.savedRecipe).toBeDefined();
    expect(typeof bbqWeekend.savedRecipe.name).toBe("string");
    expect(typeof bbqWeekend.savedRecipe.nameCjk).toBe("string");
    expect(typeof bbqWeekend.savedRecipe.recipeText).toBe("string");
  });

  it("has savedGroceryList object", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.savedGroceryList).toBeDefined();
    expect(typeof bbqWeekend.savedGroceryList.name).toBe("string");
    expect(typeof bbqWeekend.savedGroceryList.savedDate).toBe("string");
    expect(Array.isArray(bbqWeekend.savedGroceryList.items)).toBe(true);
  });

  it("has sidebar object with mealPlans, savedRecipes, groceryLists", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.sidebar).toBeDefined();
    expect(Array.isArray(bbqWeekend.sidebar.mealPlans)).toBe(true);
    expect(Array.isArray(bbqWeekend.sidebar.savedRecipes)).toBe(true);
    expect(Array.isArray(bbqWeekend.sidebar.groceryLists)).toBe(true);
  });

  it("sidebar items have id, name, meta", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    for (const item of [
      ...bbqWeekend.sidebar.mealPlans,
      ...bbqWeekend.sidebar.savedRecipes,
      ...bbqWeekend.sidebar.groceryLists,
    ]) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.meta).toBe("string");
    }
  });

  it("has recipesHeader object", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.recipesHeader).toBeDefined();
    expect(typeof bbqWeekend.recipesHeader.eyebrow).toBe("string");
    expect(typeof bbqWeekend.recipesHeader.description).toBe("string");
  });

  it("has groceryHeader object", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(bbqWeekend.groceryHeader).toBeDefined();
    expect(typeof bbqWeekend.groceryHeader.eyebrow).toBe("string");
    expect(typeof bbqWeekend.groceryHeader.deckText).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 2. weeknightChicken mock data — shape & content checks
// ---------------------------------------------------------------------------
describe("weeknightChicken mock data", () => {
  it("exports weeknightChicken object", async () => {
    const mod = await import("@/mocks/weeknight-chicken");
    expect(mod.weeknightChicken).toBeDefined();
  });

  it("has the same top-level keys as bbqWeekend", async () => {
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    const bbqKeys = Object.keys(bbqWeekend).sort();
    const chickenKeys = Object.keys(weeknightChicken).sort();
    expect(chickenKeys).toEqual(bbqKeys);
  });

  it("has protein=ok, carb=gap or low, veggie=warn or low", async () => {
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    // Story 2: have chicken (protein ok), need carb + veggie
    expect(weeknightChicken.clarify.pcsv.protein.status).toBe("ok");
    expect(["gap", "low"]).toContain(weeknightChicken.clarify.pcsv.carb.status);
    expect(["gap", "low", "warn"]).toContain(weeknightChicken.clarify.pcsv.veggie.status);
  });

  it("first recipe contains Honey Garlic or similar chicken dish", async () => {
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    // Should have some chicken-themed recipe
    const hasChicken = weeknightChicken.recipes.some(
      (r) =>
        r.name.toLowerCase().includes("chicken") ||
        r.nameCjk.includes("鸡")
    );
    expect(hasChicken).toBe(true);
  });

  it("has 3 recipes", async () => {
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    expect(weeknightChicken.recipes.length).toBe(3);
  });

  it("grocery items only use costco or market store values", async () => {
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    for (const item of weeknightChicken.groceryItems) {
      expect(["costco", "market"]).toContain(item.store);
    }
  });

  it("savedRecipe has CJK name", async () => {
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    expect(weeknightChicken.savedRecipe.nameCjk).toBeTruthy();
    // Should contain CJK characters
    expect(/[\u4e00-\u9fff]/.test(weeknightChicken.savedRecipe.nameCjk)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. scenarios.ts — registry checks
// ---------------------------------------------------------------------------
describe("scenarios registry", () => {
  it("exports scenarios record with bbq and chicken keys", async () => {
    const { scenarios } = await import("@/mocks/scenarios");
    expect(scenarios).toBeDefined();
    expect(scenarios.bbq).toBeDefined();
    expect(scenarios.chicken).toBeDefined();
  });

  it("bbq scenario data matches bbqWeekend", async () => {
    const { scenarios } = await import("@/mocks/scenarios");
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");
    expect(scenarios.bbq).toBe(bbqWeekend);
  });

  it("chicken scenario data matches weeknightChicken", async () => {
    const { scenarios } = await import("@/mocks/scenarios");
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");
    expect(scenarios.chicken).toBe(weeknightChicken);
  });
});

// ---------------------------------------------------------------------------
// 4. ScenarioContext — provider + hook
// ---------------------------------------------------------------------------
describe("ScenarioProvider", () => {
  it("provides default 'bbq' scenario", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");

    let capturedScenario: unknown = null;
    function Consumer() {
      const ctx = useScenario();
      capturedScenario = ctx.scenario;
      return null;
    }

    render(
      <ScenarioProvider>
        <Consumer />
      </ScenarioProvider>
    );

    expect(capturedScenario).toBe(bbqWeekend);
  });

  it("provides scenarioKey='bbq' by default", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );

    let capturedKey: unknown = null;
    function Consumer() {
      const ctx = useScenario();
      capturedKey = ctx.scenarioKey;
      return null;
    }

    render(
      <ScenarioProvider>
        <Consumer />
      </ScenarioProvider>
    );

    expect(capturedKey).toBe("bbq");
  });

  it("setScenario switches to chicken scenario", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");

    let setScenarioFn: ((key: string) => void) | null = null;
    let capturedScenario: unknown = null;

    function Consumer() {
      const ctx = useScenario();
      capturedScenario = ctx.scenario;
      setScenarioFn = ctx.setScenario as (key: string) => void;
      return null;
    }

    render(
      <ScenarioProvider>
        <Consumer />
      </ScenarioProvider>
    );

    act(() => {
      setScenarioFn!("chicken");
    });

    expect(capturedScenario).toBe(weeknightChicken);
  });

  it("setScenario switches back to bbq scenario", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );
    const { bbqWeekend } = await import("@/mocks/bbq-weekend");

    let setScenarioFn: ((key: string) => void) | null = null;
    let capturedScenario: unknown = null;

    function Consumer() {
      const ctx = useScenario();
      capturedScenario = ctx.scenario;
      setScenarioFn = ctx.setScenario as (key: string) => void;
      return null;
    }

    render(
      <ScenarioProvider>
        <Consumer />
      </ScenarioProvider>
    );

    act(() => setScenarioFn!("chicken"));
    act(() => setScenarioFn!("bbq"));

    expect(capturedScenario).toBe(bbqWeekend);
  });

  it("updates scenarioKey when scenario is switched", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );

    let setScenarioFn: ((key: string) => void) | null = null;
    let capturedKey: unknown = null;

    function Consumer() {
      const ctx = useScenario();
      capturedKey = ctx.scenarioKey;
      setScenarioFn = ctx.setScenario as (key: string) => void;
      return null;
    }

    render(
      <ScenarioProvider>
        <Consumer />
      </ScenarioProvider>
    );

    act(() => setScenarioFn!("chicken"));
    expect(capturedKey).toBe("chicken");
  });
});

// ---------------------------------------------------------------------------
// 5. RecipesScreen — renders correct data from context
// ---------------------------------------------------------------------------
describe("RecipesScreen with ScenarioProvider", () => {
  it("renders BBQ recipe names under bbq scenario (default)", async () => {
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { RecipesScreen } = await import("@/screens/RecipesScreen");

    render(
      <ScenarioProvider>
        <MemoryRouter>
          <RecipesScreen />
        </MemoryRouter>
      </ScenarioProvider>
    );

    // English name always visible.
    expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument();
    // CJK name is hidden by default (lang=en). Toggle to zh to reveal it.
    const toggleButton = screen.getByRole("button", { name: /toggle language/i });
    fireEvent.click(toggleButton);
    expect(screen.getByText("韩式烤五花肉")).toBeInTheDocument();
  });

  it("renders chicken recipe names under chicken scenario", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );
    const { RecipesScreen } = await import("@/screens/RecipesScreen");
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");

    // Wrapper that immediately switches to chicken
    function Switcher({ children }: { children: React.ReactNode }) {
      const { setScenario } = useScenario();
      const switched = useRef(false);
      useEffect(() => {
        if (!switched.current) {
          switched.current = true;
          setScenario("chicken");
        }
      }, [setScenario]);
      return <>{children}</>;
    }

    render(
      <ScenarioProvider>
        <MemoryRouter>
          <Switcher>
            <RecipesScreen />
          </Switcher>
        </MemoryRouter>
      </ScenarioProvider>
    );

    // After effect runs, screen should show chicken recipe
    const firstChickenRecipeName = weeknightChicken.recipes[0].name;
    // Wait for the effect
    await screen.findByText(firstChickenRecipeName);
    expect(screen.getByText(firstChickenRecipeName)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. ScenarioSwitcher component — dev-only toggle
// ---------------------------------------------------------------------------
describe("ScenarioSwitcher component", () => {
  it("renders when import.meta.env.DEV is true", async () => {
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { ScenarioSwitcher } = await import("@/components/scenario-switcher");

    render(
      <ScenarioProvider>
        <ScenarioSwitcher />
      </ScenarioProvider>
    );

    // Should render the switcher container
    expect(screen.getByTestId("scenario-switcher")).toBeInTheDocument();
  });

  it("shows current scenario name", async () => {
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { ScenarioSwitcher } = await import("@/components/scenario-switcher");

    render(
      <ScenarioProvider>
        <ScenarioSwitcher />
      </ScenarioProvider>
    );

    // Should display 'bbq' (default)
    expect(screen.getByText(/bbq/i)).toBeInTheDocument();
  });

  it("toggles to chicken when clicked", async () => {
    const user = userEvent.setup();
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { ScenarioSwitcher } = await import("@/components/scenario-switcher");

    render(
      <ScenarioProvider>
        <ScenarioSwitcher />
      </ScenarioProvider>
    );

    const btn = screen.getByTestId("scenario-switcher");
    await user.click(btn);
    expect(screen.getByText(/chicken/i)).toBeInTheDocument();
  });

  it("toggles back to bbq on second click", async () => {
    const user = userEvent.setup();
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { ScenarioSwitcher } = await import("@/components/scenario-switcher");

    render(
      <ScenarioProvider>
        <ScenarioSwitcher />
      </ScenarioProvider>
    );

    const btn = screen.getByTestId("scenario-switcher");
    await user.click(btn);
    await user.click(btn);
    expect(screen.getByText(/bbq/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. ClarifyScreen — reads pcsv data from context
// ---------------------------------------------------------------------------
describe("ClarifyScreen with ScenarioProvider", () => {
  it("renders BBQ deck text under bbq scenario", async () => {
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { ClarifyScreen } = await import("@/screens/ClarifyScreen");

    render(
      <ScenarioProvider>
        <MemoryRouter>
          <ClarifyScreen />
        </MemoryRouter>
      </ScenarioProvider>
    );

    expect(screen.getByText(/BBQ for 8/i)).toBeInTheDocument();
  });

  it("renders chicken deck text under chicken scenario", async () => {
    const { ScenarioProvider, useScenario } = await import(
      "@/context/scenario-context"
    );
    const { ClarifyScreen } = await import("@/screens/ClarifyScreen");
    const { weeknightChicken } = await import("@/mocks/weeknight-chicken");

    function Switcher({ children }: { children: React.ReactNode }) {
      const { setScenario } = useScenario();
      useEffect(() => {
        setScenario("chicken");
      }, [setScenario]);
      return <>{children}</>;
    }

    render(
      <ScenarioProvider>
        <MemoryRouter>
          <Switcher>
            <ClarifyScreen />
          </Switcher>
        </MemoryRouter>
      </ScenarioProvider>
    );

    // Wait for the deck text to update
    await screen.findByText(weeknightChicken.clarify.deckText);
    expect(screen.getByText(weeknightChicken.clarify.deckText)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. HomeScreen sidebar data comes from scenario context
// ---------------------------------------------------------------------------
describe("HomeScreen sidebar with ScenarioProvider", () => {
  it("renders BBQ weekend meal plan in sidebar under bbq scenario", async () => {
    const user = userEvent.setup();
    const { ScenarioProvider } = await import("@/context/scenario-context");
    const { HomeScreen } = await import("@/screens/HomeScreen");

    render(
      <ScenarioProvider>
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      </ScenarioProvider>
    );

    await user.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByText("BBQ weekend")).toBeInTheDocument();
  });
});
