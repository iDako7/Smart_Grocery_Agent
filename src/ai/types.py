"""Agent result types."""

from dataclasses import dataclass, field

from contracts.sse_events import GroceryStore
from contracts.tool_schemas import PCSVResult, RecipeSummary


@dataclass
class ToolCall:
    name: str
    input: dict
    result: dict


@dataclass
class AgentResult:
    status: str  # "complete" | "partial"
    response_text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    total_iterations: int = 0
    pcsv: PCSVResult | None = None
    recipes: list[RecipeSummary] = field(default_factory=list)
    grocery_list: list[GroceryStore] = field(default_factory=list)
    reason: str | None = None
