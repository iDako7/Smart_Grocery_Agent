"""SQLAlchemy Core table definitions matching contracts/pg_schema.sql."""

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("email", Text, unique=True, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
)

user_profiles = Table(
    "user_profiles",
    metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("household_size", Integer, nullable=False, server_default=text("2")),
    Column("dietary_restrictions", JSONB, nullable=False, server_default=text("'[]'")),
    Column("preferred_cuisines", JSONB, nullable=False, server_default=text("'[]'")),
    Column("disliked_ingredients", JSONB, nullable=False, server_default=text("'[]'")),
    Column("preferred_stores", JSONB, nullable=False, server_default=text("'[\"costco\"]'")),
    Column("notes", Text, nullable=False, server_default=text("''")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
)

sessions = Table(
    "sessions",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("screen", Text, nullable=False, server_default=text("'home'")),
    Column("state_snapshot", JSONB, nullable=False, server_default=text("'{}'")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
)

conversation_turns = Table(
    "conversation_turns",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("session_id", UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
    Column("role", Text, nullable=False),
    Column("content", Text, nullable=False),
    Column("screen", Text, nullable=False, server_default=text("'home'")),
    Column("tool_calls", JSONB),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Index("idx_turns_session", "session_id", "id"),
)

saved_meal_plans = Table(
    "saved_meal_plans",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("name", Text, nullable=False, server_default=text("''")),
    Column("recipes", JSONB, nullable=False, server_default=text("'[]'")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
)

saved_recipes = Table(
    "saved_recipes",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("recipe_id", Text),
    Column("recipe_snapshot", JSONB, nullable=False),
    Column("notes", Text, nullable=False, server_default=text("''")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
)

saved_grocery_lists = Table(
    "saved_grocery_lists",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("name", Text, nullable=False, server_default=text("''")),
    Column("stores", JSONB, nullable=False, server_default=text("'[]'")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
)

# Secondary indexes (matching pg_schema.sql)
Index("idx_sessions_user", sessions.c.user_id)
Index("idx_meal_plans_user", saved_meal_plans.c.user_id)
Index("idx_saved_recipes_user", saved_recipes.c.user_id)
Index("idx_grocery_lists_user", saved_grocery_lists.c.user_id)
