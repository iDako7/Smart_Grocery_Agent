"""Handler for emit_clarify_turn — the terminal tool for the Clarify screen.

On the Clarify screen, the agent calls this tool as its final action to
deliver a directional summary and up to 3 chip-select clarifying questions
atomically. The handler itself is purely declarative: it validates the
payload through the Pydantic model and returns it unchanged. No DB access,
no kb access, no side effects.

Orchestrator recognition of this tool as terminal (which ends the agent
loop) is handled in Phase 2c, not here.
"""

import re

from contracts.tool_schemas import ClarifyTurnPayload

MAX_EXPLANATION_WORDS = 30

_MARKDOWN_LINE_PREFIXES = ("#", "- ", "* ", "> ", "| ")
_NUMBERED_LIST_RE = re.compile(r"^\d+\.\s")
_EXPLANATION_RULE_ERROR = (
    "`explanation` must be ONE plain-text sentence of ≤30 words — no markdown, "
    "lists, headings, bold, backticks, or newlines. Rewrite as a single short "
    "directional sentence proposing a cooking direction for the user to approve; "
    "do NOT list recipes, ingredients, or reasons."
)


async def emit_clarify_turn(payload: ClarifyTurnPayload) -> ClarifyTurnPayload | dict:
    """Validate and return the clarify-turn payload unchanged.

    The Pydantic model enforces the ≤3-question hard cap via its
    model_validator. We additionally enforce that `explanation` is ONE
    plain-text sentence of ≤30 words with no markdown (no headings, lists,
    block quotes, tables, bold, or backticks) and no newlines. On violation
    we return an ``{"error": ...}`` dict so the orchestrator's tool-error
    retry loop coaches the LLM back into compliance instead of letting a
    long free-text blob reach the UI.
    """
    text = payload.explanation.strip()
    word_count = len(text.split())
    if word_count > MAX_EXPLANATION_WORDS:
        return {"error": _EXPLANATION_RULE_ERROR}
    if "\n" in text:
        return {"error": _EXPLANATION_RULE_ERROR}
    if text.startswith(_MARKDOWN_LINE_PREFIXES) or _NUMBERED_LIST_RE.match(text):
        return {"error": _EXPLANATION_RULE_ERROR}
    if "**" in text or "`" in text or "##" in text:
        return {"error": _EXPLANATION_RULE_ERROR}
    return payload
