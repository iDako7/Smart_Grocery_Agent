"""Unit tests for /chat error → category mapping.

Verifies that exceptions raised by run_agent are mapped to the correct
AgentErrorCategory and emitted on the `done` SSE event.
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import openai
import pydantic
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel
from sqlalchemy import text
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _make_kb_ctx_mock(kb_conn: AsyncMock) -> MagicMock:
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=kb_conn)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


def _parse_done_event(sse_body: str) -> dict:
    """Parse the final `done` event from an SSE body and return its JSON data."""
    # Split on double-newline to get event blocks
    blocks = [b for b in sse_body.split("\n\n") if b.strip()]
    for block in reversed(blocks):
        lines = block.strip().split("\n")
        event_type = ""
        data = ""
        for line in lines:
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = line[6:]
        if event_type == "done":
            return json.loads(data)
    raise AssertionError(f"No `done` event found in SSE body: {sse_body!r}")


def _make_openai_api_error() -> openai.APIError:
    """Construct an openai.APIError across openai SDK versions.

    The SDK has changed APIError.__init__ between minors (body arg added, request
    positional vs. keyword). Try the current-known signature first, then fall back.
    """
    req = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    try:
        return openai.APIError("boom", request=req, body=None)
    except TypeError:
        try:
            return openai.APIError("boom", request=req)  # type: ignore[call-arg]
        except TypeError:
            return openai.APIError("boom")  # type: ignore[call-arg]


def _make_validation_error() -> pydantic.ValidationError:
    """Construct a pydantic.ValidationError by validating a bad payload.

    Any model works — the orchestrator raises ValidationError from several
    different models (PCSVResult, RecipeSummary), but the handler dispatches
    purely on exception type, not on which model failed validation.
    """

    class _M(BaseModel):
        x: int

    try:
        _M.model_validate({"x": "not-an-int"})
    except pydantic.ValidationError as e:
        return e
    raise AssertionError("expected ValidationError")


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
        await conn.execute(
            text("INSERT INTO users (id, email) VALUES (:id, :email)"),
            {"id": _DEV_USER, "email": "dev@test.local"},
        )
        await conn.execute(text("INSERT INTO user_profiles (user_id) VALUES (:uid)"), {"uid": _DEV_USER})


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


@pytest.mark.parametrize(
    ("exc_factory", "expected_category"),
    [
        (lambda: RuntimeError("boom"), "config"),
        (_make_openai_api_error, "llm"),
        (_make_validation_error, "validation"),
        (lambda: ValueError("boom"), "unknown"),
    ],
)
async def test_chat_error_category_mapping(client, exc_factory, expected_category):
    """Each exception type raised by run_agent maps to the correct error_category."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    exc = exc_factory()

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, side_effect=exc):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb_conn = AsyncMock()
            mock_kb.return_value = _make_kb_ctx_mock(mock_kb_conn)
            resp = await client.post(
                f"/session/{sid}/chat",
                json={"message": "hello", "screen": "home"},
            )

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    done = _parse_done_event(resp.text)
    assert done["status"] == "partial"
    assert done["error_category"] == expected_category
