"""Integration test: save content from session, verify independence."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.ai.types import AgentResult
from src.backend.main import app

from contracts.tool_schemas import Ingredient, RecipeDetail, RecipeSummary
from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _make_kb_ctx(kb_conn: AsyncMock) -> MagicMock:
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


async def test_save_meal_plan_from_session(client):
    """Chat to populate session state (with RecipeDetail upgrade), then save as meal plan.

    REWRITTEN (issue #71): the snapshot upgrade now calls get_recipe_detail inside
    an `async with get_kb()` block. Mock must be a proper async context manager.
    The saved plan's recipes must carry RecipeDetail shape (instructions present).
    """
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    recipe_summary = RecipeSummary(id="r001", name="Korean Fried Chicken")
    mock_result = AgentResult(
        status="complete",
        response_text="Here you go!",
        recipes=[recipe_summary],
        total_iterations=1,
    )

    detail = RecipeDetail(
        id="r001",
        name="Korean Fried Chicken",
        ingredients=[Ingredient(name="chicken", amount="1 lb", pcsv=["protein"])],
        instructions="Deep fry until golden.",
    )

    kb_conn = AsyncMock()

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_detail",
                new_callable=AsyncMock,
                return_value=detail,
            ):
                await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "Find me recipes", "screen": "home"},
                )

    # Save meal plan from session — snapshot already has RecipeDetail shape, no lazy upgrade needed
    with patch("src.backend.api.saved.get_kb") as mock_saved_kb:
        kb_conn2 = AsyncMock()
        mock_saved_kb.return_value = _make_kb_ctx(kb_conn2)
        resp = await client.post("/saved/meal-plans", json={"name": "Test Plan", "session_id": sid})

    assert resp.status_code == 201

    plan_id = resp.json()["id"]
    resp = await client.get(f"/saved/meal-plans/{plan_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Plan"
    # Snapshot should now carry instructions
    recipes = resp.json()["recipes"]
    assert recipes, "plan must have recipes"
    assert "instructions" in recipes[0]
    assert recipes[0]["instructions"] == "Deep fry until golden."


async def test_saved_recipe_independent_of_kb():
    """Saved recipes store a snapshot, not a reference."""
    # This is tested by the data model: recipe_snapshot is JSONB
    # Verified in test_api_saved.py::test_recipe_crud
    pass
