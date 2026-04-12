"""Tests for update_user_profile tool against PostgreSQL."""

from contracts.tool_schemas import UpdateUserProfileInput
from src.ai.tools.update_user_profile import update_user_profile
from src.backend.db.crud import get_user_profile


async def test_update_household_size(seeded_user, db):
    result = await update_user_profile(db, seeded_user, UpdateUserProfileInput(field="household_size", value=6))
    assert result.updated is True
    assert result.field == "household_size"
    assert result.new_value == 6
    profile = await get_user_profile(db, seeded_user)
    assert profile.household_size == 6


async def test_update_dietary_restrictions(seeded_user, db):
    result = await update_user_profile(
        db,
        seeded_user,
        UpdateUserProfileInput(field="dietary_restrictions", value=["halal"]),
    )
    assert result.updated is True
    profile = await get_user_profile(db, seeded_user)
    assert profile.dietary_restrictions == ["halal"]


async def test_update_nonexistent_user(db):
    import uuid

    result = await update_user_profile(
        db,
        uuid.uuid4(),
        UpdateUserProfileInput(field="household_size", value=3),
    )
    assert result.updated is False
