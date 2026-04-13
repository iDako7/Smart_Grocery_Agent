"""Update in-memory user profile."""

from prototype.schema import UserProfile


def update_user_profile(
    profile: UserProfile,
    field: str,
    value,
) -> dict:
    if field not in UserProfile.model_fields:
        return {"updated": False, "error": f"Unknown field: {field}"}

    setattr(profile, field, value)
    return {"updated": True, "field": field, "new_value": value}
