"""CRUD helpers for user and profile operations."""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from contracts.tool_schemas import UserProfile
from src.backend.db.tables import user_profiles, users


async def ensure_user_exists(conn: AsyncConnection, user_id: uuid.UUID, email: str) -> None:
    """Insert a user + default profile if the user doesn't already exist."""
    row = (await conn.execute(users.select().where(users.c.id == user_id))).first()
    if row is not None:
        return
    await conn.execute(users.insert().values(id=user_id, email=email))
    await conn.execute(user_profiles.insert().values(user_id=user_id))


async def get_user_profile(conn: AsyncConnection, user_id: uuid.UUID) -> UserProfile:
    """Read user profile and return as a Pydantic model."""
    row = (
        await conn.execute(user_profiles.select().where(user_profiles.c.user_id == user_id))
    ).first()
    if row is None:
        return UserProfile()
    return UserProfile(
        household_size=row.household_size,
        dietary_restrictions=row.dietary_restrictions or [],
        preferred_cuisines=row.preferred_cuisines or [],
        disliked_ingredients=row.disliked_ingredients or [],
        preferred_stores=row.preferred_stores or ["costco"],
        notes=row.notes or "",
    )


_ALLOWED_PROFILE_FIELDS = {
    "household_size", "dietary_restrictions", "preferred_cuisines",
    "disliked_ingredients", "preferred_stores", "notes",
}


async def update_user_profile_field(
    conn: AsyncConnection, user_id: uuid.UUID, field: str, value: object
) -> bool:
    """Update a single profile field. Returns True if a row was updated."""
    if field not in _ALLOWED_PROFILE_FIELDS:
        raise ValueError(f"Unknown profile field: {field!r}")
    result = await conn.execute(
        user_profiles.update()
        .where(user_profiles.c.user_id == user_id)
        .values(**{field: value, "updated_at": text("now()")})
    )
    return result.rowcount > 0
