"""Tests for PATCH /session/{session_id}/recipes endpoint — TDD RED phase.

Covers:
1. Happy path: replaces recipe at index, leaves others intact.
2. 404 for unknown session_id.
3. 400 for out-of-range index.
4. 422 for malformed body (missing required fields).
5. Auth is enforced (separate user cannot mutate the session).
"""

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")

# ---------------------------------------------------------------------------
# Minimal recipe dicts that match state_snapshot["recipes"] shape.
# These mirror RecipeSummary.model_dump() (the shape written by /chat handler).
# ---------------------------------------------------------------------------

_RECIPE_A = {
    "id": "r_a",
    "name": "Recipe A",
    "name_zh": "",
    "cuisine": "",
    "cooking_method": "",
    "effort_level": "medium",
    "flavor_tags": [],
    "serves": 0,
    "pcsv_roles": {},
    "ingredients_have": [],
    "ingredients_need": [],
    "alternatives": [],
}

_RECIPE_B = {
    "id": "r_b",
    "name": "Recipe B",
    "name_zh": "",
    "cuisine": "",
    "cooking_method": "",
    "effort_level": "quick",
    "flavor_tags": [],
    "serves": 0,
    "pcsv_roles": {},
    "ingredients_have": [],
    "ingredients_need": [],
    "alternatives": [],
}

_RECIPE_C = {
    "id": "r_c",
    "name": "Recipe C",
    "name_zh": "",
    "cuisine": "",
    "cooking_method": "",
    "effort_level": "long",
    "flavor_tags": [],
    "serves": 0,
    "pcsv_roles": {},
    "ingredients_have": [],
    "ingredients_need": [],
    "alternatives": [],
}

_RECIPE_D = {
    "id": "r_d",
    "name": "Recipe D (replacement)",
    "name_zh": "",
    "cuisine": "Chinese",
    "cooking_method": "stir-fry",
    "effort_level": "quick",
    "flavor_tags": ["Savory"],
    "serves": 2,
    "pcsv_roles": {},
    "ingredients_have": ["tofu"],
    "ingredients_need": ["ginger"],
    "alternatives": [],
}


# ---------------------------------------------------------------------------
# Fixtures — mirrors test_api_sessions.py pattern exactly
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
        await conn.execute(
            text("INSERT INTO user_profiles (user_id) VALUES (:uid)"), {"uid": _DEV_USER}
        )


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
# Helper: seed a session with a known recipe list in state_snapshot
# ---------------------------------------------------------------------------


async def _seed_session_with_recipes(client: AsyncClient, recipes: list[dict]) -> str:
    """Create a session and inject recipes directly into state_snapshot.

    Uses a mock of the AgentResult path from /chat to set the snapshot without
    needing raw JSONB SQL (asyncpg does not support the :name::jsonb cast syntax).
    Instead we use SQLAlchemy's type_coerce or cast to pass JSONB correctly.
    """

    resp = await client.post("/session")
    assert resp.status_code == 201
    sid = resp.json()["session_id"]

    from src.backend.db.tables import sessions

    async with _engine.begin() as conn:
        await conn.execute(
            sessions.update()
            .where(sessions.c.id == uuid.UUID(sid))
            .values(state_snapshot={"recipes": recipes})
        )
    return sid


# ---------------------------------------------------------------------------
# T1: PATCH replaces the targeted recipe, leaves others intact
# ---------------------------------------------------------------------------


async def test_patch_session_recipes_replaces_at_index(client):
    """PATCH /session/{id}/recipes with index=1 replaces only slot 1."""
    sid = await _seed_session_with_recipes(client, [_RECIPE_A, _RECIPE_B, _RECIPE_C])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"index": 1, "recipe": _RECIPE_D},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == sid
    assert len(data["recipes"]) == 3
    assert data["recipes"][0]["id"] == "r_a"
    assert data["recipes"][1]["id"] == "r_d"
    assert data["recipes"][2]["id"] == "r_c"


async def test_patch_session_recipes_replaces_first_slot(client):
    """Index 0 replaces only the first recipe."""
    sid = await _seed_session_with_recipes(client, [_RECIPE_A, _RECIPE_B])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"index": 0, "recipe": _RECIPE_D},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["recipes"][0]["id"] == "r_d"
    assert data["recipes"][1]["id"] == "r_b"


async def test_patch_session_recipes_persists_to_get_session(client):
    """After PATCH, GET /session/{id} returns the updated recipe list."""
    sid = await _seed_session_with_recipes(client, [_RECIPE_A, _RECIPE_B, _RECIPE_C])

    await client.patch(
        f"/session/{sid}/recipes",
        json={"index": 2, "recipe": _RECIPE_D},
    )

    get_resp = await client.get(f"/session/{sid}")
    assert get_resp.status_code == 200
    recipes = get_resp.json()["recipes"]
    assert len(recipes) == 3
    assert recipes[2]["id"] == "r_d"
    assert recipes[2]["name"] == "Recipe D (replacement)"


# ---------------------------------------------------------------------------
# T2: 404 for unknown session_id
# ---------------------------------------------------------------------------


async def test_patch_session_recipes_unknown_session(client):
    fake_id = uuid.uuid4()
    resp = await client.patch(
        f"/session/{fake_id}/recipes",
        json={"index": 0, "recipe": _RECIPE_D},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# T3: 400 for out-of-range index
# ---------------------------------------------------------------------------


async def test_patch_session_recipes_index_too_large(client):
    sid = await _seed_session_with_recipes(client, [_RECIPE_A, _RECIPE_B])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"index": 5, "recipe": _RECIPE_D},
    )
    assert resp.status_code == 400


async def test_patch_session_recipes_negative_index(client):
    sid = await _seed_session_with_recipes(client, [_RECIPE_A, _RECIPE_B])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"index": -1, "recipe": _RECIPE_D},
    )
    # 422 from Pydantic (Field ge=0) or 400 from handler — either is acceptable
    assert resp.status_code in (400, 422)


async def test_patch_session_recipes_empty_list(client):
    """Index 0 on a session with no recipes is out of range."""
    sid = await _seed_session_with_recipes(client, [])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"index": 0, "recipe": _RECIPE_D},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# T4: 422 for malformed body
# ---------------------------------------------------------------------------


async def test_patch_session_recipes_missing_index(client):
    sid = await _seed_session_with_recipes(client, [_RECIPE_A])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"recipe": _RECIPE_D},
    )
    assert resp.status_code == 422


async def test_patch_session_recipes_missing_recipe(client):
    sid = await _seed_session_with_recipes(client, [_RECIPE_A])

    resp = await client.patch(
        f"/session/{sid}/recipes",
        json={"index": 0},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# T5: Auth guard — another user cannot mutate the session
# ---------------------------------------------------------------------------


async def test_patch_session_recipes_other_user_gets_404(client):
    """Session ownership is enforced — user B cannot mutate user A's real session."""
    # Seed a real session under user A (_DEV_USER) with RECIPE_A
    sid = await _seed_session_with_recipes(client, [_RECIPE_A])

    # Create user B in the DB
    _USER_B = uuid.UUID("00000000-0000-0000-0000-000000000002")
    async with _engine.begin() as conn:
        await conn.execute(
            text("INSERT INTO users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"),
            {"id": _USER_B, "email": "userb@test.local"},
        )
        await conn.execute(
            text("INSERT INTO user_profiles (user_id) VALUES (:uid) ON CONFLICT (user_id) DO NOTHING"),
            {"uid": _USER_B},
        )

    # Build a second client authenticated as user B
    async def _override_auth_b():
        return _USER_B

    async def _override_db():
        conn = await _engine.connect()
        try:
            yield conn
        finally:
            await conn.close()

    from src.backend.auth import get_current_user_id
    from src.backend.db.engine import get_db

    app.dependency_overrides[get_current_user_id] = _override_auth_b
    app.dependency_overrides[get_db] = _override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client_b:
        resp = await client_b.patch(
            f"/session/{sid}/recipes",
            json={"index": 0, "recipe": _RECIPE_D},
        )

    # Restore client A's auth override so teardown works correctly
    async def _override_auth_a():
        return _DEV_USER

    app.dependency_overrides[get_current_user_id] = _override_auth_a

    assert resp.status_code == 404

    # Confirm user A's snapshot was NOT mutated
    from src.backend.db.tables import sessions
    async with _engine.begin() as conn:
        row = await conn.execute(
            sessions.select().where(sessions.c.id == uuid.UUID(sid))
        )
        snapshot = row.mappings().one()["state_snapshot"]
    assert snapshot["recipes"][0]["id"] == _RECIPE_A["id"], (
        "User A's snapshot was mutated by user B — ownership check failed"
    )
