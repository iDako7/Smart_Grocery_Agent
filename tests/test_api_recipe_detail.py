"""Integration tests for GET /recipe/{recipe_id} endpoint.

Test order follows TDD RED → GREEN discipline:
  1. 200 with full RecipeDetail payload
  2. 404 for unknown id
  3. 401 when auth header is missing
  4. is_ai_generated flag propagates correctly
"""

import json
import os
import tempfile
import uuid
from collections.abc import AsyncIterator
from unittest.mock import patch

import aiosqlite
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")

_FIXTURE_RECIPE = {
    "id": "r-test-001",
    "name": "Test Stir-Fry",
    "name_zh": "测试炒菜",
    "source": "test-source",
    "source_url": "https://example.com/test",
    "cuisine": "Chinese",
    "cooking_method": "stir-fry",
    "effort_level": "quick",
    "time_minutes": 15,
    "flavor_tags": json.dumps(["savory", "umami"]),
    "serves": 2,
    "ingredients": json.dumps([
        {"name": "chicken", "amount": "200g", "pcsv": ["protein"]},
        {"name": "bok choy", "amount": "1 bunch", "pcsv": ["veggie"]},
    ]),
    "instructions": "1. Heat oil. 2. Add chicken. 3. Add bok choy. 4. Season and serve.",
    "is_ai_generated": 0,
}

_FIXTURE_RECIPE_AI = {
    "id": "r-test-ai-001",
    "name": "AI Suggested Noodles",
    "name_zh": "AI推荐面条",
    "source": "",
    "source_url": "",
    "cuisine": "Fusion",
    "cooking_method": "boil",
    "effort_level": "medium",
    "time_minutes": 20,
    "flavor_tags": json.dumps(["mild"]),
    "serves": 1,
    "ingredients": json.dumps([
        {"name": "noodles", "amount": "100g", "pcsv": ["carb"]},
    ]),
    "instructions": "Boil noodles until done.",
    "is_ai_generated": 1,
}

_KB_DDL = """
CREATE TABLE recipes (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    name_zh         TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',
    source_url      TEXT NOT NULL DEFAULT '',
    cuisine         TEXT NOT NULL DEFAULT '',
    cooking_method  TEXT NOT NULL DEFAULT '',
    effort_level    TEXT NOT NULL DEFAULT 'medium',
    time_minutes    INTEGER NOT NULL DEFAULT 0,
    flavor_tags     TEXT NOT NULL DEFAULT '[]',
    serves          INTEGER NOT NULL DEFAULT 0,
    ingredients     TEXT NOT NULL DEFAULT '[]',
    instructions    TEXT NOT NULL DEFAULT '',
    is_ai_generated INTEGER NOT NULL DEFAULT 0
);
"""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def tmp_kb_path() -> AsyncIterator[str]:
    """Create a temporary SQLite KB with two fixture recipes and yield its path."""
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        path = f.name

    async with aiosqlite.connect(path) as db:
        await db.execute(_KB_DDL)
        await db.execute(
            "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                _FIXTURE_RECIPE["id"],
                _FIXTURE_RECIPE["name"],
                _FIXTURE_RECIPE["name_zh"],
                _FIXTURE_RECIPE["source"],
                _FIXTURE_RECIPE["source_url"],
                _FIXTURE_RECIPE["cuisine"],
                _FIXTURE_RECIPE["cooking_method"],
                _FIXTURE_RECIPE["effort_level"],
                _FIXTURE_RECIPE["time_minutes"],
                _FIXTURE_RECIPE["flavor_tags"],
                _FIXTURE_RECIPE["serves"],
                _FIXTURE_RECIPE["ingredients"],
                _FIXTURE_RECIPE["instructions"],
                _FIXTURE_RECIPE["is_ai_generated"],
            ),
        )
        await db.execute(
            "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                _FIXTURE_RECIPE_AI["id"],
                _FIXTURE_RECIPE_AI["name"],
                _FIXTURE_RECIPE_AI["name_zh"],
                _FIXTURE_RECIPE_AI["source"],
                _FIXTURE_RECIPE_AI["source_url"],
                _FIXTURE_RECIPE_AI["cuisine"],
                _FIXTURE_RECIPE_AI["cooking_method"],
                _FIXTURE_RECIPE_AI["effort_level"],
                _FIXTURE_RECIPE_AI["time_minutes"],
                _FIXTURE_RECIPE_AI["flavor_tags"],
                _FIXTURE_RECIPE_AI["serves"],
                _FIXTURE_RECIPE_AI["ingredients"],
                _FIXTURE_RECIPE_AI["instructions"],
                _FIXTURE_RECIPE_AI["is_ai_generated"],
            ),
        )
        await db.commit()

    yield path

    os.unlink(path)


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    """Truncate + re-seed PostgreSQL between tests (matches API test convention)."""
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
async def client(tmp_kb_path: str) -> AsyncIterator[AsyncClient]:
    """Test client with auth + DB overrides, and KB_SQLITE_PATH pointed at the tmp KB."""

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

    with patch.dict(os.environ, {"KB_SQLITE_PATH": tmp_kb_path}):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def unauthenticated_client(tmp_kb_path: str) -> AsyncIterator[AsyncClient]:
    """Test client WITHOUT auth override — production JWT path (SGA_AUTH_MODE=prod)."""
    app.dependency_overrides.clear()

    with patch.dict(
        os.environ,
        {"KB_SQLITE_PATH": tmp_kb_path, "SGA_AUTH_MODE": "prod", "JWT_SECRET": "test-secret"},
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_get_recipe_detail_returns_full_payload(client):
    """200 + ALL RecipeDetail fields present for a known recipe id."""
    resp = await client.get("/recipe/r-test-001")

    assert resp.status_code == 200
    data = resp.json()

    # Identity fields
    assert data["id"] == "r-test-001"
    assert data["name"] == "Test Stir-Fry"
    assert data["name_zh"] == "测试炒菜"

    # Metadata fields
    assert data["source"] == "test-source"
    assert data["source_url"] == "https://example.com/test"
    assert data["cuisine"] == "Chinese"
    assert data["cooking_method"] == "stir-fry"
    assert data["effort_level"] == "quick"
    assert data["time_minutes"] == 15
    assert data["serves"] == 2

    # Collections
    assert "savory" in data["flavor_tags"]
    assert "umami" in data["flavor_tags"]
    assert len(data["ingredients"]) == 2
    chicken = next(i for i in data["ingredients"] if i["name"] == "chicken")
    assert chicken["amount"] == "200g"
    assert "protein" in chicken["pcsv"]

    # Instructions
    assert "Heat oil" in data["instructions"]

    # Flag
    assert data["is_ai_generated"] is False


async def test_get_recipe_detail_404_for_unknown_id(client):
    """Unknown recipe id → 404 with correct detail message."""
    resp = await client.get("/recipe/r-does-not-exist")

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Recipe not found"}


async def test_get_recipe_detail_requires_auth(unauthenticated_client):
    """Missing Authorization header → 401 (auth dependency raises before KB access)."""
    resp = await unauthenticated_client.get("/recipe/r-test-001")

    assert resp.status_code == 401


async def test_get_recipe_detail_ai_generated_flag(client):
    """Recipe with is_ai_generated=1 in DB → is_ai_generated=True in response."""
    resp = await client.get("/recipe/r-test-ai-001")

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "r-test-ai-001"
    assert data["is_ai_generated"] is True
    assert data["name"] == "AI Suggested Noodles"
    assert data["name_zh"] == "AI推荐面条"
