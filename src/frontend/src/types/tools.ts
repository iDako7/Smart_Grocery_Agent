// TypeScript translation of contracts/tool_schemas.py
// Status: mirrors frozen Python contract — additive changes only

// ---------------------------------------------------------------------------
// Shared literal union types (Python enums)
// ---------------------------------------------------------------------------

export type PCSVRole = "protein" | "carb" | "veggie" | "sauce";
export type PCSVStatus = "gap" | "low" | "ok";
export type EffortLevel = "quick" | "medium" | "long";
export type MatchQuality = "good" | "fair" | "poor";
export type SubstitutionReason = "unavailable" | "dietary" | "preference";
export type TranslateDirection = "en_to_zh" | "zh_to_en" | "auto";
export type TranslateMatchType = "exact" | "partial" | "none";
export type ProfileField =
  | "household_size"
  | "dietary_restrictions"
  | "preferred_cuisines"
  | "disliked_ingredients"
  | "preferred_stores"
  | "notes";
export type Store = "costco" | "community_market";

// ---------------------------------------------------------------------------
// Tool input types
// ---------------------------------------------------------------------------

export type AnalyzePcsvInput = {
  ingredients: string[];
};

export type SearchRecipesInput = {
  ingredients: string[];
  cuisine?: string | null;
  cooking_method?: string | null;
  effort_level?: EffortLevel | null;
  flavor_tags?: string[] | null;
  serves?: number | null;
};

export type LookupStoreProductInput = {
  item_name: string;
  store?: Store | null;
};

export type GetSubstitutionsInput = {
  ingredient: string;
  reason?: SubstitutionReason | null;
};

export type GetRecipeDetailInput = {
  recipe_id: string;
};

export type UpdateUserProfileInput = {
  field: ProfileField;
  value: number | string | string[];
};

export type TranslateTermInput = {
  term: string;
  direction?: TranslateDirection | null;
};

// ---------------------------------------------------------------------------
// Tool output types
// ---------------------------------------------------------------------------

export type PCSVCategory = {
  status: PCSVStatus;
  items: string[];
};

export type PCSVResult = {
  protein: PCSVCategory;
  carb: PCSVCategory;
  veggie: PCSVCategory;
  sauce: PCSVCategory;
};

export type Ingredient = {
  name: string;
  amount: string;
  pcsv: PCSVRole[];
};

export type RecipeSummary = {
  id: string;
  name: string;
  name_zh: string;
  cuisine: string;
  cooking_method: string;
  effort_level: EffortLevel;
  flavor_tags: string[];
  serves: number;
  pcsv_roles: Partial<Record<PCSVRole, string[]>>;
  ingredients_have: string[];
  ingredients_need: string[];
  alternatives: RecipeSummary[];
};

export type RecipeDetail = {
  id: string;
  name: string;
  name_zh: string;
  source: string;
  source_url: string;
  cuisine: string;
  cooking_method: string;
  effort_level: EffortLevel;
  time_minutes: number;
  flavor_tags: string[];
  serves: number;
  ingredients: Ingredient[];
  instructions: string;
  is_ai_generated: boolean;
};

export type StoreProduct = {
  name: string;
  size: string;
  department: string;
  store: string;
  alternatives: string[];
};

export type Substitution = {
  substitute: string;
  match_quality: MatchQuality;
  notes: string;
};

export type UserProfile = {
  household_size: number;
  dietary_restrictions: string[];
  preferred_cuisines: string[];
  disliked_ingredients: string[];
  preferred_stores: string[];
  notes: string;
};

export type UpdateUserProfileResult = {
  updated: boolean;
  field: string;
  new_value: number | string | string[];
};

export type TranslateTermResult = {
  term: string;
  translation: string;
  direction: "en_to_zh" | "zh_to_en";
  match_type: TranslateMatchType;
};
