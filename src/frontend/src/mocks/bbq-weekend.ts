// BBQ Weekend scenario — extracted from hardcoded screen data (Phase 2D)
// All data was previously inline in individual screen files.

import type { PCSVResult } from "@/types/tools";

// ---------------------------------------------------------------------------
// Shared recipe-card shape used by RecipesScreen
// ---------------------------------------------------------------------------
export interface RecipeCardData {
  index: number;
  name: string;
  nameCjk: string;
  flavorProfile: string;
  cookingMethod: string;
  time: string;
  ingredients: Array<{ name: string; have: boolean }>;
  infoFlavorTags: string[];
  infoDescription: string;
}

// ---------------------------------------------------------------------------
// Swap alternative shape used by RecipesScreen SwapPanel
// ---------------------------------------------------------------------------
export interface SwapAlternative {
  name: string;
  nameCjk: string;
  description: string;
  flavorProfile: string;
  cookingMethod: string;
  time: string;
  ingredients: Array<{ name: string; have: boolean }>;
  infoFlavorTags: string[];
}

// ---------------------------------------------------------------------------
// Grocery item shape used by GroceryScreen and SavedGroceryListScreen
// ---------------------------------------------------------------------------
export interface GroceryItemData {
  id: string;
  name: string;
  subtitle: string;
  aisle: string;
  store: "costco" | "market";
}

// ---------------------------------------------------------------------------
// Aisle group shape used by GroceryScreen (aisle view)
// ---------------------------------------------------------------------------
export interface AisleGroup {
  name: string;
  hint: string;
  aisle: string;
}

// ---------------------------------------------------------------------------
// Saved plan recipe shape used by SavedMealPlanScreen
// ---------------------------------------------------------------------------
export interface SavedPlanRecipe {
  id: string;
  name: string;
  meta: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Saved plan shape
// ---------------------------------------------------------------------------
export interface SavedPlanData {
  name: string;
  savedDate: string;
  deckText: string;
  recipes: SavedPlanRecipe[];
}

// ---------------------------------------------------------------------------
// Saved recipe shape used by SavedRecipeScreen
// ---------------------------------------------------------------------------
export interface SavedRecipeData {
  name: string;
  nameCjk: string;
  deckText: string;
  cookingMethodPill: string;
  sourcePill: string;
  recipeText: string;
}

// ---------------------------------------------------------------------------
// Saved grocery list item shape
// ---------------------------------------------------------------------------
export interface SavedGroceryItem {
  id: string;
  name: string;
  subtitle: string;
  store: "costco" | "market";
}

// ---------------------------------------------------------------------------
// Saved grocery list shape
// ---------------------------------------------------------------------------
export interface SavedGroceryListData {
  name: string;
  savedDate: string;
  items: SavedGroceryItem[];
}

// ---------------------------------------------------------------------------
// Sidebar item shape (matches Sidebar component's SidebarItem)
// ---------------------------------------------------------------------------
export interface SidebarItemData {
  id: string;
  name: string;
  meta: string;
}

// ---------------------------------------------------------------------------
// Clarify screen data
// ---------------------------------------------------------------------------
export interface ClarifyData {
  pcsv: PCSVResult;
  deckText: string;
  summaryText: string;
}

// ---------------------------------------------------------------------------
// Recipes header data
// ---------------------------------------------------------------------------
export interface RecipesHeaderData {
  eyebrow: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Grocery header data
// ---------------------------------------------------------------------------
export interface GroceryHeaderData {
  eyebrow: string;
  deckText: string;
}

// ---------------------------------------------------------------------------
// Top-level scenario shape
// ---------------------------------------------------------------------------
export interface ScenarioShape {
  clarify: ClarifyData;
  recipesHeader: RecipesHeaderData;
  recipes: RecipeCardData[];
  swapAlternatives: SwapAlternative[];
  groceryHeader: GroceryHeaderData;
  groceryItems: GroceryItemData[];
  aisleGroups: AisleGroup[];
  savedPlan: SavedPlanData;
  savedRecipe: SavedRecipeData;
  savedGroceryList: SavedGroceryListData;
  sidebar: {
    mealPlans: SidebarItemData[];
    savedRecipes: SidebarItemData[];
    groceryLists: SidebarItemData[];
  };
}

// ---------------------------------------------------------------------------
// BBQ Weekend data (previously hardcoded inline in each screen)
// ---------------------------------------------------------------------------
export const bbqWeekend: ScenarioShape = {
  // -------------------------------------------------------------------
  // ClarifyScreen data
  // -------------------------------------------------------------------
  clarify: {
    pcsv: {
      protein: { status: "ok", items: ["pork belly", "ground beef"] },
      carb: { status: "low", items: ["burger buns"] },
      veggie: { status: "gap", items: [] },
      sauce: { status: "ok", items: ["sesame oil"] },
    } satisfies PCSVResult,
    deckText: "BBQ for 8 · outdoor grill · this Saturday",
    summaryText:
      "Heavy on protein, light on carbs, almost no veggies — needs fresh sides.",
  },

  // -------------------------------------------------------------------
  // RecipesScreen header
  // -------------------------------------------------------------------
  recipesHeader: {
    eyebrow: "Saturday's Plan",
    description:
      "Three dishes for BBQ weekend — fills your veggie gap, leans on what you already have.",
  },

  // -------------------------------------------------------------------
  // RecipesScreen recipe cards
  // -------------------------------------------------------------------
  recipes: [
    {
      index: 0,
      name: "Korean BBQ Pork Belly",
      nameCjk: "韩式烤五花肉",
      flavorProfile: "Gochujang",
      cookingMethod: "Grill",
      time: "30 min",
      ingredients: [
        { name: "pork belly", have: true },
        { name: "gochujang", have: false },
      ],
      infoFlavorTags: ["spicy", "umami", "smoky"],
      infoDescription:
        "Marinated pork belly grilled at high heat. Gochujang caramelizes on the grill for deep, complex flavour.",
    },
    {
      index: 1,
      name: "Grilled Corn & Cucumber Salad",
      nameCjk: "烤玉米黄瓜沙拉",
      flavorProfile: "Rice vinegar",
      cookingMethod: "Grill + raw",
      time: "15 min",
      ingredients: [
        { name: "corn", have: false },
        { name: "cucumber", have: false },
        { name: "sesame oil", have: true },
      ],
      infoFlavorTags: ["fresh", "tangy", "crunchy"],
      infoDescription:
        "Charred corn kernels tossed with crunchy cucumber in a rice vinegar sesame dressing. Light and refreshing.",
    },
    {
      index: 2,
      name: "Classic Smash Burgers",
      nameCjk: "经典手压汉堡",
      flavorProfile: "Cast iron",
      cookingMethod: "Cast iron",
      time: "15 min",
      ingredients: [
        { name: "patties", have: true },
        { name: "buns", have: true },
        { name: "cheese", have: false },
        { name: "lettuce", have: false },
      ],
      infoFlavorTags: ["savoury", "juicy", "indulgent"],
      infoDescription:
        "Thin-smashed patties with crispy edges on cast iron. Simple, crowd-pleasing, and fast.",
    },
  ],

  // -------------------------------------------------------------------
  // RecipesScreen swap alternatives
  // -------------------------------------------------------------------
  swapAlternatives: [
    {
      name: "Asian Slaw",
      nameCjk: "亚式凉拌卷心菜",
      description: "Crunchy, tangy · 10 min",
      flavorProfile: "Rice vinegar",
      cookingMethod: "Raw",
      time: "10 min",
      ingredients: [
        { name: "cabbage", have: false },
        { name: "carrots", have: false },
        { name: "sesame oil", have: true },
        { name: "rice vinegar", have: false },
      ],
      infoFlavorTags: ["tangy", "crunchy", "fresh"],
    },
    {
      name: "Grilled Veggie Skewers",
      nameCjk: "烤蔬菜串",
      description: "Zucchini, pepper · 20 min",
      flavorProfile: "Smoky",
      cookingMethod: "Grill",
      time: "20 min",
      ingredients: [
        { name: "zucchini", have: false },
        { name: "bell pepper", have: false },
        { name: "olive oil", have: false },
      ],
      infoFlavorTags: ["smoky", "savoury", "light"],
    },
  ],

  // -------------------------------------------------------------------
  // GroceryScreen header
  // -------------------------------------------------------------------
  groceryHeader: {
    eyebrow: "BBQ weekend",
    deckText: "8 items · 2 stores",
  },

  // -------------------------------------------------------------------
  // GroceryScreen items
  // -------------------------------------------------------------------
  groceryItems: [
    {
      id: "cr1",
      name: "Corn on the cob",
      subtitle: "12-pack · for salad",
      aisle: "produce",
      store: "costco",
    },
    {
      id: "cr2",
      name: "Cheese slices",
      subtitle: "For burgers",
      aisle: "dairy",
      store: "costco",
    },
    {
      id: "cr3",
      name: "Gochujang paste",
      subtitle: "1 jar · for Korean BBQ",
      aisle: "international",
      store: "costco",
    },
    {
      id: "cr4",
      name: "Burger buns",
      subtitle: "12-pack · for burgers",
      aisle: "bakery",
      store: "costco",
    },
    {
      id: "cr5",
      name: "Cucumber (2)",
      subtitle: "For corn salad",
      aisle: "produce",
      store: "market",
    },
    {
      id: "cr6",
      name: "Fresh lettuce",
      subtitle: "For burgers",
      aisle: "produce",
      store: "market",
    },
    {
      id: "cr7",
      name: "Sesame oil (small)",
      subtitle: "For marinade",
      aisle: "condiments",
      store: "market",
    },
    {
      id: "cr8",
      name: "Green onion (bunch)",
      subtitle: "For garnish",
      aisle: "produce",
      store: "market",
    },
  ],

  // -------------------------------------------------------------------
  // GroceryScreen aisle groups
  // -------------------------------------------------------------------
  aisleGroups: [
    { name: "Produce", hint: "Costco + Market", aisle: "produce" },
    { name: "Dairy", hint: "Costco", aisle: "dairy" },
    { name: "Bakery", hint: "Costco", aisle: "bakery" },
    { name: "International", hint: "Costco", aisle: "international" },
    { name: "Condiments", hint: "Market", aisle: "condiments" },
  ],

  // -------------------------------------------------------------------
  // SavedMealPlanScreen data
  // -------------------------------------------------------------------
  savedPlan: {
    name: "BBQ weekend",
    savedDate: "Saved Mar 29",
    deckText: "3 recipes · outdoor grill · serves 8",
    recipes: [
      {
        id: "r1",
        name: "Korean BBQ Pork Belly",
        meta: "Gochujang · grill · Medium · 30 min",
        detail: `slice pork belly 3-4mm thick

marinade (30 min):
  2 tbsp gochujang · 1 tbsp soy sauce
  1 tbsp sesame oil · 2 cloves garlic, minced

grill high heat, 2-3 min/side
char marks = done

serve with rice, lettuce wraps`,
      },
      {
        id: "r2",
        name: "Grilled Corn & Cucumber Salad",
        meta: "Side · grill · Quick · 15 min",
        detail: `grill corn 10-12 min, turning often
let cool, slice kernels off cob

cucumber: slice thin, salt 5 min, pat dry

dressing:
  2 tbsp rice vinegar · 1 tbsp sesame oil
  1 tsp sugar · pinch chili flake

toss all, serve cold`,
      },
      {
        id: "r3",
        name: "Classic Smash Burgers",
        meta: "Cast iron · Quick · 15 min",
        detail: `heat cast iron until smoking

loosely ball 80g patty, place on pan
smash flat immediately — hold 10 sec

season salt + pepper
cook 90 sec, flip once, add cheese

toast buns cut-side down, 30 sec`,
      },
    ],
  },

  // -------------------------------------------------------------------
  // SavedRecipeScreen data
  // -------------------------------------------------------------------
  savedRecipe: {
    name: "Salt & Pepper Chicken Wings",
    nameCjk: "椒盐炸鸡翅",
    deckText: "Chinese · Long · serves 4 · salty, numbing, spicy",
    cookingMethodPill: "air fryer or oven",
    sourcePill: "Kenji / The Wok",
    recipeText: `baking powder : starch : salt = 1:1:0.5
toss wings to coat, rest 10 min

air fryer 200°C — 20 min, flip at 10
(or oven 220°C — 25 min on rack)

finish: sauté garlic, green onion, chili
toss wings in wok, 1 min high heat`,
  },

  // -------------------------------------------------------------------
  // SavedGroceryListScreen data
  // -------------------------------------------------------------------
  savedGroceryList: {
    name: "BBQ weekend",
    savedDate: "Saved Mar 29",
    items: [
      {
        id: "sl1",
        name: "Corn on the cob",
        subtitle: "12-pack · produce",
        store: "costco",
      },
      {
        id: "sl2",
        name: "Cheese slices",
        subtitle: "For burgers · dairy",
        store: "costco",
      },
      {
        id: "sl3",
        name: "Gochujang paste",
        subtitle: "1 jar · Korean foods",
        store: "costco",
      },
      {
        id: "sl4",
        name: "Burger buns",
        subtitle: "12-pack · bakery",
        store: "costco",
      },
      {
        id: "sl5",
        name: "Cucumber (2)",
        subtitle: "For corn salad · produce",
        store: "market",
      },
      {
        id: "sl6",
        name: "Fresh lettuce",
        subtitle: "For burgers · produce",
        store: "market",
      },
      {
        id: "sl7",
        name: "Sesame oil (small)",
        subtitle: "For marinade · condiments",
        store: "market",
      },
      {
        id: "sl8",
        name: "Green onion (bunch)",
        subtitle: "For garnish · produce",
        store: "market",
      },
    ],
  },

  // -------------------------------------------------------------------
  // HomeScreen sidebar data
  // -------------------------------------------------------------------
  sidebar: {
    mealPlans: [{ id: "plan-1", name: "BBQ weekend", meta: "Mar 29 · 3 recipes" }],
    savedRecipes: [
      {
        id: "rec-1",
        name: "Salt & pepper wings",
        meta: "Chinese · Long · salty, numbing",
      },
    ],
    groceryLists: [
      { id: "list-1", name: "BBQ weekend list", meta: "Mar 29 · 8 items" },
    ],
  },
};
