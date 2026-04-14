// Test: TypeScript contracts compile and have correct shapes.
// These tests use the TypeScript type system itself as the assertion mechanism —
// if the types are wrong the compile step in `bun run build` (and vitest) fails.
// Runtime assertions provide a second layer: shape checks on literal values.

import type {
  PCSVRole,
  PCSVStatus,
  EffortLevel,
  MatchQuality,
  SubstitutionReason,
  TranslateDirection,
  TranslateMatchType,
  ProfileField,
  Store,
  PCSVCategory,
  PCSVResult,
  Ingredient,
  RecipeSummary,
  RecipeDetail,
  StoreProduct,
  Substitution,
  UserProfile,
  UpdateUserProfileResult,
  TranslateTermResult,
} from "@/types/tools";

import type {
  GroceryItem,
  GroceryDepartment,
  GroceryStore,
  ThinkingEvent,
  PcsvUpdateEvent,
  RecipeCardEvent,
  ExplanationEvent,
  GroceryListEvent,
  ErrorEvent,
  DoneEvent,
  SSEEvent,
} from "@/types/sse";

import type {
  Screen,
  ChatRequest,
  ConversationTurn,
  SessionStateResponse,
  SavedMealPlan,
  SavedMealPlanSummary,
  SavedRecipe,
  SavedRecipeSummary,
  SavedGroceryList,
  SavedGroceryListSummary,
  SaveMealPlanRequest,
  UpdateMealPlanRequest,
  SaveRecipeRequest,
  UpdateSavedRecipeRequest,
  SaveGroceryListRequest,
  UpdateGroceryListRequest,
  CreateSessionRequest,
  CreateSessionResponse,
  SendCodeRequest,
  SendCodeResponse,
  VerifyRequest,
  VerifyResponse,
} from "@/types/api";

describe("tools.ts — literal union types", () => {
  it("PCSVRole covers the 4 expected values", () => {
    const roles: PCSVRole[] = ["protein", "carb", "veggie", "sauce"];
    expect(roles).toHaveLength(4);
  });

  it("PCSVStatus covers gap | low | ok", () => {
    const statuses: PCSVStatus[] = ["gap", "low", "ok"];
    expect(statuses).toHaveLength(3);
  });

  it("EffortLevel covers quick | medium | long", () => {
    const levels: EffortLevel[] = ["quick", "medium", "long"];
    expect(levels).toHaveLength(3);
  });

  it("MatchQuality covers good | fair | poor", () => {
    const qualities: MatchQuality[] = ["good", "fair", "poor"];
    expect(qualities).toHaveLength(3);
  });

  it("SubstitutionReason covers unavailable | dietary | preference", () => {
    const reasons: SubstitutionReason[] = [
      "unavailable",
      "dietary",
      "preference",
    ];
    expect(reasons).toHaveLength(3);
  });

  it("TranslateDirection covers en_to_zh | zh_to_en | auto", () => {
    const dirs: TranslateDirection[] = ["en_to_zh", "zh_to_en", "auto"];
    expect(dirs).toHaveLength(3);
  });

  it("TranslateMatchType covers exact | partial | none", () => {
    const types: TranslateMatchType[] = ["exact", "partial", "none"];
    expect(types).toHaveLength(3);
  });

  it("ProfileField covers all 6 field names", () => {
    const fields: ProfileField[] = [
      "household_size",
      "dietary_restrictions",
      "preferred_cuisines",
      "disliked_ingredients",
      "preferred_stores",
      "notes",
    ];
    expect(fields).toHaveLength(6);
  });

  it("Store covers costco | community_market", () => {
    const stores: Store[] = ["costco", "community_market"];
    expect(stores).toHaveLength(2);
  });
});

describe("tools.ts — output model shapes", () => {
  it("PCSVCategory has status and items fields", () => {
    const cat: PCSVCategory = { status: "ok", items: ["chicken"] };
    expect(cat.status).toBe("ok");
    expect(cat.items).toEqual(["chicken"]);
  });

  it("PCSVResult has all 4 PCSV categories", () => {
    const result: PCSVResult = {
      protein: { status: "ok", items: ["chicken"] },
      carb: { status: "gap", items: [] },
      veggie: { status: "low", items: ["spinach"] },
      sauce: { status: "ok", items: ["soy sauce"] },
    };
    expect(result.protein.status).toBe("ok");
    expect(result.carb.status).toBe("gap");
    expect(result.veggie.items).toEqual(["spinach"]);
    expect(result.sauce.items).toEqual(["soy sauce"]);
  });

  it("Ingredient has name, amount, and pcsv array", () => {
    const ing: Ingredient = { name: "chicken", amount: "500g", pcsv: ["protein"] };
    expect(ing.name).toBe("chicken");
    expect(ing.pcsv).toContain("protein");
  });

  it("RecipeSummary has required id, name, and effort_level", () => {
    const recipe: RecipeSummary = {
      id: "r001",
      name: "Teriyaki Chicken",
      name_zh: "照烧鸡",
      cuisine: "Japanese",
      cooking_method: "pan-fry",
      effort_level: "medium",
      flavor_tags: ["savory", "umami"],
      serves: 4,
      pcsv_roles: { protein: ["chicken"] },
      ingredients_have: ["chicken"],
      ingredients_need: ["mirin"],
    };
    expect(recipe.id).toBe("r001");
    expect(recipe.effort_level).toBe("medium");
  });

  it("RecipeDetail has ingredients array and is_ai_generated flag", () => {
    const detail: RecipeDetail = {
      id: "r001",
      name: "Teriyaki Chicken",
      name_zh: "",
      source: "KB",
      source_url: "",
      cuisine: "Japanese",
      cooking_method: "pan-fry",
      effort_level: "quick",
      time_minutes: 20,
      flavor_tags: [],
      serves: 2,
      ingredients: [],
      instructions: "Cook the chicken.",
      is_ai_generated: false,
    };
    expect(detail.is_ai_generated).toBe(false);
    expect(Array.isArray(detail.ingredients)).toBe(true);
  });

  it("Substitution has substitute, match_quality, and notes", () => {
    const sub: Substitution = {
      substitute: "tofu",
      match_quality: "fair",
      notes: "lower protein",
    };
    expect(sub.match_quality).toBe("fair");
  });

  it("UserProfile has all 6 fields with correct types", () => {
    const profile: UserProfile = {
      household_size: 3,
      dietary_restrictions: ["gluten-free"],
      preferred_cuisines: ["Korean"],
      disliked_ingredients: ["cilantro"],
      preferred_stores: ["costco"],
      notes: "allergic to nuts",
    };
    expect(profile.household_size).toBe(3);
    expect(profile.dietary_restrictions).toContain("gluten-free");
  });

  it("TranslateTermResult has all 4 fields", () => {
    const result: TranslateTermResult = {
      term: "chicken",
      translation: "鸡肉",
      direction: "en_to_zh",
      match_type: "exact",
    };
    expect(result.translation).toBe("鸡肉");
    expect(result.direction).toBe("en_to_zh");
  });

  it("UpdateUserProfileResult has updated flag and new_value", () => {
    const result: UpdateUserProfileResult = {
      updated: true,
      field: "household_size",
      new_value: 3,
    };
    expect(result.updated).toBe(true);
  });

  it("StoreProduct has name, size, department, store, alternatives", () => {
    const product: StoreProduct = {
      name: "Chicken Thighs",
      size: "2kg",
      department: "Meat",
      store: "costco",
      alternatives: [],
    };
    expect(product.store).toBe("costco");
  });
});

describe("sse.ts — grocery structure", () => {
  it("GroceryItem has id, name, amount, recipe_context, checked", () => {
    const item: GroceryItem = {
      id: "item-1",
      name: "Chicken thighs",
      amount: "2kg",
      recipe_context: "for Korean BBQ",
      checked: false,
    };
    expect(item.id).toBe("item-1");
    expect(item.checked).toBe(false);
  });

  it("GroceryDepartment has name and items array", () => {
    const dept: GroceryDepartment = {
      name: "Meat",
      items: [
        {
          id: "item-1",
          name: "Chicken",
          amount: "1kg",
          recipe_context: "",
          checked: false,
        },
      ],
    };
    expect(dept.name).toBe("Meat");
    expect(dept.items).toHaveLength(1);
  });

  it("GroceryStore has store_name and departments array", () => {
    const store: GroceryStore = { store_name: "Costco", departments: [] };
    expect(store.store_name).toBe("Costco");
  });
});

describe("sse.ts — event types", () => {
  it("ThinkingEvent has event_type='thinking' and message", () => {
    const evt: ThinkingEvent = { event_type: "thinking", message: "Analyzing..." };
    expect(evt.event_type).toBe("thinking");
  });

  it("PcsvUpdateEvent has event_type='pcsv_update' and pcsv", () => {
    const evt: PcsvUpdateEvent = {
      event_type: "pcsv_update",
      pcsv: {
        protein: { status: "ok", items: [] },
        carb: { status: "gap", items: [] },
        veggie: { status: "low", items: [] },
        sauce: { status: "ok", items: [] },
      },
    };
    expect(evt.event_type).toBe("pcsv_update");
  });

  it("RecipeCardEvent has event_type='recipe_card' and recipe", () => {
    const evt: RecipeCardEvent = {
      event_type: "recipe_card",
      recipe: {
        id: "r001",
        name: "Test Recipe",
        name_zh: "",
        cuisine: "",
        cooking_method: "",
        effort_level: "quick",
        flavor_tags: [],
        serves: 2,
        pcsv_roles: {},
        ingredients_have: [],
        ingredients_need: [],
      },
    };
    expect(evt.event_type).toBe("recipe_card");
  });

  it("ExplanationEvent has event_type='explanation' and text", () => {
    const evt: ExplanationEvent = { event_type: "explanation", text: "Here is why..." };
    expect(evt.event_type).toBe("explanation");
  });

  it("GroceryListEvent has event_type='grocery_list' and stores array", () => {
    const evt: GroceryListEvent = { event_type: "grocery_list", stores: [] };
    expect(evt.event_type).toBe("grocery_list");
  });

  it("ErrorEvent has event_type='error', message, code, recoverable", () => {
    const evt: ErrorEvent = {
      event_type: "error",
      message: "LLM timeout",
      code: "LLM_TIMEOUT",
      recoverable: true,
    };
    expect(evt.event_type).toBe("error");
    expect(evt.recoverable).toBe(true);
  });

  it("ErrorEvent code can be null", () => {
    const evt: ErrorEvent = {
      event_type: "error",
      message: "Unknown error",
      code: null,
      recoverable: false,
    };
    expect(evt.code).toBeNull();
  });

  it("DoneEvent has event_type='done', status, and nullable reason", () => {
    const complete: DoneEvent = { event_type: "done", status: "complete", reason: null, error_category: null };
    const partial: DoneEvent = {
      event_type: "done",
      status: "partial",
      reason: "max_iterations",
      error_category: null,
    };
    expect(complete.status).toBe("complete");
    expect(partial.reason).toBe("max_iterations");
  });

  it("SSEEvent discriminated union can hold any event type", () => {
    const events: SSEEvent[] = [
      { event_type: "thinking", message: "..." },
      { event_type: "explanation", text: "..." },
      { event_type: "done", status: "complete", reason: null, error_category: null },
    ];
    expect(events.map((e) => e.event_type)).toEqual([
      "thinking",
      "explanation",
      "done",
    ]);
  });

  it("SSEEvent discriminated union can be narrowed by event_type", () => {
    const event: SSEEvent = { event_type: "thinking", message: "Thinking..." };
    if (event.event_type === "thinking") {
      expect(event.message).toBe("Thinking...");
    } else {
      throw new Error("Should have matched thinking branch");
    }
  });
});

describe("api.ts — Screen literals", () => {
  it("Screen covers all 7 values including saved screens", () => {
    // Compile-time exhaustive check — fails if Screen union changes
    const _exhaustive: Record<Screen, true> = {
      home: true,
      clarify: true,
      recipes: true,
      grocery: true,
      saved_meal_plan: true,
      saved_recipe: true,
      saved_grocery_list: true,
    };
    expect(Object.keys(_exhaustive)).toHaveLength(7);
  });
});

describe("api.ts — model shapes", () => {
  it("ChatRequest has message, screen, and optional target_id", () => {
    const req: ChatRequest = { message: "I have chicken", screen: "home" };
    expect(req.message).toBe("I have chicken");
    expect(req.target_id).toBeUndefined();
  });

  it("ChatRequest accepts target_id for saved_meal_plan screen", () => {
    const req: ChatRequest = {
      message: "Swap chicken",
      screen: "saved_meal_plan",
      target_id: "plan-42",
    };
    expect(req.target_id).toBe("plan-42");
  });

  it("ConversationTurn has role, content, and timestamp", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "Hello",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(turn.role).toBe("user");
  });

  it("SessionStateResponse has pcsv (nullable) and recipes array", () => {
    const state: SessionStateResponse = {
      session_id: "sess-1",
      screen: "recipes",
      pcsv: null,
      recipes: [],
      grocery_list: null,
      conversation: [],
    };
    expect(state.pcsv).toBeNull();
    expect(Array.isArray(state.recipes)).toBe(true);
  });

  it("SavedMealPlan has id, name, recipes array, timestamps", () => {
    const plan: SavedMealPlan = {
      id: "plan-1",
      name: "Week 1",
      recipes: [],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(plan.name).toBe("Week 1");
  });

  it("SavedMealPlanSummary has recipe_count instead of full recipes", () => {
    const summary: SavedMealPlanSummary = {
      id: "plan-1",
      name: "Week 1",
      recipe_count: 3,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(summary.recipe_count).toBe(3);
  });

  it("SavedGroceryList has stores array", () => {
    const list: SavedGroceryList = {
      id: "list-1",
      name: "Weekend shop",
      stores: [],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(list.stores).toEqual([]);
  });

  it("SavedGroceryListSummary has item_count", () => {
    const summary: SavedGroceryListSummary = {
      id: "list-1",
      name: "Weekend shop",
      item_count: 12,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(summary.item_count).toBe(12);
  });

  it("SavedRecipe wraps a RecipeDetail snapshot with notes", () => {
    const saved: SavedRecipe = {
      id: "saved-1",
      recipe_snapshot: {
        id: "r001",
        name: "Test",
        name_zh: "",
        source: "",
        source_url: "",
        cuisine: "",
        cooking_method: "",
        effort_level: "quick",
        time_minutes: 15,
        flavor_tags: [],
        serves: 2,
        ingredients: [],
        instructions: "",
        is_ai_generated: false,
      },
      notes: "Family favourite",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(saved.notes).toBe("Family favourite");
  });

  it("SavedRecipeSummary has recipe_name and recipe_name_zh", () => {
    const summary: SavedRecipeSummary = {
      id: "saved-1",
      recipe_name: "Teriyaki Chicken",
      recipe_name_zh: "照烧鸡",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(summary.recipe_name_zh).toBe("照烧鸡");
  });

  it("auth types have correct shapes", () => {
    const req: SendCodeRequest = { email: "user@example.com" };
    const res: SendCodeResponse = { sent: true };
    const vReq: VerifyRequest = { email: "user@example.com", code: "123456" };
    const vRes: VerifyResponse = { token: "jwt-token", user_id: "user-1" };
    expect(req.email).toBe("user@example.com");
    expect(res.sent).toBe(true);
    expect(vReq.code).toBe("123456");
    expect(vRes.token).toBe("jwt-token");
  });

  it("CreateSession types have correct shapes", () => {
    const req: CreateSessionRequest = { initial_message: "Hello" };
    const res: CreateSessionResponse = {
      session_id: "sess-1",
      created_at: "2024-01-01T00:00:00Z",
    };
    expect(req.initial_message).toBe("Hello");
    expect(res.session_id).toBe("sess-1");
  });

  it("update request types allow partial fields", () => {
    const updatePlan: UpdateMealPlanRequest = { name: "New name" };
    const updateRecipe: UpdateSavedRecipeRequest = { notes: "updated notes" };
    const updateList: UpdateGroceryListRequest = { name: "Updated list" };
    expect(updatePlan.name).toBe("New name");
    expect(updateRecipe.notes).toBe("updated notes");
    expect(updateList.name).toBe("Updated list");
  });

  it("save request types have name and session_id", () => {
    const savePlan: SaveMealPlanRequest = {
      name: "Week 1",
      session_id: "sess-1",
    };
    const saveList: SaveGroceryListRequest = {
      name: "Shopping",
      session_id: "sess-1",
    };
    const saveRecipe: SaveRecipeRequest = {
      recipe_snapshot: {
        id: "r001",
        name: "Test",
        name_zh: "",
        source: "",
        source_url: "",
        cuisine: "",
        cooking_method: "",
        effort_level: "quick",
        time_minutes: 15,
        flavor_tags: [],
        serves: 2,
        ingredients: [],
        instructions: "",
        is_ai_generated: false,
      },
    };
    expect(savePlan.session_id).toBe("sess-1");
    expect(saveList.name).toBe("Shopping");
    expect(saveRecipe.recipe_snapshot.id).toBe("r001");
  });
});
