"""Pydantic models for all tool I/O and agent results."""

from __future__ import annotations

from pydantic import BaseModel, Field


# --- PCSV ---


class PCSVCategory(BaseModel):
    status: str = Field(description="gap | low | ok")
    items: list[str] = Field(default_factory=list)


class PCSVResult(BaseModel):
    protein: PCSVCategory
    carb: PCSVCategory
    veggie: PCSVCategory
    sauce: PCSVCategory


# --- Recipes ---


class Ingredient(BaseModel):
    name: str
    amount: str = ""
    pcsv: list[str] = Field(default_factory=list, description="protein/carb/veggie/sauce roles")


class RecipeSummary(BaseModel):
    id: str
    name: str
    name_zh: str = ""
    cuisine: str = ""
    cooking_method: str = ""
    time_minutes: int = 0
    serves: int = 0
    pcsv_roles: dict[str, list[str]] = Field(default_factory=dict)
    ingredients_have: list[str] = Field(default_factory=list)
    ingredients_need: list[str] = Field(default_factory=list)
    match_score: float = 0.0


class RecipeDetail(BaseModel):
    id: str
    name: str
    name_zh: str = ""
    source: str = ""
    source_url: str = ""
    cuisine: str = ""
    cooking_method: str = ""
    time_minutes: int = 0
    serves: int = 0
    ingredients: list[Ingredient] = Field(default_factory=list)
    instructions: str = ""
    is_ai_generated: bool = False


# --- Store products ---


class StoreProduct(BaseModel):
    product_name: str
    package_size: str = ""
    department: str = ""
    store: str = "costco"
    alternatives: list[str] = Field(default_factory=list)


# --- Substitutions ---


class Substitution(BaseModel):
    substitute: str
    match_quality: str = Field(description="good | fair | poor")
    notes: str = ""


# --- User profile ---


class UserProfile(BaseModel):
    household_size: int = 2
    dietary_restrictions: list[str] = Field(default_factory=list)
    preferred_cuisines: list[str] = Field(default_factory=list)
    disliked_ingredients: list[str] = Field(default_factory=list)
    preferred_stores: list[str] = Field(default_factory=lambda: ["costco"])
    notes: str = ""


# --- Agent result ---


class ToolCall(BaseModel):
    name: str
    input: dict
    result: dict | list


class AgentResult(BaseModel):
    status: str = Field(description="complete | partial")
    response_text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    total_iterations: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
