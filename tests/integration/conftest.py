"""Integration test fixtures — HTTP client, DB cleanup, LLM mock."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from tests.conftest import _engine, _ensure_tables

_DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    """TRUNCATE users CASCADE, then re-seed dev user + empty profile."""
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
        await conn.execute(
            text("INSERT INTO users (id, email) VALUES (:id, :email)"),
            {"id": _DEV_USER_ID, "email": "dev@test.local"},
        )
        await conn.execute(
            text("INSERT INTO user_profiles (user_id) VALUES (:uid)"),
            {"uid": _DEV_USER_ID},
        )


@pytest_asyncio.fixture()
async def client():
    """httpx.AsyncClient with ASGI transport + dependency overrides."""
    from src.backend.auth import get_current_user_id
    from src.backend.db.engine import get_db
    from src.backend.main import app

    async def _override_auth():
        return _DEV_USER_ID

    async def _override_db():
        conn = await _engine.connect()
        try:
            yield conn
        finally:
            await conn.close()

    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user_id] = _override_auth
    app.dependency_overrides[get_db] = _override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def mock_llm():
    """Patch _get_client so tests control LLM responses via side_effect.

    Yields the `create` AsyncMock directly — tests set `.side_effect = [...]`
    and inspect `.call_args_list` after the fact.
    """
    create_mock = AsyncMock()

    mock_client = AsyncMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = create_mock

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        yield create_mock


# ---------------------------------------------------------------------------
# Helpers (mirrors test_orchestrator_issue_87.py / test_orchestrator_clarify_turn.py)
# ---------------------------------------------------------------------------


def make_response(content=None, tool_calls=None, finish_reason="stop"):
    """Build a mock chat completion response."""
    message = MagicMock()
    message.content = content
    message.tool_calls = tool_calls or []
    message.model_dump = MagicMock(
        return_value={
            "role": "assistant",
            "content": content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in (tool_calls or [])
            ]
            if tool_calls
            else None,
        }
    )
    choice = MagicMock()
    choice.message = message
    choice.finish_reason = finish_reason
    response = MagicMock()
    response.choices = [choice]
    return response


def make_tool_call(name, args_dict, call_id="call_1"):
    """Build a mock tool call object."""
    tc = MagicMock()
    tc.id = call_id
    tc.function = MagicMock()
    tc.function.name = name
    tc.function.arguments = json.dumps(args_dict)
    return tc


def parse_sse_events(response):
    """Yield dicts from a text/event-stream response body.

    Each dict has keys: ``event`` (str) and ``data`` (parsed JSON dict).
    """
    body = response.text
    for block in body.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event_type = ""
        data_str = ""
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data_str = line[6:]
        if event_type and data_str:
            yield {"event": event_type, "data": json.loads(data_str)}
