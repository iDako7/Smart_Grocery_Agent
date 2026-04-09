"""Initial schema — 7 tables matching contracts/pg_schema.sql.

Revision ID: 001
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.Text, unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "user_profiles",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("household_size", sa.Integer, nullable=False, server_default=sa.text("2")),
        sa.Column("dietary_restrictions", JSONB, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("preferred_cuisines", JSONB, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("disliked_ingredients", JSONB, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("preferred_stores", JSONB, nullable=False, server_default=sa.text("'[\"costco\"]'")),
        sa.Column("notes", sa.Text, nullable=False, server_default=sa.text("''")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("screen", sa.Text, nullable=False, server_default=sa.text("'home'")),
        sa.Column("state_snapshot", JSONB, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "conversation_turns",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("screen", sa.Text, nullable=False, server_default=sa.text("'home'")),
        sa.Column("tool_calls", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_turns_session", "conversation_turns", ["session_id", "id"])

    op.create_table(
        "saved_meal_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text, nullable=False, server_default=sa.text("''")),
        sa.Column("recipes", JSONB, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "saved_recipes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipe_id", sa.Text),
        sa.Column("recipe_snapshot", JSONB, nullable=False),
        sa.Column("notes", sa.Text, nullable=False, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "saved_grocery_lists",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text, nullable=False, server_default=sa.text("''")),
        sa.Column("stores", JSONB, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Secondary indexes
    op.create_index("idx_sessions_user", "sessions", ["user_id"])
    op.create_index("idx_meal_plans_user", "saved_meal_plans", ["user_id"])
    op.create_index("idx_saved_recipes_user", "saved_recipes", ["user_id"])
    op.create_index("idx_grocery_lists_user", "saved_grocery_lists", ["user_id"])


def downgrade() -> None:
    op.drop_table("saved_grocery_lists")
    op.drop_table("saved_recipes")
    op.drop_table("saved_meal_plans")
    op.drop_table("conversation_turns")
    op.drop_table("sessions")
    op.drop_table("user_profiles")
    op.drop_table("users")
