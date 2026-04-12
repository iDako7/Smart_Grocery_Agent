# Status: frozen
# Pydantic models for all 7 tool inputs/outputs and OpenAI function-calling TOOLS list.
# Evolved from prototype/schema.py + prototype/tools/definitions.py.
# Breaking changes require a PR to main + contracts/CHANGELOG.md entry.

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Shared enums / literals
# ---------------------------------------------------------------------------

PCSVRole = Literal["protein", "carb", "veggie", "sauce"]
PCSVStatus = Literal["gap", "low", "ok"]
EffortLevel = Literal["quick", "medium", "long"]
MatchQuality = Literal["good", "fair", "poor"]
SubstitutionReason = Literal["unavailable", "dietary", "preference"]
TranslateDirection = Literal["en_to_zh", "zh_to_en", "auto"]
TranslateMatchType = Literal["exact", "partial", "none"]
ProfileField = Literal[
    "household_size",
    "dietary_restrictions",
    "preferred_cuisines",
    "disliked_ingredients",
    "preferred_stores",
    "notes",
]
Store = Literal["costco", "community_market"]


# ---------------------------------------------------------------------------
# Tool input models
# ---------------------------------------------------------------------------


class AnalyzePcsvInput(BaseModel):
    ingredients: list[str]


class SearchRecipesInput(BaseModel):
    ingredients: list[str]
    cuisine: str | None = None
    cooking_method: str | None = None
    effort_level: EffortLevel | None = None
    flavor_tags: list[str] | None = None
    serves: int | None = None


class LookupStoreProductInput(BaseModel):
    item_name: str
    store: Store | None = None


class GetSubstitutionsInput(BaseModel):
    ingredient: str
    reason: SubstitutionReason | None = None


class GetRecipeDetailInput(BaseModel):
    recipe_id: str


_PROFILE_FIELD_TYPES: dict[str, type] = {
    "household_size": int,
    "dietary_restrictions": list,
    "preferred_cuisines": list,
    "disliked_ingredients": list,
    "preferred_stores": list,
    "notes": str,
}


class UpdateUserProfileInput(BaseModel):
    field: ProfileField
    value: Any

    @model_validator(mode="after")
    def _check_value_type(self) -> UpdateUserProfileInput:
        expected = _PROFILE_FIELD_TYPES.get(self.field)
        if expected and not isinstance(self.value, expected):
            raise ValueError(f"field '{self.field}' expects {expected.__name__}, got {type(self.value).__name__}")
        return self


class TranslateTermInput(BaseModel):
    term: str
    direction: TranslateDirection | None = None


# ---------------------------------------------------------------------------
# Tool output models
# ---------------------------------------------------------------------------


class PCSVCategory(BaseModel):
    status: PCSVStatus = Field(description="gap | low | ok")
    items: list[str] = Field(default_factory=list)


class PCSVResult(BaseModel):
    protein: PCSVCategory
    carb: PCSVCategory
    veggie: PCSVCategory
    sauce: PCSVCategory


class Ingredient(BaseModel):
    name: str
    amount: str = ""
    pcsv: list[PCSVRole] = Field(default_factory=list, description="protein/carb/veggie/sauce roles")


class RecipeSummary(BaseModel):
    id: str
    name: str
    name_zh: str = ""
    cuisine: str = ""
    cooking_method: str = ""
    effort_level: EffortLevel = "medium"
    flavor_tags: list[str] = Field(default_factory=list)
    serves: int = 0
    pcsv_roles: dict[PCSVRole, list[str]] = Field(
        default_factory=dict,
        description="Computed by tool handler, not stored in DB",
    )
    ingredients_have: list[str] = Field(
        default_factory=list,
        description="Computed by tool handler, not stored in DB",
    )
    ingredients_need: list[str] = Field(
        default_factory=list,
        description="Computed by tool handler, not stored in DB",
    )


class RecipeDetail(BaseModel):
    id: str
    name: str
    name_zh: str = ""
    source: str = ""
    source_url: str = ""
    cuisine: str = ""
    cooking_method: str = ""
    effort_level: EffortLevel = "medium"
    time_minutes: int = 0
    flavor_tags: list[str] = Field(default_factory=list)
    serves: int = 0
    ingredients: list[Ingredient] = Field(default_factory=list)
    instructions: str = ""
    is_ai_generated: bool = False


class StoreProduct(BaseModel):
    name: str
    size: str = ""
    department: str = ""
    store: str = "costco"
    alternatives: list[str] = Field(
        default_factory=list,
        description="Computed by tool handler, not stored in DB",
    )


class Substitution(BaseModel):
    substitute: str
    match_quality: MatchQuality = Field(description="good | fair | poor")
    notes: str = ""


class UserProfile(BaseModel):
    household_size: int = 2
    dietary_restrictions: list[str] = Field(default_factory=list)
    preferred_cuisines: list[str] = Field(default_factory=list)
    disliked_ingredients: list[str] = Field(default_factory=list)
    preferred_stores: list[str] = Field(default_factory=lambda: ["costco"])
    notes: str = ""


class UpdateUserProfileResult(BaseModel):
    updated: bool
    field: str
    new_value: Any


class TranslateTermResult(BaseModel):
    term: str
    translation: str
    direction: Literal["en_to_zh", "zh_to_en"]
    match_type: TranslateMatchType


# ---------------------------------------------------------------------------
# OpenAI function-calling tool definitions (used by OpenRouter)
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "analyze_pcsv",
            "description": (
                "Categorize a list of ingredients by Protein, Carb, Veggie, and Sauce roles. "
                "Returns the status of each category (gap, low, ok) and which items belong to it. "
                "Call this FIRST to understand the user's nutritional balance before searching recipes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of ingredient names the user has or mentioned",
                    }
                },
                "required": ["ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_recipes",
            "description": (
                "Search the recipe knowledge base for recipes matching the given ingredients and constraints. "
                "Returns recipe summaries ranked by ingredient match score. "
                "Call this AFTER analyze_pcsv to find recipes that fill identified gaps."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ingredients the user has available",
                    },
                    "cuisine": {
                        "type": "string",
                        "description": "Filter by cuisine (e.g., Korean, Chinese, Italian). Optional.",
                    },
                    "cooking_method": {
                        "type": "string",
                        "description": "Filter by method (e.g., grill, stir-fry, bake). Optional.",
                    },
                    "effort_level": {
                        "type": "string",
                        "enum": ["quick", "medium", "long"],
                        "description": "Filter by effort level. quick=~15 min, medium=15-45 min, long=45+ min. Optional.",
                    },
                    "flavor_tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by flavor tags (e.g., spicy, umami, smoky). Optional.",
                    },
                    "serves": {
                        "type": "integer",
                        "description": "Number of servings needed. Optional, used for ranking.",
                    },
                },
                "required": ["ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_store_product",
            "description": (
                "Look up a grocery item in the store product database. "
                "Returns the product name, package size, and department. "
                "Use this to ground grocery suggestions in real store data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {
                        "type": "string",
                        "description": "The ingredient or product to look up (e.g., 'chicken thighs', 'soy sauce')",
                    },
                    "store": {
                        "type": "string",
                        "enum": ["costco", "community_market"],
                        "description": "Which store to search. Defaults to costco.",
                    },
                },
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_substitutions",
            "description": (
                "Find substitutes for an ingredient. Returns alternatives with match quality and notes. "
                "Use when the user can't find an ingredient or has dietary restrictions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient": {
                        "type": "string",
                        "description": "The ingredient to find substitutes for",
                    },
                    "reason": {
                        "type": "string",
                        "enum": ["unavailable", "dietary", "preference"],
                        "description": "Why a substitute is needed. Optional.",
                    },
                },
                "required": ["ingredient"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recipe_detail",
            "description": (
                "Get full cooking instructions for a recipe by its ID. "
                "Use this when the user wants to see how to cook a specific recipe."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "recipe_id": {
                        "type": "string",
                        "description": "The recipe ID (e.g., 'r001')",
                    }
                },
                "required": ["recipe_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_user_profile",
            "description": (
                "Update the user's profile with a learned preference or restriction. "
                "Call this when the user mentions a persistent fact like dietary restrictions, "
                "preferred cuisines, disliked ingredients, or household size."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {
                        "type": "string",
                        "enum": [
                            "household_size",
                            "dietary_restrictions",
                            "preferred_cuisines",
                            "disliked_ingredients",
                            "preferred_stores",
                            "notes",
                        ],
                        "description": "Which profile field to update",
                    },
                    "value": {
                        "description": (
                            "The new value. "
                            "For household_size: integer. "
                            "For dietary_restrictions, preferred_cuisines, disliked_ingredients, preferred_stores: array of strings. "
                            "For notes: string."
                        ),
                    },
                },
                "required": ["field", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "translate_term",
            "description": (
                "Translate grocery, ingredient, or cooking terms between English and Chinese. "
                "Use when the user speaks Chinese, when explaining unfamiliar ingredients, "
                "or when providing bilingual names for items not in the recipe KB."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "term": {
                        "type": "string",
                        "description": "The term to translate (English or Chinese)",
                    },
                    "direction": {
                        "type": "string",
                        "enum": ["en_to_zh", "zh_to_en", "auto"],
                        "description": "Translation direction. 'auto' detects based on input characters. Defaults to 'auto'.",
                    },
                },
                "required": ["term"],
            },
        },
    },
]
