"""Tests for prompt assembly."""

from src.ai.prompt import build_system_prompt

from contracts.tool_schemas import UserProfile


def test_default_profile_prompt():
    prompt = build_system_prompt(UserProfile())
    assert "Household size: 2" in prompt
    assert "Dietary restrictions: none stated" in prompt
    assert "Smart Grocery Assistant" in prompt
    assert "Tool Usage" in prompt


def test_profile_with_restrictions():
    profile = UserProfile(
        household_size=4,
        dietary_restrictions=["vegetarian", "gluten-free"],
        preferred_cuisines=["Korean", "Italian"],
        disliked_ingredients=["cilantro"],
        preferred_stores=["costco"],
        notes="Loves spicy food",
    )
    prompt = build_system_prompt(profile)
    assert "Household size: 4" in prompt
    assert "vegetarian" in prompt
    assert "gluten-free" in prompt
    assert "Korean" in prompt
    assert "Italian" in prompt
    assert "cilantro" in prompt
    assert "Loves spicy food" in prompt


def test_prompt_has_four_sections():
    prompt = build_system_prompt(UserProfile())
    assert "# Smart Grocery Assistant" in prompt
    assert "## Rules" in prompt
    assert "## User Profile" in prompt
    assert "## Tool Usage" in prompt


async def test_prompt_with_pg_profile(seeded_user, db):
    """Integration: read profile from PostgreSQL and build prompt."""
    from src.backend.db.crud import get_user_profile

    profile = await get_user_profile(db, seeded_user)
    prompt = build_system_prompt(profile)
    assert "Household size: 2" in prompt


def test_prompt_without_screen_has_no_screen_section():
    """Backward compat: no screen → no 'Current Screen' section."""
    profile = UserProfile()
    result = build_system_prompt(profile)
    assert "Current Screen" not in result


def test_prompt_with_screen_includes_screen_section():
    """Screen param → 'Current Screen' section with screen name."""
    profile = UserProfile()
    result = build_system_prompt(profile, screen="recipes")
    assert "Current Screen" in result
    assert "recipes" in result


def test_prompt_includes_recipe_alternatives_rule():
    """Rule #10: search_recipes should be called with include_alternatives for meal-plan requests."""
    prompt = build_system_prompt(UserProfile())
    assert "include_alternatives: true" in prompt
    assert "swap in place" in prompt


def test_prompt_screen_section_includes_flow():
    """Screen section includes navigation flow."""
    profile = UserProfile()
    result = build_system_prompt(profile, screen="clarify")
    assert "Flow:" in result
