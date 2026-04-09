"""Tests for SQLAlchemy table definitions."""

from sqlalchemy.dialects.postgresql import JSONB, UUID

from src.backend.db.tables import (
    conversation_turns,
    metadata,
    saved_grocery_lists,
    saved_meal_plans,
    saved_recipes,
    sessions,
    user_profiles,
    users,
)


def test_metadata_has_seven_tables():
    assert len(metadata.tables) == 7


def test_all_table_names_present():
    names = set(metadata.tables.keys())
    expected = {
        "users",
        "user_profiles",
        "sessions",
        "conversation_turns",
        "saved_meal_plans",
        "saved_recipes",
        "saved_grocery_lists",
    }
    assert names == expected


def test_users_columns():
    cols = {c.name for c in users.columns}
    assert cols == {"id", "email", "created_at"}


def test_users_pk_is_uuid():
    assert isinstance(users.c.id.type, UUID)
    assert users.c.id.primary_key


def test_user_profiles_pk_is_fk():
    col = user_profiles.c.user_id
    assert col.primary_key
    fk_targets = [fk.target_fullname for fk in col.foreign_keys]
    assert "users.id" in fk_targets


def test_user_profiles_jsonb_columns():
    jsonb_cols = {"dietary_restrictions", "preferred_cuisines", "disliked_ingredients", "preferred_stores"}
    for name in jsonb_cols:
        col = user_profiles.c[name]
        assert isinstance(col.type, JSONB), f"{name} should be JSONB"


def test_sessions_state_snapshot_is_jsonb():
    assert isinstance(sessions.c.state_snapshot.type, JSONB)


def test_conversation_turns_fk_to_sessions():
    fk_targets = [fk.target_fullname for fk in conversation_turns.c.session_id.foreign_keys]
    assert "sessions.id" in fk_targets


def test_conversation_turns_tool_calls_nullable_jsonb():
    col = conversation_turns.c.tool_calls
    assert isinstance(col.type, JSONB)
    assert col.nullable


def test_saved_meal_plans_recipes_is_jsonb():
    assert isinstance(saved_meal_plans.c.recipes.type, JSONB)


def test_saved_recipes_snapshot_is_jsonb():
    assert isinstance(saved_recipes.c.recipe_snapshot.type, JSONB)


def test_saved_grocery_lists_stores_is_jsonb():
    assert isinstance(saved_grocery_lists.c.stores.type, JSONB)


def test_cascade_delete_on_user_fks():
    """All tables referencing users.id should CASCADE on delete."""
    for table in [user_profiles, sessions, saved_meal_plans, saved_recipes, saved_grocery_lists]:
        user_fks = [fk for col in table.columns for fk in col.foreign_keys if fk.target_fullname == "users.id"]
        assert user_fks, f"{table.name} should have FK to users.id"
        for fk in user_fks:
            assert fk.ondelete == "CASCADE", f"{table.name} FK should CASCADE"
