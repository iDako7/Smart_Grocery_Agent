"""Update user profile — delegates to PostgreSQL CRUD."""

import uuid

from contracts.tool_schemas import UpdateUserProfileInput, UpdateUserProfileResult
from sqlalchemy.ext.asyncio import AsyncConnection
from src.backend.db.crud import update_user_profile_field


async def update_user_profile(
    conn: AsyncConnection, user_id: uuid.UUID, input: UpdateUserProfileInput
) -> UpdateUserProfileResult:
    ok = await update_user_profile_field(conn, user_id, input.field, input.value)
    return UpdateUserProfileResult(
        updated=ok,
        field=input.field,
        new_value=input.value,
    )
