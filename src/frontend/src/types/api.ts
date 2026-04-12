// TypeScript translation of contracts/api_types.py
// Status: mirrors unfrozen Python contract

import type { GroceryStore } from "./sse";
import type { PCSVResult, RecipeDetail, RecipeSummary } from "./tools";

// ---------------------------------------------------------------------------
// Screen literals
// ---------------------------------------------------------------------------

export type Screen =
  | "home"
  | "clarify"
  | "recipes"
  | "grocery"
  | "saved_meal_plan"
  | "saved_recipe"
  | "saved_grocery_list";

// ---------------------------------------------------------------------------
// Session endpoints
// ---------------------------------------------------------------------------

export type CreateSessionRequest = {
  initial_message?: string | null;
};

export type CreateSessionResponse = {
  session_id: string;
  created_at: string; // ISO datetime string
};

export type ChatRequest = {
  message: string;
  screen: Screen;
  /** Required when screen is 'saved_meal_plan' or 'saved_recipe' */
  target_id?: string | null;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO datetime string
};

export type SessionStateResponse = {
  session_id: string;
  screen: Screen;
  pcsv: PCSVResult | null;
  recipes: RecipeSummary[];
  grocery_list: GroceryStore[] | null;
  conversation: ConversationTurn[];
};

// ---------------------------------------------------------------------------
// Grocery list endpoint
// ---------------------------------------------------------------------------

export type GroceryListItem = {
  ingredient_name: string;
  amount?: string;
  recipe_name?: string;
  recipe_id?: string;
};

export type GroceryListRequest = {
  items: GroceryListItem[];
};

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export type SendCodeRequest = {
  email: string;
};

export type SendCodeResponse = {
  sent: boolean;
};

export type VerifyRequest = {
  email: string;
  code: string;
};

export type VerifyResponse = {
  token: string;
  user_id: string;
};

// ---------------------------------------------------------------------------
// Saved content — shared models
// ---------------------------------------------------------------------------

export type SavedMealPlan = {
  id: string;
  name: string;
  recipes: RecipeDetail[];
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
};

export type SavedMealPlanSummary = {
  id: string;
  name: string;
  recipe_count: number;
  created_at: string;
  updated_at: string;
};

export type SavedRecipe = {
  id: string;
  recipe_snapshot: RecipeDetail;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SavedRecipeSummary = {
  id: string;
  recipe_name: string;
  recipe_name_zh: string;
  created_at: string;
  updated_at: string;
};

export type SavedGroceryList = {
  id: string;
  name: string;
  stores: GroceryStore[];
  created_at: string;
  updated_at: string;
};

export type SavedGroceryListSummary = {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Saved content — request models
// ---------------------------------------------------------------------------

export type SaveMealPlanRequest = {
  name: string;
  /** Derives recipes from current session state */
  session_id: string;
};

export type UpdateMealPlanRequest = {
  name?: string | null;
  recipes?: RecipeDetail[] | null;
};

export type SaveRecipeRequest = {
  /** KB recipe id, or null for AI-generated */
  recipe_id?: string | null;
  recipe_snapshot: RecipeDetail;
  notes?: string | null;
};

export type UpdateSavedRecipeRequest = {
  recipe_snapshot?: RecipeDetail | null;
  notes?: string | null;
};

export type SaveGroceryListRequest = {
  name: string;
  /** Derives grocery list from current session state */
  session_id: string;
};

export type UpdateGroceryListRequest = {
  name?: string | null;
  stores?: GroceryStore[] | null;
};
