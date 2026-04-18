"""TDD tests for issue #71: snapshot upgrade from RecipeSummary to RecipeDetail.

Three required tests:
  1. chat_turn_upgrade  — after /chat, snapshot["recipes"] entries contain
                          `instructions` and `ingredients` as Ingredient objects.
  2. lazy_upgrade       — create_meal_plan re-upgrades old-shape (no instructions) snapshots.
  3. ai_generated_fallback — recipe whose id yields None from get_recipe_detail
                             is persisted as the original RecipeSummary dict (no crash).
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from contracts.tool_schemas import Ingredient, RecipeDetail, RecipeSummary
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.ai.types import AgentResult
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_kb_ctx(kb_conn: AsyncMock) -> MagicMock:
    """Return an async context manager mock that yields kb_conn."""
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=kb_conn)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


def _make_recipe_detail(recipe_id: str, name: str = "Test Recipe") -> RecipeDetail:
    return RecipeDetail(
        id=recipe_id,
        name=name,
        ingredients=[Ingredient(name="chicken", amount="1 lb", pcsv=["protein"])],
        instructions="Step 1: Cook the chicken.",
        is_ai_generated=False,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Test 1 — chat-turn snapshot upgrade
# ---------------------------------------------------------------------------


async def test_chat_turn_snapshot_contains_recipe_detail_shape(client):
    """After a successful /chat that returns recipes, snapshot["recipes"] entries
    must contain `instructions` (non-empty string) and `ingredients` as a list of
    objects with name/amount keys — i.e. RecipeDetail shape, NOT RecipeSummary shape.
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

    detail = _make_recipe_detail("r001", "Korean Fried Chicken")
    kb_conn = AsyncMock()

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
                return_value={"r001": detail},
            ) as mock_batch:
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "Find me recipes", "screen": "recipes"},
                )

    assert resp.status_code == 200
    mock_batch.assert_called_once()

    # Read back session state
    resp = await client.get(f"/session/{sid}")
    data = resp.json()
    assert data["recipes"], "snapshot must contain at least one recipe"
    rec = data["recipes"][0]
    # RecipeDetail shape: must have instructions and ingredient objects
    assert "instructions" in rec, "snapshot recipe must carry instructions"
    assert rec["instructions"] == "Step 1: Cook the chicken."
    assert "ingredients" in rec, "snapshot recipe must carry ingredients list"
    assert isinstance(rec["ingredients"], list)
    assert len(rec["ingredients"]) == 1
    assert rec["ingredients"][0]["name"] == "chicken"


# ---------------------------------------------------------------------------
# Test 2 — lazy upgrade in create_meal_plan
# ---------------------------------------------------------------------------


async def test_create_meal_plan_lazy_upgrades_old_shape_snapshot(client):
    """create_meal_plan must re-upgrade snapshot entries that lack `instructions`
    (old RecipeSummary shape) by calling get_recipe_detail before insert.
    The returned SavedMealPlan's recipes must carry instructions.
    """
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    # Manually write an *old-shape* snapshot (no instructions key) into the DB
    # simulating a session written before the fix.
    import json as _json

    old_snapshot = _json.dumps(
        {
            "recipes": [
                {
                    "id": "r002",
                    "name": "Garlic Butter Pasta",
                    "ingredients_have": ["pasta"],
                    "ingredients_need": ["butter"],
                }
            ]
        }
    )
    async with _engine.begin() as conn:
        # Use CAST rather than ::jsonb to avoid asyncpg parameter-binding conflicts.
        await conn.execute(
            text("UPDATE sessions SET state_snapshot = CAST(:snap AS jsonb) WHERE id = :sid"),
            {"snap": old_snapshot, "sid": sid},
        )

    detail = _make_recipe_detail("r002", "Garlic Butter Pasta")

    with patch(
        "src.backend.api.saved.get_recipe_details_batch",
        new_callable=AsyncMock,
        return_value={"r002": detail},
    ) as mock_batch:
        with patch("src.backend.api.saved.get_kb") as mock_get_kb:
            kb_conn = AsyncMock()
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            resp = await client.post(
                "/saved/meal-plans",
                json={"name": "Lazy Upgrade Plan", "session_id": sid},
            )

    assert resp.status_code == 201
    mock_batch.assert_called_once()

    body = resp.json()
    assert body["recipes"], "meal plan must contain recipes"
    rec = body["recipes"][0]
    assert "instructions" in rec
    assert rec["instructions"] == "Step 1: Cook the chicken."


# ---------------------------------------------------------------------------
# Test 3 — AI-generated fallback (get_recipe_detail returns None)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Test 4 — alternatives hydration (UAT bug on PR #112)
# ---------------------------------------------------------------------------


async def test_chat_turn_hydrates_alternatives(client):
    """Recipes nested under `primary.alternatives` must also be hydrated with
    `ingredients` and `instructions` so the frontend swap-in-place flow renders
    ingredient pills when the user picks an alternative.

    Reproducer: PR #112 UAT — swapping a dish to its alternative showed the
    dish name but zero ingredient tags because alternatives shipped with
    ingredients=[] from the SSE snapshot.
    """
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    alt_summary = RecipeSummary(id="r_alt_01", name="Ginger Chicken")
    primary = RecipeSummary(id="r001", name="Korean Fried Chicken", alternatives=[alt_summary])
    mock_result = AgentResult(
        status="complete",
        response_text="Here you go!",
        recipes=[primary],
        total_iterations=1,
    )

    primary_detail = _make_recipe_detail("r001", "Korean Fried Chicken")
    alt_detail = RecipeDetail(
        id="r_alt_01",
        name="Ginger Chicken",
        ingredients=[Ingredient(name="ginger", amount="2 tbsp", pcsv=["sauce"])],
        instructions="Step 1: Mince ginger.",
        is_ai_generated=False,
    )

    batch_return = {"r001": primary_detail, "r_alt_01": alt_detail}

    kb_conn = AsyncMock()

    with patch(
        "src.backend.api.sessions.run_agent",
        new_callable=AsyncMock,
        return_value=mock_result,
    ):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
                return_value=batch_return,
            ):
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "Find me recipes", "screen": "recipes"},
                )

    assert resp.status_code == 200

    resp = await client.get(f"/session/{sid}")
    data = resp.json()
    assert data["recipes"], "snapshot must contain primary recipe"
    rec = data["recipes"][0]
    assert rec["alternatives"], "primary must carry alternatives"
    alt = rec["alternatives"][0]
    # The bug: alternatives arrived with ingredients=[] and instructions=""
    assert alt["ingredients"], "alternative must be hydrated with ingredients"
    assert alt["ingredients"][0]["name"] == "ginger"
    assert alt["instructions"] == "Step 1: Mince ginger."


async def test_chat_turn_ai_generated_recipe_persisted_as_summary_fallback(client):
    """When get_recipe_detail returns None (AI-generated recipe with no KB row),
    the original RecipeSummary dict must be persisted in the snapshot without crashing.
    """
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    ai_recipe = RecipeSummary(id="ai-xyz", name="AI Fusion Bowl")
    mock_result = AgentResult(
        status="complete",
        response_text="Here is an AI suggestion!",
        recipes=[ai_recipe],
        total_iterations=1,
    )

    kb_conn = AsyncMock()

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
                return_value={},  # AI-generated — batch yields no row for this id
            ):
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "Give me an AI recipe", "screen": "recipes"},
                )

    # Must not crash
    assert resp.status_code == 200

    # Snapshot must contain the summary fallback (no instructions key acceptable)
    resp = await client.get(f"/session/{sid}")
    data = resp.json()
    assert data["recipes"], "snapshot must contain the AI recipe as fallback"
    rec = data["recipes"][0]
    assert rec["id"] == "ai-xyz"
    assert rec["name"] == "AI Fusion Bowl"


# ---------------------------------------------------------------------------
# Test A (issue #79) — zero KB reads when every RecipeSummary is pre-hydrated
# ---------------------------------------------------------------------------


async def test_hydration_skipped_when_recipes_pre_hydrated(client):
    """If every RecipeSummary already carries `instructions`, the hydration
    path must issue zero KB reads — no get_kb(), no batch call."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    pre_hydrated = RecipeSummary(
        id="r001",
        name="Pre-hydrated",
        ingredients=[Ingredient(name="x", amount="1", pcsv=["protein"])],
        instructions="Already cooked.",
    )
    mock_result = AgentResult(
        status="complete",
        response_text="ok",
        recipes=[pre_hydrated],
        total_iterations=1,
    )

    # Note: get_kb is also opened for the agent run at the top of /chat.
    # The hydration block should NOT open a second get_kb context.
    kb_conn = AsyncMock()
    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
            ) as mock_batch:
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "x", "screen": "recipes"},
                )

    assert resp.status_code == 200
    mock_batch.assert_not_called()
    # Exactly one get_kb — for the agent run only, not for hydration
    assert mock_get_kb.call_count == 1, f"hydration opened a second KB connection (call_count={mock_get_kb.call_count})"


# ---------------------------------------------------------------------------
# Test B (issue #79) — N un-hydrated recipes → exactly ONE batch call
# ---------------------------------------------------------------------------


async def test_hydration_uses_single_batch_call_for_n_recipes(client):
    """3 primaries × 2 alternatives (9 recipes total) all un-hydrated:
    hydration must issue exactly ONE get_recipe_details_batch call carrying
    all 9 ids."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    def _primary(i: int) -> RecipeSummary:
        return RecipeSummary(
            id=f"p{i}",
            name=f"Primary {i}",
            alternatives=[
                RecipeSummary(id=f"p{i}a1", name="alt1"),
                RecipeSummary(id=f"p{i}a2", name="alt2"),
            ],
        )

    primaries = [_primary(1), _primary(2), _primary(3)]
    mock_result = AgentResult(
        status="complete",
        response_text="ok",
        recipes=primaries,
        total_iterations=1,
    )

    expected_ids = {"p1", "p1a1", "p1a2", "p2", "p2a1", "p2a2", "p3", "p3a1", "p3a2"}
    batch_return = {rid: _make_recipe_detail(rid) for rid in expected_ids}
    kb_conn = AsyncMock()

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
                return_value=batch_return,
            ) as mock_batch:
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "x", "screen": "recipes"},
                )

    assert resp.status_code == 200
    assert mock_batch.call_count == 1, "hydration must use exactly ONE batch call"

    call_args = mock_batch.call_args
    passed_ids = call_args.args[1]
    assert set(passed_ids) == expected_ids
    assert len(passed_ids) == 9


# ---------------------------------------------------------------------------
# Test C (issue #79) — AI-generated ids absent from batch dict → defaults kept
# ---------------------------------------------------------------------------


async def test_batch_returns_empty_dict_for_ai_generated_ids(client):
    """Mixed KB-backed + AI-generated recipes: the batch omits the AI id from
    its result dict. Hydration loop leaves ingredients/instructions at defaults
    for the AI entry and hydrates the KB entry. Snapshot persists both without
    crash."""
    resp = await client.post("/session")
    sid = resp.json()["session_id"]

    ai_recipe = RecipeSummary(id="ai-xyz", name="AI Fusion Bowl")
    kb_recipe = RecipeSummary(id="r001", name="Real KB Recipe")
    mock_result = AgentResult(
        status="complete",
        response_text="ok",
        recipes=[kb_recipe, ai_recipe],
        total_iterations=1,
    )

    batch_return = {"r001": _make_recipe_detail("r001")}
    kb_conn = AsyncMock()

    with patch("src.backend.api.sessions.run_agent", new_callable=AsyncMock, return_value=mock_result):
        with patch("src.backend.api.sessions.get_kb") as mock_get_kb:
            mock_get_kb.return_value = _make_kb_ctx(kb_conn)
            with patch(
                "src.backend.api.sessions.get_recipe_details_batch",
                new_callable=AsyncMock,
                return_value=batch_return,
            ):
                resp = await client.post(
                    f"/session/{sid}/chat",
                    json={"message": "x", "screen": "recipes"},
                )

    assert resp.status_code == 200

    resp = await client.get(f"/session/{sid}")
    recs = resp.json()["recipes"]
    ai_entry = next(r for r in recs if r["id"] == "ai-xyz")
    assert ai_entry["name"] == "AI Fusion Bowl"
    assert ai_entry.get("instructions", "") == ""
    assert ai_entry.get("ingredients", []) == []
    kb_entry = next(r for r in recs if r["id"] == "r001")
    assert kb_entry["instructions"] == "Step 1: Cook the chicken."
    assert kb_entry["ingredients"][0]["name"] == "chicken"
