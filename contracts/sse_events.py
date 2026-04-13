# Status: unfrozen (freezes when WT2 has /chat returning real events)
# Pydantic models for SSE event types.
# Each model represents the JSON payload inside `data:` of one SSE event.
# Breaking changes require a PR to main + contracts/CHANGELOG.md entry.

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from contracts.tool_schemas import PCSVResult, RecipeSummary

# ---------------------------------------------------------------------------
# Grocery list structure (Store > Department > Item)
# Derived from product spec §2 Grocery features (G1-G3) + §2 Saved Content (S1-S8)
# ---------------------------------------------------------------------------


class GroceryItem(BaseModel):
    id: str = Field(description="Stable identifier for check/add/remove operations")
    name: str
    amount: str = ""
    recipe_context: str = Field(default="", description="What recipe this is for, e.g. 'for Korean BBQ pork belly'")
    checked: bool = Field(default=False, description="Persisted state for saved grocery lists")


class GroceryDepartment(BaseModel):
    name: str
    items: list[GroceryItem] = Field(default_factory=list)


class GroceryStore(BaseModel):
    store_name: str
    departments: list[GroceryDepartment] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# SSE event models
# ---------------------------------------------------------------------------


AgentErrorCategory = Literal["config", "llm", "validation", "unknown"]


class ThinkingEvent(BaseModel):
    event_type: Literal["thinking"] = "thinking"
    message: str


class PcsvUpdateEvent(BaseModel):
    event_type: Literal["pcsv_update"] = "pcsv_update"
    pcsv: PCSVResult


class RecipeCardEvent(BaseModel):
    event_type: Literal["recipe_card"] = "recipe_card"
    recipe: RecipeSummary


class ExplanationEvent(BaseModel):
    event_type: Literal["explanation"] = "explanation"
    text: str


class GroceryListEvent(BaseModel):
    event_type: Literal["grocery_list"] = "grocery_list"
    stores: list[GroceryStore]


class ErrorEvent(BaseModel):
    event_type: Literal["error"] = "error"
    message: str
    code: str | None = None
    recoverable: bool = True


class DoneEvent(BaseModel):
    event_type: Literal["done"] = "done"
    status: Literal["complete", "partial"]
    reason: str | None = Field(
        default=None,
        description="Populated on partial. Chat handler uses 'agent_error:<category>' format; orchestrator may use 'max_iterations'.",
    )
    error_category: AgentErrorCategory | None = Field(
        default=None,
        description="Error taxonomy when status='partial'. None on success.",
    )


# ---------------------------------------------------------------------------
# Discriminated union for type-safe deserialization
# ---------------------------------------------------------------------------

SSEEvent = Annotated[
    ThinkingEvent | PcsvUpdateEvent | RecipeCardEvent | ExplanationEvent | GroceryListEvent | ErrorEvent | DoneEvent,
    Field(discriminator="event_type"),
]
