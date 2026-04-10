"""Tests for user/profile CRUD helpers."""

import uuid

from contracts.tool_schemas import UserProfile
from src.backend.db.crud import ensure_user_exists, get_user_profile, update_user_profile_field
from src.backend.db.tables import user_profiles, users


async def test_get_user_profile_defaults(seeded_user, db):
    profile = await get_user_profile(db, seeded_user)
    assert isinstance(profile, UserProfile)
    assert profile.household_size == 2
    assert profile.dietary_restrictions == []
    assert profile.preferred_stores == ["costco"]


async def test_update_user_profile_field_household_size(seeded_user, db):
    ok = await update_user_profile_field(db, seeded_user, "household_size", 4)
    assert ok is True
    profile = await get_user_profile(db, seeded_user)
    assert profile.household_size == 4


async def test_update_user_profile_field_list(seeded_user, db):
    ok = await update_user_profile_field(
        db, seeded_user, "dietary_restrictions", ["vegetarian", "gluten-free"]
    )
    assert ok is True
    profile = await get_user_profile(db, seeded_user)
    assert profile.dietary_restrictions == ["vegetarian", "gluten-free"]


async def test_update_user_profile_field_notes(seeded_user, db):
    ok = await update_user_profile_field(db, seeded_user, "notes", "Loves spicy food")
    assert ok is True
    profile = await get_user_profile(db, seeded_user)
    assert profile.notes == "Loves spicy food"


async def test_update_nonexistent_user(db):
    fake_id = uuid.uuid4()
    ok = await update_user_profile_field(db, fake_id, "household_size", 5)
    assert ok is False


async def test_get_user_profile_missing_returns_default(db):
    profile = await get_user_profile(db, uuid.uuid4())
    assert profile == UserProfile()


async def test_ensure_user_exists_creates_new(db):
    uid = uuid.uuid4()
    await ensure_user_exists(db, uid, "new@test.local")
    row = (await db.execute(users.select().where(users.c.id == uid))).first()
    assert row is not None
    assert row.email == "new@test.local"
    # Profile should also exist
    profile_row = (
        await db.execute(user_profiles.select().where(user_profiles.c.user_id == uid))
    ).first()
    assert profile_row is not None


async def test_ensure_user_exists_idempotent(seeded_user, db):
    # Should not raise on second call
    await ensure_user_exists(db, seeded_user, "dev@test.local")
    rows = (await db.execute(users.select().where(users.c.id == seeded_user))).fetchall()
    assert len(rows) == 1
