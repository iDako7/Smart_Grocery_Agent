"""Integration test: multi-turn session lifecycle."""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from src.ai.types import AgentResult, ToolCall
from src.backend.main import app
from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
        await conn.execute(text(
            "INSERT INTO users (id, email) VALUES (:id, :email)"
        ), {"id": _DEV_USER, "email": "dev@test.local"})
        await conn.execute(text(
            "INSERT INTO user_profiles (user_id) VALUES (:uid)"
        ), {"uid": _DEV_USER})


@pytest_asyncio.fixture()
async def client():
    async def _override_auth():
        return _DEV_USER

    async def _override_db():
        conn = await _engine.connect()
        try:
            yield conn
        finally:
            await conn.close()

    app.dependency_overrides.clear()
    from src.backend.auth import get_current_user_id
    from src.backend.db.engine import get_db
    app.dependency_overrides[get_current_user_id] = _override_auth
    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def test_multi_turn_conversation(client):
    """Create session → chat turn 1 → chat turn 2 → verify both turns in history."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    for msg in ["I have chicken and rice", "What about vegetables?"]:
        mock_result = AgentResult(
            status="complete",
            response_text=f"Response to: {msg}",
            total_iterations=1,
        )
        with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
            with patch("src.backend.api.sessions.get_kb") as mock_kb:
                mock_kb_conn = AsyncMock()
                mock_kb_conn.close = AsyncMock()
                mock_kb.return_value = mock_kb_conn
                await client.post(
                    f"/session/{sid}/chat",
                    json={"message": msg, "screen": "home"},
                )

    # GET session should show 4 turns (2 user + 2 assistant)
    resp = await client.get(f"/session/{sid}")
    data = resp.json()
    assert len(data["conversation"]) == 4
    assert data["conversation"][0]["content"] == "I have chicken and rice"
    assert data["conversation"][2]["content"] == "What about vegetables?"


async def test_context_includes_previous_turns(client):
    """The orchestrator receives history from previous turns."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    # Turn 1
    mock_result = AgentResult(status="complete", response_text="Got it!", total_iterations=1)
    captured_history = []

    async def mock_run_agent(msg, kb, conn, uid, history=None):
        captured_history.append(history)
        return mock_result

    with patch("src.backend.api.sessions.run_agent", side_effect=mock_run_agent):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb_conn = AsyncMock()
            mock_kb_conn.close = AsyncMock()
            mock_kb.return_value = mock_kb_conn

            await client.post(f"/session/{sid}/chat", json={"message": "Turn 1", "screen": "home"})
            await client.post(f"/session/{sid}/chat", json={"message": "Turn 2", "screen": "home"})

    # Turn 2 should have received more history than Turn 1
    assert len(captured_history) == 2
    # Turn 1 has its own user message in history (saved before load_context)
    assert len(captured_history[0]) >= 1
    # Turn 2 has Turn 1's user+assistant plus Turn 2's own user message
    assert len(captured_history[1]) > len(captured_history[0])
