# Status: unfrozen (freezes when WT2 has /chat returning real events)
# Pydantic models for SSE event types.
# Each model represents the JSON payload inside `data:` of one SSE event.
# Breaking changes require a PR to main + contracts/CHANGELOG.md entry.
# Note: on the Clarify screen specifically, `clarify_turn` replaces `explanation`;
# on all other screens (home, recipes, grocery), `explanation` continues to be emitted.

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from contracts.tool_schemas import ClarifyQuestion, PCSVResult, RecipeSummary

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


class ClarifyTurnEvent(BaseModel):
    event_type: Literal["clarify_turn"] = "clarify_turn"
    explanation: str = Field(
        description="≤30-word directional sentence, plain text, no markdown. Replaces the free-text explanation event on the Clarify screen only."
    )
    questions: list[ClarifyQuestion] = Field(
        default_factory=list,
        description="0–3 chip-select clarifying questions. Empty list is valid when the user's message is specific and the profile is complete.",
    )


class ErrorEvent(BaseModel):
    event_type: Literal["error"] = "error"
    message: str
    code: str | None = None
    recoverable: bool = True


class TokenUsage(BaseModel):
    """Per-run token / cost telemetry summed across all LLM calls in run_agent.

    OpenRouter-normalized via `extra_body={"usage": {"include": True}}`:
    - `cached_tokens` / `cache_write_tokens` come from `usage.prompt_tokens_details`.
    - `cost` is the OpenRouter-reported USD cost (sum of per-call costs).
    """

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    cache_write_tokens: int = 0
    cost: float = 0.0
    model: str | None = None


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
    token_usage: TokenUsage | None = Field(
        default=None,
        description="Summed token usage + cost across all LLM calls in the run. Optional; absent when the agent short-circuits before any LLM call.",
    )


# ---------------------------------------------------------------------------
# Discriminated union for type-safe deserialization
# ---------------------------------------------------------------------------

SSEEvent = Annotated[
    ThinkingEvent
    | PcsvUpdateEvent
    | RecipeCardEvent
    | ExplanationEvent
    | GroceryListEvent
    | ClarifyTurnEvent
    | ErrorEvent
    | DoneEvent,
    Field(discriminator="event_type"),
]
