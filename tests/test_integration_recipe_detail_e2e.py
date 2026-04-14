"""End-to-end integration tests for the recipe-detail flow (issue #57, Phase 5).

Contract guard: the route response must deserialize cleanly into the
RecipeDetail Pydantic model from contracts/tool_schemas.py.  This file is
the authoritative cross-layer check that the backend shape matches what
the frontend RecipeDetail type expects.

Test cases:
  1. test_full_recipe_detail_payload_matches_contract
     — every field populated, response validates against RecipeDetail
  2. test_recipe_detail_handles_minimal_optional_fields
     — optional fields nullish, response still validates against RecipeDetail
"""

import json
import os
import tempfile
import uuid
from collections.abc import AsyncIterator
from unittest.mock import patch

import aiosqlite
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.backend.main import app

from contracts.tool_schemas import RecipeDetail
from tests.conftest import _engine, _ensure_tables

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")

# ---------------------------------------------------------------------------
# Fixture data — FULL (every field populated, including all optionals)
# ---------------------------------------------------------------------------

_FULL_RECIPE = {
    "id": "e2e-full-001",
    "name": "Spicy Tofu Stir-Fry",
    "name_zh": "麻辣豆腐炒",
    "source": "KB-test",
    "source_url": "https://example.com/spicy-tofu",
    "cuisine": "Sichuan",
    "cooking_method": "stir-fry",
    "effort_level": "quick",
    "time_minutes": 20,
    "flavor_tags": json.dumps(["spicy", "umami", "savory"]),
    "serves": 2,
    "ingredients": json.dumps([
        {"name": "tofu", "amount": "300g", "pcsv": ["protein"]},
        {"name": "rice", "amount": "1 cup", "pcsv": ["carb"]},
        {"name": "bok choy", "amount": "200g", "pcsv": ["veggie"]},
        {"name": "doubanjiang", "amount": "2 tbsp", "pcsv": ["sauce"]},
    ]),
    "instructions": (
        "1. Press tofu and cut into cubes.\n"
        "2. Heat wok over high heat.\n"
        "3. Fry tofu until golden.\n"
        "4. Add doubanjiang and stir-fry 1 min.\n"
        "5. Add bok choy and toss until wilted.\n"
        "6. Serve over rice."
    ),
    "is_ai_generated": 1,
}

# ---------------------------------------------------------------------------
# Fixture data — MINIMAL (optional fields at their zero/falsy defaults)
# ---------------------------------------------------------------------------

_MINIMAL_RECIPE = {
    "id": "e2e-minimal-001",
    "name": "Plain Porridge",
    "name_zh": "",          # empty string — frontend treats as absent
    "source": "",
    "source_url": "",       # falsy — source link must not render
    "cuisine": "",
    "cooking_method": "",
    "effort_level": "medium",
    "time_minutes": 0,
    "flavor_tags": json.dumps([]),
    "serves": 0,
    "ingredients": json.dumps([
        {"name": "rice", "amount": "1 cup", "pcsv": ["carb"]},
    ]),
    "instructions": "Boil until soft.",
    "is_ai_generated": 0,
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

_INSERT_SQL = (
    "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


def _row(recipe: dict) -> tuple:
    return (
        recipe["id"],
        recipe["name"],
        recipe["name_zh"],
        recipe["source"],
        recipe["source_url"],
        recipe["cuisine"],
        recipe["cooking_method"],
        recipe["effort_level"],
        recipe["time_minutes"],
        recipe["flavor_tags"],
        recipe["serves"],
        recipe["ingredients"],
        recipe["instructions"],
        recipe["is_ai_generated"],
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def tmp_kb_e2e() -> AsyncIterator[str]:
    """Temporary SQLite KB with both e2e fixture recipes."""
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        path = f.name

    async with aiosqlite.connect(path) as db:
        await db.execute(_KB_DDL)
        await db.execute(_INSERT_SQL, _row(_FULL_RECIPE))
        await db.execute(_INSERT_SQL, _row(_MINIMAL_RECIPE))
        await db.commit()

    yield path

    os.unlink(path)


@pytest_asyncio.fixture(autouse=True)
async def _clean_db_e2e():
    """Truncate + re-seed PostgreSQL between tests."""
    await _ensure_tables()
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
        await conn.execute(
            text("INSERT INTO users (id, email) VALUES (:id, :email)"),
            {"id": _DEV_USER, "email": "dev@test.local"},
        )
        await conn.execute(
            text("INSERT INTO user_profiles (user_id) VALUES (:uid)"),
            {"uid": _DEV_USER},
        )


@pytest_asyncio.fixture()
async def client_e2e(tmp_kb_e2e: str) -> AsyncIterator[AsyncClient]:
    """Test client with auth + DB overrides and KB pointed at tmp_kb_e2e."""

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

    with patch.dict(os.environ, {"KB_SQLITE_PATH": tmp_kb_e2e}):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Test 1: full payload validates against RecipeDetail contract
# ---------------------------------------------------------------------------


async def test_full_recipe_detail_payload_matches_contract(client_e2e):
    """GET /recipe/{id} with every field populated → response validates as RecipeDetail.

    This is the contract guard: if the backend route's output shape diverges
    from contracts/tool_schemas.py RecipeDetail, Pydantic model_validate will
    raise a ValidationError and the test will fail.
    """
    resp = await client_e2e.get("/recipe/e2e-full-001")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()

    # --- Contract guard: deserialize into Pydantic model ---
    # ValidationError raised here means route shape != contract shape.
    detail = RecipeDetail.model_validate(data)

    # Identity
    assert detail.id == "e2e-full-001"
    assert detail.name == "Spicy Tofu Stir-Fry"
    assert detail.name_zh == "麻辣豆腐炒"

    # Source metadata
    assert detail.source == "KB-test"
    assert detail.source_url == "https://example.com/spicy-tofu"

    # Taxonomy
    assert detail.cuisine == "Sichuan"
    assert detail.cooking_method == "stir-fry"
    assert detail.effort_level == "quick"
    assert detail.time_minutes == 20
    assert detail.serves == 2

    # Flavor tags
    assert set(detail.flavor_tags) == {"spicy", "umami", "savory"}

    # Ingredients with PCSV roles — one per macro category
    ing_by_name = {i.name: i for i in detail.ingredients}
    assert set(ing_by_name.keys()) == {"tofu", "rice", "bok choy", "doubanjiang"}
    assert "protein" in ing_by_name["tofu"].pcsv
    assert "carb" in ing_by_name["rice"].pcsv
    assert "veggie" in ing_by_name["bok choy"].pcsv
    assert "sauce" in ing_by_name["doubanjiang"].pcsv

    # Amounts preserved
    assert ing_by_name["tofu"].amount == "300g"

    # Multi-line instructions
    assert "Press tofu" in detail.instructions
    assert "Serve over rice" in detail.instructions
    assert "\n" in detail.instructions  # multi-line preserved

    # AI flag: is_ai_generated=1 in DB → True in response (coerced by Pydantic)
    assert detail.is_ai_generated is True


# ---------------------------------------------------------------------------
# Test 2: minimal / optional fields — still validates against RecipeDetail
# ---------------------------------------------------------------------------


async def test_recipe_detail_handles_minimal_optional_fields(client_e2e):
    """GET /recipe/{id} with optional fields at their zero/falsy defaults → RecipeDetail validates.

    Guards the contract against tightening optional fields into required ones.
    """
    resp = await client_e2e.get("/recipe/e2e-minimal-001")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()

    # Contract guard — must not raise ValidationError
    detail = RecipeDetail.model_validate(data)

    # Core identity
    assert detail.id == "e2e-minimal-001"
    assert detail.name == "Plain Porridge"

    # Optional string fields — falsy / empty but valid
    assert detail.name_zh == ""
    assert detail.source == ""
    assert detail.source_url == ""
    assert detail.cuisine == ""
    assert detail.cooking_method == ""

    # Numeric optionals at zero
    assert detail.time_minutes == 0
    assert detail.serves == 0

    # Empty collections still valid
    assert detail.flavor_tags == []

    # Single ingredient, no source link
    assert len(detail.ingredients) == 1
    assert detail.ingredients[0].name == "rice"
    assert "carb" in detail.ingredients[0].pcsv

    # is_ai_generated=0 in DB → False (not None, not 0)
    assert detail.is_ai_generated is False
