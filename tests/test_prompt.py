"""Tests for prompt assembly."""

from src.ai.prompt import build_system_prompt, build_system_blocks

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


def test_prompt_contains_dish_count_rule():
    """Rule 11 must include the presentation contract + party-size → max_results ladder."""
    prompt = build_system_prompt(UserProfile())
    # Presentation contract (issue #87 fix)
    assert "Presentation contract" in prompt
    assert "MUST present" in prompt
    # Count contract + ladder
    assert "max_results" in prompt
    assert "1 person → 1-2" in prompt
    assert "7+ people → 4-5" in prompt


# ---------------------------------------------------------------------------
# Phase 3 prompt caching — Option A ordering + build_system_blocks (#116)
# ---------------------------------------------------------------------------


def test_build_system_blocks_option_a_order():
    """build_system_blocks returns 4 blocks in Option-A order:
    persona → rules → tool_instructions → profile.
    """
    blocks = build_system_blocks(UserProfile())
    assert len(blocks) == 4
    assert "# Smart Grocery Assistant" in blocks[0]["text"]  # persona
    assert "## Rules" in blocks[1]["text"]                   # rules
    assert "## Tool Usage" in blocks[2]["text"]              # tool_instructions
    assert "## User Profile" in blocks[3]["text"]            # profile


def test_build_system_blocks_with_screen_appends_screen_block():
    """build_system_blocks(profile, screen=...) returns 5 blocks;
    block 4 is the Current Screen section.
    """
    blocks = build_system_blocks(UserProfile(), screen="clarify")
    assert len(blocks) == 5
    assert "## Current Screen" in blocks[4]["text"]


def test_build_system_blocks_block_shape():
    """Every block must be a dict with exactly keys {'type', 'text'},
    type == 'text', text is a non-empty string, and no cache_control key.
    """
    blocks = build_system_blocks(UserProfile(), screen="recipes")
    for i, block in enumerate(blocks):
        assert set(block.keys()) == {"type", "text"}, (
            f"Block {i} has unexpected keys: {set(block.keys())}"
        )
        assert block["type"] == "text", f"Block {i} type is not 'text'"
        assert isinstance(block["text"], str) and block["text"], (
            f"Block {i} text is empty or not a string"
        )
        assert "cache_control" not in block, (
            f"Block {i} must not have cache_control at this layer (Phase 2 concern)"
        )
