// Weeknight Chicken scenario — Story 2 from product spec
// "I have leftover chicken wings, weeknight meals for a family of 4"
// PCV gap analysis: protein=ok (have chicken), carb=gap, veggie=low

import type { ScenarioShape } from "./bbq-weekend";
import type { PCSVResult } from "@/types/tools";

export const weeknightChicken: ScenarioShape = {
  // -------------------------------------------------------------------
  // ClarifyScreen data
  // -------------------------------------------------------------------
  clarify: {
    pcsv: {
      protein: { status: "ok", items: ["chicken wings", "chicken thighs"] },
      carb: { status: "gap", items: [] },
      veggie: { status: "low", items: ["ginger"] },
      sauce: { status: "ok", items: ["soy sauce", "garlic"] },
    } satisfies PCSVResult,
    deckText: "Leftover chicken · weeknight meals · serves 4",
    summaryText:
      "Protein covered with chicken, but missing carbs and short on veggies — add a grain and some fresh veg.",
  },

  // -------------------------------------------------------------------
  // RecipesScreen header
  // -------------------------------------------------------------------
  recipesHeader: {
    eyebrow: "Weeknight Plan",
    description:
      "Three quick dishes using your leftover chicken — fills your carb and veggie gaps with pantry staples.",
  },

  // -------------------------------------------------------------------
  // RecipesScreen recipe cards
  // -------------------------------------------------------------------
  recipes: [
    {
      index: 0,
      name: "Honey Garlic Chicken Wings",
      nameCjk: "蜂蜜蒜香鸡翅",
      flavorProfile: "Honey soy",
      cookingMethod: "Air fryer",
      time: "25 min",
      ingredients: [
        { name: "chicken wings", have: true },
        { name: "honey", have: false },
        { name: "garlic", have: true },
        { name: "soy sauce", have: true },
      ],
      infoFlavorTags: ["sweet", "savoury", "sticky"],
      infoDescription:
        "Crispy air-fryer wings glazed with honey and garlic. Fast weeknight favourite with a sticky, caramelized finish.",
    },
    {
      index: 1,
      name: "Chicken Fried Rice",
      nameCjk: "鸡肉炒饭",
      flavorProfile: "Wok hei",
      cookingMethod: "Wok",
      time: "20 min",
      ingredients: [
        { name: "chicken (shredded)", have: true },
        { name: "day-old rice", have: false },
        { name: "egg (2)", have: false },
        { name: "green onion", have: false },
        { name: "soy sauce", have: true },
      ],
      infoFlavorTags: ["umami", "smoky", "savoury"],
      infoDescription:
        "Classic fried rice using leftover chicken and day-old rice. High heat gives smoky wok-hei flavour.",
    },
    {
      index: 2,
      name: "Simple Stir-Fry Veggies",
      nameCjk: "清炒时蔬",
      flavorProfile: "Garlic + oyster sauce",
      cookingMethod: "Wok",
      time: "10 min",
      ingredients: [
        { name: "bok choy or gai lan", have: false },
        { name: "garlic (2 cloves)", have: true },
        { name: "oyster sauce", have: false },
      ],
      infoFlavorTags: ["fresh", "light", "garlicky"],
      infoDescription:
        "Quick Cantonese-style stir-fried greens with garlic and oyster sauce. Ready in 10 minutes, pairs with anything.",
    },
  ],

  // -------------------------------------------------------------------
  // RecipesScreen swap alternatives
  // -------------------------------------------------------------------
  swapAlternatives: [
    {
      name: "Steamed Rice",
      nameCjk: "白米饭",
      description: "Plain · pairs with wings · 20 min",
      flavorProfile: "Neutral",
      cookingMethod: "Simmer",
      time: "20 min",
      ingredients: [
        { name: "jasmine rice", have: false },
        { name: "water", have: true },
      ],
      infoFlavorTags: ["plain", "comforting"],
    },
    {
      name: "Macaroni Salad",
      nameCjk: "通心粉沙拉",
      description: "Cold side · 15 min",
      flavorProfile: "Creamy",
      cookingMethod: "Boil + chill",
      time: "15 min",
      ingredients: [
        { name: "macaroni", have: false },
        { name: "mayo", have: false },
        { name: "celery", have: false },
      ],
      infoFlavorTags: ["creamy", "cold", "hearty"],
    },
  ],

  // -------------------------------------------------------------------
  // GroceryScreen header
  // -------------------------------------------------------------------
  groceryHeader: {
    eyebrow: "Weeknight meals",
    deckText: "6 items · 1 store",
  },

  // -------------------------------------------------------------------
  // GroceryScreen items (smaller list, 1 store)
  // -------------------------------------------------------------------
  groceryItems: [
    {
      id: "wc1",
      name: "Honey",
      subtitle: "Liquid honey · for glaze",
      aisle: "condiments",
      store: "market",
    },
    {
      id: "wc2",
      name: "Day-old rice",
      subtitle: "Jasmine · 2 cups",
      aisle: "grains",
      store: "market",
    },
    {
      id: "wc3",
      name: "Eggs",
      subtitle: "6-pack · for fried rice",
      aisle: "dairy",
      store: "market",
    },
    {
      id: "wc4",
      name: "Green onion (bunch)",
      subtitle: "For garnish",
      aisle: "produce",
      store: "market",
    },
    {
      id: "wc5",
      name: "Bok choy",
      subtitle: "2 heads · stir-fry",
      aisle: "produce",
      store: "market",
    },
    {
      id: "wc6",
      name: "Oyster sauce",
      subtitle: "Lee Kum Kee · for stir-fry",
      aisle: "condiments",
      store: "market",
    },
  ],

  // -------------------------------------------------------------------
  // GroceryScreen aisle groups
  // -------------------------------------------------------------------
  aisleGroups: [
    { name: "Produce", hint: "Community Market", aisle: "produce" },
    { name: "Dairy", hint: "Community Market", aisle: "dairy" },
    { name: "Grains", hint: "Community Market", aisle: "grains" },
    { name: "Condiments", hint: "Community Market", aisle: "condiments" },
  ],

  // -------------------------------------------------------------------
  // SavedMealPlanScreen data
  // -------------------------------------------------------------------
  savedPlan: {
    name: "Weeknight chicken",
    savedDate: "Saved Apr 7",
    deckText: "3 recipes · air fryer + wok · serves 4",
    recipes: [
      {
        id: "wc-r1",
        name: "Honey Garlic Chicken Wings",
        meta: "Air fryer · Quick · 25 min",
        detail: `pat wings dry, season with salt and pepper

glaze:
  3 tbsp honey · 2 tbsp soy sauce
  4 cloves garlic, minced · 1 tsp rice vinegar

air fryer 200°C — 20 min, flip at 10
brush glaze last 5 min

serve immediately — sticky and crispy`,
      },
      {
        id: "wc-r2",
        name: "Chicken Fried Rice",
        meta: "Wok · Quick · 20 min",
        detail: `use cold day-old rice — breaks up better

heat wok high, add oil
scramble 2 eggs, push to side

add rice, press flat, let sit 30 sec
toss with eggs, add shredded chicken

season: 2 tbsp soy sauce, 1 tsp sesame oil
finish with green onion`,
      },
      {
        id: "wc-r3",
        name: "Simple Stir-Fry Veggies",
        meta: "Wok · Quick · 10 min",
        detail: `cut bok choy lengthwise, wash well

high heat wok, 2 tbsp oil
add 2 cloves minced garlic — 30 sec

add bok choy, toss 2-3 min
add 1 tbsp oyster sauce + splash water

toss to coat, serve immediately`,
      },
    ],
  },

  // -------------------------------------------------------------------
  // SavedRecipeScreen data
  // -------------------------------------------------------------------
  savedRecipe: {
    name: "Honey Garlic Chicken Wings",
    nameCjk: "蜂蜜蒜香鸡翅",
    deckText: "Chinese-Canadian · Quick · serves 4 · sweet, savoury, sticky",
    cookingMethodPill: "air fryer",
    sourcePill: "SGA suggestion",
    recipeText: `pat wings dry, season salt + pepper

glaze:
  3 tbsp honey · 2 tbsp soy sauce
  4 cloves garlic, minced · 1 tsp rice vinegar

air fryer 200°C — 20 min, flip at 10
brush glaze last 5 min — caramelizes fast

serve hot, garnish green onion`,
  },

  // -------------------------------------------------------------------
  // SavedGroceryListScreen data
  // -------------------------------------------------------------------
  savedGroceryList: {
    name: "Weeknight chicken",
    savedDate: "Saved Apr 7",
    items: [
      {
        id: "wsl1",
        name: "Honey",
        subtitle: "Liquid honey · condiments",
        store: "market",
      },
      {
        id: "wsl2",
        name: "Day-old rice",
        subtitle: "Jasmine · grains",
        store: "market",
      },
      {
        id: "wsl3",
        name: "Eggs",
        subtitle: "6-pack · dairy",
        store: "market",
      },
      {
        id: "wsl4",
        name: "Green onion (bunch)",
        subtitle: "For garnish · produce",
        store: "market",
      },
      {
        id: "wsl5",
        name: "Bok choy",
        subtitle: "2 heads · produce",
        store: "market",
      },
      {
        id: "wsl6",
        name: "Oyster sauce",
        subtitle: "Lee Kum Kee · condiments",
        store: "market",
      },
    ],
  },

  // -------------------------------------------------------------------
  // HomeScreen sidebar data
  // -------------------------------------------------------------------
  sidebar: {
    mealPlans: [
      { id: "plan-2", name: "Weeknight chicken", meta: "Apr 7 · 3 recipes" },
    ],
    savedRecipes: [
      {
        id: "rec-2",
        name: "Honey garlic wings",
        meta: "Chinese-Canadian · Quick · sweet, savoury",
      },
    ],
    groceryLists: [
      {
        id: "list-2",
        name: "Weeknight chicken list",
        meta: "Apr 7 · 6 items",
      },
    ],
  },
};
