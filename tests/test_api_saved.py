"""Tests for saved content CRUD — meal plans, recipes, grocery lists."""

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")
_SESSION_ID = None  # set per test


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


async def _create_session(client) -> str:
    resp = await client.post("/session")
    return resp.json()["session_id"]


# ---- Meal Plans ----


async def test_meal_plan_crud(client):
    sid = await _create_session(client)
    # Create
    resp = await client.post("/saved/meal-plans", json={"name": "Week 1", "session_id": sid})
    assert resp.status_code == 201
    plan = resp.json()
    pid = plan["id"]
    assert plan["name"] == "Week 1"

    # List
    resp = await client.get("/saved/meal-plans")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Get
    resp = await client.get(f"/saved/meal-plans/{pid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Week 1"

    # Update
    resp = await client.put(f"/saved/meal-plans/{pid}", json={"name": "Week 2"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Week 2"

    # Delete
    resp = await client.delete(f"/saved/meal-plans/{pid}")
    assert resp.status_code == 204

    # Verify gone
    resp = await client.get(f"/saved/meal-plans/{pid}")
    assert resp.status_code == 404


# ---- Recipes ----

_RECIPE_SNAPSHOT = {
    "id": "r001",
    "name": "Korean BBQ",
    "ingredients": [{"name": "pork belly", "amount": "1 lb", "pcsv": ["protein"]}],
    "instructions": "Grill it",
}


async def test_recipe_crud(client):
    # Create
    resp = await client.post(
        "/saved/recipes",
        json={
            "recipe_id": "r001",
            "recipe_snapshot": _RECIPE_SNAPSHOT,
            "notes": "Family favorite",
        },
    )
    assert resp.status_code == 201
    recipe = resp.json()
    rid = recipe["id"]
    assert recipe["notes"] == "Family favorite"

    # List
    resp = await client.get("/saved/recipes")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["recipe_name"] == "Korean BBQ"

    # Get
    resp = await client.get(f"/saved/recipes/{rid}")
    assert resp.status_code == 200

    # Update notes
    resp = await client.put(f"/saved/recipes/{rid}", json={"notes": "Updated notes"})
    assert resp.status_code == 200
    assert resp.json()["notes"] == "Updated notes"

    # Delete
    resp = await client.delete(f"/saved/recipes/{rid}")
    assert resp.status_code == 204

    resp = await client.get(f"/saved/recipes/{rid}")
    assert resp.status_code == 404


# ---- Grocery Lists ----


async def test_grocery_list_crud(client):
    sid = await _create_session(client)
    # Create
    resp = await client.post("/saved/grocery-lists", json={"name": "Shopping trip", "session_id": sid})
    assert resp.status_code == 201
    glist = resp.json()
    gid = glist["id"]
    assert glist["name"] == "Shopping trip"

    # List
    resp = await client.get("/saved/grocery-lists")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Get
    resp = await client.get(f"/saved/grocery-lists/{gid}")
    assert resp.status_code == 200

    # Update
    resp = await client.put(f"/saved/grocery-lists/{gid}", json={"name": "Sunday shopping"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sunday shopping"

    # Delete
    resp = await client.delete(f"/saved/grocery-lists/{gid}")
    assert resp.status_code == 204

    resp = await client.get(f"/saved/grocery-lists/{gid}")
    assert resp.status_code == 404


# ---- 404 tests ----


async def test_meal_plan_404(client):
    fake = uuid.uuid4()
    assert (await client.get(f"/saved/meal-plans/{fake}")).status_code == 404
    assert (await client.put(f"/saved/meal-plans/{fake}", json={"name": "x"})).status_code == 404
    assert (await client.delete(f"/saved/meal-plans/{fake}")).status_code == 404


async def test_recipe_404(client):
    fake = uuid.uuid4()
    assert (await client.get(f"/saved/recipes/{fake}")).status_code == 404
    assert (await client.delete(f"/saved/recipes/{fake}")).status_code == 404


async def test_grocery_list_404(client):
    fake = uuid.uuid4()
    assert (await client.get(f"/saved/grocery-lists/{fake}")).status_code == 404
    assert (await client.put(f"/saved/grocery-lists/{fake}", json={"name": "x"})).status_code == 404
    assert (await client.delete(f"/saved/grocery-lists/{fake}")).status_code == 404


# ---- Grocery list PUT stores payload ----


async def test_grocery_list_update_stores(client):
    sid = await _create_session(client)
    # Create
    resp = await client.post("/saved/grocery-lists", json={"name": "Shopping trip", "session_id": sid})
    assert resp.status_code == 201
    gid = resp.json()["id"]

    stores_payload = [
        {
            "store_name": "Costco",
            "departments": [
                {
                    "name": "Produce",
                    "items": [
                        {"id": "i1", "name": "Spinach", "amount": "1 bag"},
                        {"id": "i2", "name": "Carrots", "amount": "2 lb"},
                    ],
                },
                {
                    "name": "Meat",
                    "items": [
                        {"id": "i3", "name": "Pork belly", "amount": "1 lb"},
                    ],
                },
            ],
        },
        {
            "store_name": "T&T",
            "departments": [
                {
                    "name": "Pantry",
                    "items": [
                        {"id": "i4", "name": "Soy sauce", "amount": "1 bottle"},
                    ],
                },
            ],
        },
    ]

    # PUT stores
    resp = await client.put(f"/saved/grocery-lists/{gid}", json={"stores": stores_payload})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["stores"]) == 2
    assert body["stores"][0]["store_name"] == "Costco"
    assert len(body["stores"][0]["departments"]) == 2
    assert body["stores"][0]["departments"][0]["name"] == "Produce"
    assert len(body["stores"][0]["departments"][0]["items"]) == 2
    assert body["stores"][0]["departments"][0]["items"][0]["id"] == "i1"
    assert body["stores"][0]["departments"][0]["items"][0]["name"] == "Spinach"
    assert body["stores"][0]["departments"][0]["items"][0]["amount"] == "1 bag"
    assert body["stores"][1]["store_name"] == "T&T"
    assert body["stores"][1]["departments"][0]["items"][0]["name"] == "Soy sauce"

    # GET persists
    resp = await client.get(f"/saved/grocery-lists/{gid}")
    assert resp.status_code == 200
    persisted = resp.json()
    assert len(persisted["stores"]) == 2
    assert persisted["stores"][0]["store_name"] == "Costco"
    assert persisted["stores"][0]["departments"][1]["items"][0]["id"] == "i3"
    assert persisted["stores"][1]["departments"][0]["items"][0]["id"] == "i4"
