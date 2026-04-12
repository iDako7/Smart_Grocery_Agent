# Status: unfrozen (freezes when WT2 has all endpoints scaffolded)
# Request/response types for all API endpoints.
# Breaking changes require a PR to main + contracts/CHANGELOG.md entry.

from __future__ import annotations

from datetime import datetime
import uuid
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from contracts.sse_events import GroceryStore
from contracts.tool_schemas import PCSVResult, RecipeDetail, RecipeSummary

# ---------------------------------------------------------------------------
# Screen literals
# ---------------------------------------------------------------------------

# Core flow screens + saved content screens that support chat.
# No "saved_grocery_list" — product spec §2 Grocery constraint: no chat input on this screen.
Screen = Literal[
    "home",
    "clarify",
    "recipes",
    "grocery",
    "saved_meal_plan",
    "saved_recipe",
]


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------


class CreateSessionRequest(BaseModel):
    initial_message: str | None = None


class CreateSessionResponse(BaseModel):
    session_id: str
    created_at: datetime


class ChatRequest(BaseModel):
    message: str = Field(max_length=4000)
    screen: Screen
    target_id: str | None = Field(
        default=None,
        description=(
            "Required when screen is 'saved_meal_plan' or 'saved_recipe'. "
            "Identifies which saved item the chat modifies."
        ),
    )

    @model_validator(mode="after")
    def _require_target_id(self) -> "ChatRequest":
        if self.screen in ("saved_meal_plan", "saved_recipe") and not self.target_id:
            raise ValueError(f"target_id is required when screen is '{self.screen}'")
        return self


class ConversationTurn(BaseModel):
    """Represents a user-visible conversation turn.

    The DB stores all turn types (user, assistant, system, tool), but the API
    only exposes user and assistant turns. System and tool turns are filtered
    out at the query layer before constructing these objects.
    """

    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime


class SessionStateResponse(BaseModel):
    """Returned by GET /session/{id} for page refresh / resume.

    Backed by sessions.screen + sessions.state_snapshot (JSONB) + conversation_turns.
    """

    session_id: str
    screen: Screen
    pcsv: PCSVResult | None = None
    recipes: list[RecipeSummary] = Field(default_factory=list)
    grocery_list: list[GroceryStore] | None = None
    conversation: list[ConversationTurn] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Grocery list endpoint
# ---------------------------------------------------------------------------

class GroceryListItem(BaseModel):
    ingredient_name: str = Field(max_length=200)
    amount: str = Field(default="", max_length=100)
    recipe_name: str = Field(default="", max_length=200)
    recipe_id: str = Field(default="", max_length=100)

class GroceryListRequest(BaseModel):
    items: list[GroceryListItem] = Field(min_length=1, max_length=50)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


class SendCodeRequest(BaseModel):
    email: str


class SendCodeResponse(BaseModel):
    sent: bool


class VerifyRequest(BaseModel):
    email: str
    code: str


class VerifyResponse(BaseModel):
    token: str
    user_id: str


# ---------------------------------------------------------------------------
# Saved content — shared models
# ---------------------------------------------------------------------------


class SavedMealPlan(BaseModel):
    id: str
    name: str
    recipes: list[RecipeDetail] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SavedMealPlanSummary(BaseModel):
    id: str
    name: str
    recipe_count: int
    created_at: datetime
    updated_at: datetime


class SavedRecipe(BaseModel):
    id: str
    recipe_snapshot: RecipeDetail
    notes: str = ""
    created_at: datetime
    updated_at: datetime


class SavedRecipeSummary(BaseModel):
    id: str
    recipe_name: str
    recipe_name_zh: str = ""
    created_at: datetime
    updated_at: datetime


class SavedGroceryList(BaseModel):
    id: str
    name: str
    stores: list[GroceryStore] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SavedGroceryListSummary(BaseModel):
    id: str
    name: str
    item_count: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Saved content — request models
# ---------------------------------------------------------------------------

# Meal plans

class SaveMealPlanRequest(BaseModel):
    name: str = Field(max_length=200)
    session_id: uuid.UUID = Field(
        description="Derives recipes from current session state"
    )


class UpdateMealPlanRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    recipes: list[RecipeDetail] | None = None


# Recipes

class SaveRecipeRequest(BaseModel):
    recipe_id: str | None = Field(
        default=None, description="KB recipe id, or null for AI-generated"
    )
    recipe_snapshot: RecipeDetail
    notes: str | None = Field(default=None, max_length=5000)


class UpdateSavedRecipeRequest(BaseModel):
    recipe_snapshot: RecipeDetail | None = None
    notes: str | None = Field(default=None, max_length=5000)


# Grocery lists

class SaveGroceryListRequest(BaseModel):
    name: str = Field(max_length=200)
    session_id: uuid.UUID = Field(
        description="Derives grocery list from current session state"
    )


class UpdateGroceryListRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    stores: list[GroceryStore] | None = None
