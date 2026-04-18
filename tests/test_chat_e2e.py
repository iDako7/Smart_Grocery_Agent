"""End-to-end test: create session → chat (SSE) → GET → verify state."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.ai.types import AgentResult, ToolCall
from src.backend.main import app

from contracts.tool_schemas import PCSVCategory, PCSVResult, RecipeSummary
from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
        await conn.execute(
            text("INSERT INTO users (id, email) VALUES (:id, :email)"), {"id": _DEV_USER, "email": "dev@test.local"}
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


def _parse_sse_events(body: str) -> list[tuple[str, dict]]:
    """Parse SSE response body into (event_type, data) pairs."""
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


async def test_full_e2e_flow(client):
    """Create session → chat with SSE → GET session → verify state."""
    # 1. Create session
    resp = await client.post("/session")
    assert resp.status_code == 201
    sid = resp.json()["session_id"]

    # 2. Chat — mock orchestrator with structured results
    pcsv = PCSVResult(
        protein=PCSVCategory(status="low", items=["chicken"]),
        carb=PCSVCategory(status="low", items=["rice"]),
        veggie=PCSVCategory(status="gap"),
        sauce=PCSVCategory(status="gap"),
    )
    recipe = RecipeSummary(id="r001", name="Korean Fried Chicken", cuisine="Korean")

    mock_result = AgentResult(
        status="complete",
        response_text="I suggest Korean Fried Chicken!",
        tool_calls=[
            ToolCall(name="analyze_pcsv", input={}, result={}),
            ToolCall(name="search_recipes", input={}, result={}),
        ],
        pcsv=pcsv,
        recipes=[recipe],
    )

    # get_kb must be a proper async context manager (used twice: agent loop + snapshot upgrade).
    kb_conn = AsyncMock()
    kb_ctx = MagicMock()
    kb_ctx.__aenter__ = AsyncMock(return_value=kb_conn)
    kb_ctx.__aexit__ = AsyncMock(return_value=False)

    from contracts.tool_schemas import Ingredient, RecipeDetail

    detail = RecipeDetail(
        id="r001",
        name="Korean Fried Chicken",
        cuisine="Korean",
        ingredients=[Ingredient(name="chicken", amount="1 lb", pcsv=["protein"])],
        instructions="Deep fry until golden.",
    )

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb.return_value = kb_ctx
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
                return_value={"r001": detail},
            ):
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "I have chicken and rice", "screen": "home"},
                )

    # 3. Verify SSE response
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    events = _parse_sse_events(resp.text)
    event_types = [e[0] for e in events]

    assert "thinking" in event_types
    assert "pcsv_update" in event_types
    assert "recipe_card" in event_types
    assert "explanation" in event_types
    assert "done" in event_types

    # Done event should be "complete"
    done_event = next(e for e in events if e[0] == "done")
    assert done_event[1]["status"] == "complete"

    # 4. GET session — verify state persisted
    resp = await client.get(f"/session/{sid}")
    data = resp.json()
    assert data["session_id"] == sid
    assert len(data["conversation"]) == 2
    assert data["conversation"][0]["role"] == "user"
    assert data["conversation"][1]["role"] == "assistant"


async def test_error_flow(client):
    """When orchestrator fails, SSE should include error-like partial done."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, side_effect=Exception("LLM timeout")):
        with patch("src.backend.api.sessions.get_kb") as mock_kb:
            mock_kb_conn = AsyncMock()
            mock_kb_conn.close = AsyncMock()
            mock_kb.return_value = mock_kb_conn

            resp = await client.post(
                f"/session/{sid}/chat",
                json={"message": "test", "screen": "home"},
            )

    assert resp.status_code == 200
    events = _parse_sse_events(resp.text)
    done_event = next(e for e in events if e[0] == "done")
    assert done_event[1]["status"] == "partial"
