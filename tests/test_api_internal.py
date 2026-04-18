"""Tests for /internal admin endpoints (dev-mode only).

Covers #126 Option A: POST /internal/reset-dev-profile must reset the shared
dev user's profile row back to schema defaults, be gated behind
SGA_AUTH_MODE=dev (404 in prod), and be idempotent.
"""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from src.backend.db.tables import user_profiles
from src.backend.main import app

from tests.conftest import _engine, _ensure_tables

_DEV_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    """Truncate users (CASCADE nukes profile/sessions) and re-seed dev user + profile."""
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
    async def _override_db():
        conn = await _engine.connect()
        try:
            yield conn
        finally:
            await conn.close()

    from src.backend.db.engine import get_db

    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = _override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def _mutate_dev_profile():
    """Simulate what C1 does — write restrictions onto the shared dev row."""
    async with _engine.begin() as conn:
        await conn.execute(
            user_profiles.update()
            .where(user_profiles.c.user_id == _DEV_USER)
            .values(
                dietary_restrictions=["vegetarian", "no dairy", "halal"],
                preferred_cuisines=["italian"],
                disliked_ingredients=["cilantro"],
                preferred_stores=["save-on"],
                household_size=9,
                notes="leaked from a prior test",
            )
        )


async def _read_dev_profile() -> dict:
    async with _engine.connect() as conn:
        row = (await conn.execute(user_profiles.select().where(user_profiles.c.user_id == _DEV_USER))).first()
    return dict(row._mapping) if row else {}


@pytest.mark.asyncio
async def test_reset_dev_profile_returns_200_and_payload(client):
    resp = await client.post("/internal/reset-dev-profile")
    assert resp.status_code == 200
    body = resp.json()
    assert body["reset"] is True
    assert body["user_id"] == str(_DEV_USER)


@pytest.mark.asyncio
async def test_reset_dev_profile_clears_mutations(client):
    await _mutate_dev_profile()
    # Sanity: mutation actually landed
    before = await _read_dev_profile()
    assert before["dietary_restrictions"] == ["vegetarian", "no dairy", "halal"]
    assert before["household_size"] == 9

    resp = await client.post("/internal/reset-dev-profile")
    assert resp.status_code == 200

    after = await _read_dev_profile()
    assert after["household_size"] == 2
    assert after["dietary_restrictions"] == []
    assert after["preferred_cuisines"] == []
    assert after["disliked_ingredients"] == []
    assert after["preferred_stores"] == ["costco"]
    assert after["notes"] == ""


@pytest.mark.asyncio
async def test_reset_dev_profile_is_idempotent(client):
    # Calling twice in a row should both return 200, no errors, final state defaults.
    resp1 = await client.post("/internal/reset-dev-profile")
    resp2 = await client.post("/internal/reset-dev-profile")
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    row = await _read_dev_profile()
    assert row["dietary_restrictions"] == []
    assert row["household_size"] == 2


@pytest.mark.asyncio
async def test_reset_dev_profile_creates_row_if_missing(client):
    # Profile rows do not exist if the dev user was never seeded.
    async with _engine.begin() as conn:
        await conn.execute(text("DELETE FROM user_profiles WHERE user_id = :uid"), {"uid": _DEV_USER})
    assert await _read_dev_profile() == {}

    resp = await client.post("/internal/reset-dev-profile")
    assert resp.status_code == 200

    row = await _read_dev_profile()
    assert row["user_id"] == _DEV_USER
    assert row["household_size"] == 2
    assert row["dietary_restrictions"] == []
    assert row["preferred_stores"] == ["costco"]


@pytest.mark.asyncio
async def test_reset_dev_profile_prod_mode_returns_404(client, monkeypatch):
    """Gate must hide the route in prod so it cannot reset production data."""
    monkeypatch.setenv("SGA_AUTH_MODE", "prod")
    resp = await client.post("/internal/reset-dev-profile")
    assert resp.status_code == 404

    # And the profile was NOT touched — mutate first then confirm unchanged.
    await _mutate_dev_profile()
    before = await _read_dev_profile()
    resp = await client.post("/internal/reset-dev-profile")
    assert resp.status_code == 404
    after = await _read_dev_profile()
    assert before["dietary_restrictions"] == after["dietary_restrictions"]
    assert before["household_size"] == after["household_size"]
