"""Tests for context manager — save_turn, load_context."""

import uuid

from src.ai.context import load_context, save_turn, CHARS_PER_TOKEN
from src.backend.db.tables import sessions


async def _create_session(db, user_id):
    """Helper: create a session and return its ID."""
    sid = uuid.uuid4()
    await db.execute(sessions.insert().values(id=sid, user_id=user_id))
    return sid


async def test_save_and_load_round_trip(seeded_user, db):
    sid = await _create_session(db, seeded_user)
    await save_turn(db, sid, "user", "Hello!")
    await save_turn(db, sid, "assistant", "Hi there!")

    history = await load_context(db, sid)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Hello!"
    assert history[1]["role"] == "assistant"


async def test_budget_enforcement_drops_oldest(seeded_user, db):
    sid = await _create_session(db, seeded_user)

    # Each message is ~25 tokens (100 chars / 4)
    long_msg = "x" * 100
    for i in range(20):
        role = "user" if i % 2 == 0 else "assistant"
        await save_turn(db, sid, role, f"{long_msg}_{i}")

    # Budget of 100 tokens = ~4 messages
    history = await load_context(db, sid, token_budget=100)
    assert len(history) <= 5  # should be roughly 4
    assert len(history) >= 1


async def test_tool_turns_excluded(seeded_user, db):
    sid = await _create_session(db, seeded_user)
    await save_turn(db, sid, "user", "Analyze my ingredients")
    await save_turn(db, sid, "tool", '{"result": "data"}')
    await save_turn(db, sid, "assistant", "Here are the results")

    history = await load_context(db, sid)
    assert len(history) == 2
    roles = [m["role"] for m in history]
    assert "tool" not in roles


async def test_empty_session(seeded_user, db):
    sid = await _create_session(db, seeded_user)
    history = await load_context(db, sid)
    assert history == []


async def test_chronological_order(seeded_user, db):
    sid = await _create_session(db, seeded_user)
    await save_turn(db, sid, "user", "first")
    await save_turn(db, sid, "assistant", "second")
    await save_turn(db, sid, "user", "third")

    history = await load_context(db, sid)
    contents = [m["content"] for m in history]
    assert contents == ["first", "second", "third"]
