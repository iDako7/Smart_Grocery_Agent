"""Integration test: error_category reaches the SSE stream end-to-end.

Proves the contract wiring from the exception handler in sessions.py through
emit_agent_result into the DoneEvent actually works against a real FastAPI
client and the tx-rollback DB fixture.
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _make_kb_ctx_mock(kb_conn: AsyncMock) -> MagicMock:
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=kb_conn)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


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


async def test_chat_runtime_error_emits_config_category_on_sse_stream(client):
    """RuntimeError from run_agent → final `done` event has status=partial, error_category=config."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    with patch(
        "src.backend.api.sessions.run_agent",
        new_callable=AsyncMock,
        side_effect=RuntimeError("missing config"),
    ):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb_conn = AsyncMock()
            mock_kb.return_value = _make_kb_ctx_mock(mock_kb_conn)
            resp = await client.post(
                f"/session/{sid}/chat",
                json={"message": "hi", "screen": "home"},
            )

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    # Parse SSE events out of the response body
    blocks = [b for b in resp.text.split("\n\n") if b.strip()]
    parsed: list[tuple[str, dict]] = []
    for block in blocks:
        event_type = ""
        data = ""
        for line in block.strip().split("\n"):
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = line[6:]
        parsed.append((event_type, json.loads(data) if data else {}))

    # Final event should be `done`
    assert parsed, "expected at least one SSE event"
    final_type, final_data = parsed[-1]
    assert final_type == "done"
    assert final_data["status"] == "partial"
    assert final_data["error_category"] == "config"
