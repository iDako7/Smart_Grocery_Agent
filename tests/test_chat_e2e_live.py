"""Live e2e tests — hit real OpenRouter API, no mocks.

Catches schema coercion failures, SSE serialization bugs, and prompt assembly
errors that mocked tests miss. All tests marked @pytest.mark.live and skip
gracefully when prerequisites are missing.
"""

import json
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from src.backend.main import app
from tests.conftest import _engine, _ensure_tables

# ---------------------------------------------------------------------------
# Skip conditions
# ---------------------------------------------------------------------------

import os as _os  # only for env var check
_SKIP_NO_KEY = not _os.environ.get("OPENROUTER_API_KEY")
_SKIP_NO_KB = not (Path(__file__).resolve().parent.parent / "data" / "kb.sqlite").exists()

_skip_reason = (
    "OPENROUTER_API_KEY not set" if _SKIP_NO_KEY
    else "data/kb.sqlite missing" if _SKIP_NO_KB
    else None
)


async def _pg_reachable() -> bool:
    try:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = [
    pytest.mark.live,
]

_LIVE_USER = uuid.uuid4()  # unique per test run — avoids TRUNCATE CASCADE

_ALLOWED_EVENT_TYPES = {
    "thinking", "pcsv_update", "recipe_card",
    "explanation", "grocery_list", "error", "done",
}


# ---------------------------------------------------------------------------
# Fixtures (same ASGI pattern as test_chat_e2e.py, but NO mocking)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _preflight_check():
    if _skip_reason:
        pytest.skip(_skip_reason)
    if not await _pg_reachable():
        pytest.skip("PostgreSQL unreachable")


@pytest_asyncio.fixture(autouse=True)
async def _seed_db(_preflight_check):
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text(
            "INSERT INTO users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"
        ), {"id": _LIVE_USER, "email": f"live-{_LIVE_USER}@test.local"})
        await conn.execute(text(
            "INSERT INTO user_profiles (user_id) VALUES (:uid) ON CONFLICT (user_id) DO NOTHING"
        ), {"uid": _LIVE_USER})
    yield
    # Cleanup only our own rows
    async with _engine.begin() as conn:
        await conn.execute(text(
            "DELETE FROM users WHERE id = :id"
        ), {"id": _LIVE_USER})


@pytest_asyncio.fixture()
async def client():
    async def _override_auth():
        return _LIVE_USER

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


def _parse_sse_events(body: str) -> list[tuple[str, dict]]:
    """Parse SSE response body into (event_type, data) pairs.

    Note: assumes single-line data: fields (no multi-line SSE data).
    Our backend always emits one JSON blob per data: line.
    """
    events = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event_type = ""
        data = ""
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = line[6:]
        if event_type and data:
            events.append((event_type, json.loads(data)))
    return events


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_live_simple_chat(client):
    """Full flow: session → chat → SSE with real LLM — verify event structure."""
    resp = await client.post("/session")
    assert resp.status_code == 201
    sid = resp.json()["session_id"]

    resp = await client.post(
        f"/session/{sid}/chat",
        json={"message": "I have chicken wings and rice", "screen": "home"},
        timeout=60.0,
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    events = _parse_sse_events(resp.text)
    event_types = [e[0] for e in events]

    # Must have at least thinking + done
    assert "thinking" in event_types, f"No thinking event. Got: {event_types}"
    assert "done" in event_types, f"No done event. Got: {event_types}"

    # All events must be valid JSON with allowed types
    for etype, data in events:
        assert etype in _ALLOWED_EVENT_TYPES, f"Unexpected event type: {etype}"
        assert isinstance(data, dict), f"Event data not a dict: {data}"


async def test_live_schema_coercion(client):
    """Verify typed content from real LLM matches Pydantic models."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    resp = await client.post(
        f"/session/{sid}/chat",
        json={"message": "I have chicken wings and rice", "screen": "home"},
        timeout=60.0,
    )
    events = _parse_sse_events(resp.text)

    typed_events = [e for e in events if e[0] in ("pcsv_update", "recipe_card")]
    assert typed_events, "LLM returned no typed events to validate"

    for etype, data in events:
        if etype == "pcsv_update":
            pcsv = data.get("pcsv", data)
            for key in ("protein", "carb", "veggie", "sauce"):
                assert key in pcsv, f"Missing PCSV key: {key}"
                assert pcsv[key]["status"] in ("ok", "low", "gap"), (
                    f"Bad PCSV status for {key}: {pcsv[key]['status']}"
                )
        elif etype == "recipe_card":
            recipe = data.get("recipe", data)
            assert "id" in recipe, f"recipe_card missing 'id': {recipe}"
            assert "name" in recipe, f"recipe_card missing 'name': {recipe}"


async def test_live_session_persistence(client):
    """After chat, GET session should show 2 turns (user + assistant)."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    resp = await client.post(
        f"/session/{sid}/chat",
        json={"message": "I have chicken wings and rice", "screen": "home"},
        timeout=60.0,
    )
    # Verify chat completed
    events = _parse_sse_events(resp.text)
    done_events = [e for e in events if e[0] == "done"]
    assert done_events, "No done event received"

    # Check persistence
    resp = await client.get(f"/session/{sid}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conversation"]) == 2, (
        f"Expected 2 turns, got {len(data['conversation'])}"
    )
    assert data["conversation"][0]["role"] == "user"
    assert data["conversation"][1]["role"] == "assistant"
    assert len(data["conversation"][1]["content"]) > 0, "Assistant content is empty"
