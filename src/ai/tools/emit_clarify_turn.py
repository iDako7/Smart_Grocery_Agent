"""Handler for emit_clarify_turn — the terminal tool for the Clarify screen.

On the Clarify screen, the agent calls this tool as its final action to
deliver a directional summary and up to 3 chip-select clarifying questions
atomically. The handler itself is purely declarative: it validates the
payload through the Pydantic model and returns it unchanged. No DB access,
no kb access, no side effects.

Orchestrator recognition of this tool as terminal (which ends the agent
loop) is handled in Phase 2c, not here.
"""

from contracts.tool_schemas import ClarifyTurnPayload


async def emit_clarify_turn(payload: ClarifyTurnPayload) -> ClarifyTurnPayload:
    """Validate and return the clarify-turn payload unchanged.

    The Pydantic model enforces the ≤3-question hard cap via its
    model_validator, so reaching this function means the payload is valid.
    """
    return payload
