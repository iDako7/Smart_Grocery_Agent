"""Unit tests for update_user_profile tool.

Covers: setting a list field, setting an int field, and rejecting an unknown field.
"""

from prototype.schema import UserProfile
from prototype.tools.update_user_profile import update_user_profile


def test_set_dietary_restrictions(default_profile):
    """Setting dietary_restrictions must update the profile in place and report success."""
    result = update_user_profile(default_profile, "dietary_restrictions", ["vegetarian"])

    assert result["updated"] is True
    assert default_profile.dietary_restrictions == ["vegetarian"]


def test_set_household_size(default_profile):
    """Setting household_size to 4 must update the profile in place and report success."""
    result = update_user_profile(default_profile, "household_size", 4)

    assert result["updated"] is True
    assert default_profile.household_size == 4


def test_unknown_field_error(default_profile):
    """Attempting to set a field that does not exist on UserProfile must fail gracefully."""
    result = update_user_profile(default_profile, "nonexistent_field", "value")

    assert result["updated"] is False
    assert "error" in result
