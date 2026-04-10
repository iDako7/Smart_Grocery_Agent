"""Tests for session + chat API endpoints."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from src.ai.types import AgentResult
from src.backend.main import app
from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    """Truncate all tables between tests for clean API testing."""
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
        # Seed the dev user
        await conn.execute(text(
            "INSERT INTO users (id, email) VALUES (:id, :email)"
        ), {"id": _DEV_USER, "email": "dev@test.local"})
        await conn.execute(text(
            "INSERT INTO user_profiles (user_id) VALUES (:uid)"
        ), {"uid": _DEV_USER})


@pytest_asyncio.fixture()
async def client():
    """Test client with auth + DB dependency overrides."""
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


async def test_create_session(client):
    resp = await client.post("/session")
    assert resp.status_code == 201
    data = resp.json()
    assert "session_id" in data
    assert "created_at" in data


async def test_get_session(client):
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    resp = await client.get(f"/session/{sid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == sid
    assert data["screen"] == "home"
    assert data["conversation"] == []


async def test_get_session_404(client):
    fake_id = uuid.uuid4()
    resp = await client.get(f"/session/{fake_id}")
    assert resp.status_code == 404


async def test_chat_with_mocked_orchestrator(client):
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    mock_result = AgentResult(
        status="complete",
        response_text="Here are some suggestions!",
        total_iterations=1,
    )

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb_conn = AsyncMock()
            mock_kb_conn.close = AsyncMock()
            mock_kb.return_value = mock_kb_conn

            resp = await client.post(
                f"/session/{sid}/chat",
                json={"message": "I have chicken", "screen": "home"},
            )

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    # SSE response should contain the explanation text
    assert "Here are some suggestions!" in resp.text


async def test_chat_session_not_found(client):
    fake_id = uuid.uuid4()
    resp = await client.post(
        f"/session/{fake_id}/chat",
        json={"message": "test", "screen": "home"},
    )
    assert resp.status_code == 404


async def test_get_session_after_chat(client):
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    mock_result = AgentResult(
        status="complete",
        response_text="Great choice!",
        total_iterations=1,
    )

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb_conn = AsyncMock()
            mock_kb_conn.close = AsyncMock()
            mock_kb.return_value = mock_kb_conn
            await client.post(
                f"/session/{sid}/chat",
                json={"message": "I have rice", "screen": "home"},
            )

    resp = await client.get(f"/session/{sid}")
    data = resp.json()
    assert len(data["conversation"]) == 2
    assert data["conversation"][0]["role"] == "user"
    assert data["conversation"][0]["content"] == "I have rice"
    assert data["conversation"][1]["role"] == "assistant"
