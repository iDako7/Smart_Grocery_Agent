-- contracts/pg_schema.sql
-- PostgreSQL DDL for mutable data (sessions, users, saved content).
-- Status: unfrozen (freezes when WT2 has PostgreSQL integration working)
-- Breaking changes require a PR to main + contracts/CHANGELOG.md entry.

-- users table
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_profiles table (1:1 with users)
-- Separated from users to isolate frequently-updated profile from auth record.
-- JSONB arrays for list fields — profile is read as a whole document (~500 tokens).
CREATE TABLE user_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    household_size       INTEGER NOT NULL DEFAULT 2,
    dietary_restrictions JSONB NOT NULL DEFAULT '[]',
    preferred_cuisines   JSONB NOT NULL DEFAULT '[]',
    disliked_ingredients JSONB NOT NULL DEFAULT '[]',
    preferred_stores     JSONB NOT NULL DEFAULT '["costco"]',
    notes                TEXT NOT NULL DEFAULT '',
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sessions table
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    screen          TEXT NOT NULL DEFAULT 'home',
    state_snapshot  JSONB NOT NULL DEFAULT '{}',
        -- Persisted structured state for resume: {pcsv, recipes, grocery_list}.
        -- Updated by backend after each /chat completes.
        -- GET /session/{id} reads this directly — no turn replay needed.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- conversation_turns table (ordered turns within a session)
CREATE TABLE conversation_turns (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,                          -- user | assistant | system | tool
    content         TEXT NOT NULL,
    screen          TEXT NOT NULL DEFAULT 'home',           -- tagged per turn for resumability (spec §2)
    tool_calls      JSONB,                                 -- null for user/assistant text turns
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_turns_session ON conversation_turns(session_id, id);

-- saved_meal_plans
-- recipes stored as full RecipeDetail snapshots (JSONB), not just IDs.
-- Preserves AI-generated recipes and decouples from KB updates.
CREATE TABLE saved_meal_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    recipes         JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- saved_recipes
-- recipe_snapshot stores the full recipe at save time as JSONB.
CREATE TABLE saved_recipes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id       TEXT,                                  -- KB recipe id, or null for AI-generated
    recipe_snapshot JSONB NOT NULL,
    notes           TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- saved_grocery_lists
-- stores stored as full GroceryStore structure with checked state.
CREATE TABLE saved_grocery_lists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    stores          JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_meal_plans_user ON saved_meal_plans(user_id);
CREATE INDEX idx_saved_recipes_user ON saved_recipes(user_id);
CREATE INDEX idx_grocery_lists_user ON saved_grocery_lists(user_id);
