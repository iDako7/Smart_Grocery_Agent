"""Conversation context manager — store and load turns with token budget."""

import uuid
from collections import deque

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection
from src.backend.db.tables import conversation_turns

# Conservative: 1 token ≈ 2 chars.
# English text is ~4 chars/token but CJK text is ~1 char/token.
# Using 2 as a safe lower bound prevents budget overflow for mixed-language content.
DEFAULT_TOKEN_BUDGET = 8000
CHARS_PER_TOKEN = 2


async def save_turn(
    conn: AsyncConnection,
    session_id: uuid.UUID,
    role: str,
    content: str,
    screen: str = "home",
    tool_calls: list[dict] | None = None,
) -> None:
    """Insert a conversation turn into PostgreSQL."""
    await conn.execute(
        conversation_turns.insert().values(
            session_id=session_id,
            role=role,
            content=content,
            screen=screen,
            tool_calls=tool_calls or None,
        )
    )


async def load_context(
    conn: AsyncConnection,
    session_id: uuid.UUID,
    token_budget: int = DEFAULT_TOKEN_BUDGET,
) -> list[dict]:
    """Load conversation history within token budget.

    Returns messages in chronological order (oldest first), dropping
    the oldest turns first when the budget is exceeded.
    Only user and assistant turns are included (not system or tool turns
    for context — those are ephemeral within a single /chat call).
    """
    result = await conn.execute(
        select(
            conversation_turns.c.role,
            conversation_turns.c.content,
            conversation_turns.c.tool_calls,
        )
        .where(conversation_turns.c.session_id == session_id)
        .where(conversation_turns.c.role.in_(["user", "assistant"]))
        .order_by(conversation_turns.c.id)
    )
    rows = result.fetchall()

    # Estimate tokens for each turn
    turns_with_tokens: deque[tuple[dict, int]] = deque()
    for row in rows:
        msg: dict = {"role": row[0], "content": row[1]}
        char_count = len(row[1] or "")
        tokens = max(1, char_count // CHARS_PER_TOKEN)
        turns_with_tokens.append((msg, tokens))

    # Drop oldest turns until within budget
    total_tokens = sum(t for _, t in turns_with_tokens)
    while total_tokens > token_budget and turns_with_tokens:
        _, dropped = turns_with_tokens.popleft()
        total_tokens -= dropped

    return [msg for msg, _ in turns_with_tokens]
