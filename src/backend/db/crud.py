"""CRUD helpers for user and profile operations."""

import uuid

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection
from src.backend.db.tables import user_profiles, users

from contracts.tool_schemas import UserProfile


async def ensure_user_exists(conn: AsyncConnection, user_id: uuid.UUID, email: str) -> None:
    """Insert a user + default profile if the user doesn't already exist (race-safe)."""
    await conn.execute(pg_insert(users).values(id=user_id, email=email).on_conflict_do_nothing(index_elements=["id"]))
    await conn.execute(
        pg_insert(user_profiles).values(user_id=user_id).on_conflict_do_nothing(index_elements=["user_id"])
    )


async def get_user_profile(conn: AsyncConnection, user_id: uuid.UUID) -> UserProfile:
    """Read user profile and return as a Pydantic model."""
    row = (await conn.execute(user_profiles.select().where(user_profiles.c.user_id == user_id))).first()
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
    "household_size",
    "dietary_restrictions",
    "preferred_cuisines",
    "disliked_ingredients",
    "preferred_stores",
    "notes",
}


async def update_user_profile_field(conn: AsyncConnection, user_id: uuid.UUID, field: str, value: object) -> bool:
    """Update a single profile field. Returns True if a row was updated."""
    if field not in _ALLOWED_PROFILE_FIELDS:
        raise ValueError(f"Unknown profile field: {field!r}")
    result = await conn.execute(
        user_profiles.update()
        .where(user_profiles.c.user_id == user_id)
        .values(**{field: value, "updated_at": text("now()")})
    )
    return result.rowcount > 0


# Defaults mirror contracts/pg_schema.sql (user_profiles column defaults).
# Keep in sync if the schema changes.
_PROFILE_DEFAULTS: dict[str, object] = {
    "household_size": 2,
    "dietary_restrictions": [],
    "preferred_cuisines": [],
    "disliked_ingredients": [],
    "preferred_stores": ["costco"],
    "notes": "",
}


async def reset_user_profile_to_defaults(conn: AsyncConnection, user_id: uuid.UUID) -> None:
    """Reset every user_profiles column to its schema default for ``user_id``.

    Upsert-style: if the row is missing (e.g. fresh DB before _seed_dev_user),
    it is inserted at defaults. If present, it is overwritten in one statement.
    """
    stmt = pg_insert(user_profiles).values(user_id=user_id, **_PROFILE_DEFAULTS)
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={**_PROFILE_DEFAULTS, "updated_at": text("now()")},
    )
    await conn.execute(stmt)
