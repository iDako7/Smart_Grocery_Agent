-- contracts/kb_schema.sql
-- SQLite DDL for the read-only knowledge base.
-- Status: unfrozen (freezes when WT1 merges to main)
-- Breaking changes require a PR to main + contracts/CHANGELOG.md entry.

-- recipes table
-- Source: data/recipes.json
CREATE TABLE recipes (
    id              TEXT PRIMARY KEY,            -- e.g., "r001"
    name            TEXT NOT NULL,
    name_zh         TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',
    source_url      TEXT NOT NULL DEFAULT '',
    cuisine         TEXT NOT NULL DEFAULT '',
    cooking_method  TEXT NOT NULL DEFAULT '',
    effort_level    TEXT NOT NULL DEFAULT 'medium' CHECK (effort_level IN ('quick', 'medium', 'long')),
    time_minutes    INTEGER NOT NULL DEFAULT 0,      -- informational, not a search filter
    flavor_tags     TEXT NOT NULL DEFAULT '[]',       -- JSON array of strings
    serves          INTEGER NOT NULL DEFAULT 0,
    ingredients     TEXT NOT NULL DEFAULT '[]',       -- JSON array of {name, amount, pcsv}
    instructions    TEXT NOT NULL DEFAULT '',
    is_ai_generated INTEGER NOT NULL DEFAULT 0        -- 0=false, 1=true (SQLite boolean)
);

-- pcsv_mappings table
-- Source: data/pcsv_mappings.json (flat dict: ingredient → categories)
CREATE TABLE pcsv_mappings (
    ingredient      TEXT PRIMARY KEY,                 -- normalized lowercase ingredient name
    categories      TEXT NOT NULL DEFAULT '[]'        -- JSON array: ["protein"], ["protein","carb"], etc.
);

-- products table
-- Source: data/costco_raw/*.json
CREATE TABLE products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      TEXT NOT NULL,                    -- original from store data, e.g., "35994022"
    name            TEXT NOT NULL,
    size            TEXT NOT NULL DEFAULT '',
    brand_name      TEXT NOT NULL DEFAULT '',         -- null in source data coerced to ''
    category        TEXT NOT NULL DEFAULT '',         -- e.g., "Coffee Drinks", "Whole Eggs"
    department      TEXT NOT NULL DEFAULT '',         -- e.g., "beverages", "meat_seafood"
    store           TEXT NOT NULL DEFAULT 'costco',   -- "costco" | "community_market"
    available       INTEGER NOT NULL DEFAULT 1,       -- 0=false, 1=true
    UNIQUE(product_id, store)
);

-- substitutions table
-- Source: data/substitutions.json
CREATE TABLE substitutions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient      TEXT NOT NULL,
    substitute      TEXT NOT NULL,
    match_quality   TEXT NOT NULL DEFAULT 'fair' CHECK (match_quality IN ('good', 'fair', 'poor')),
    reason          TEXT NOT NULL DEFAULT 'unavailable' CHECK (reason IN ('unavailable', 'dietary', 'preference')),
    notes           TEXT NOT NULL DEFAULT ''
);

-- glossary table
-- Source: data/glossary.json
CREATE TABLE glossary (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    en              TEXT NOT NULL,
    zh              TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'ingredient', -- ingredient | dish_name | cooking_term | grocery_term
    notes           TEXT NOT NULL DEFAULT ''
);

-- Indexes for query patterns used by tool handlers
CREATE INDEX idx_recipes_cuisine ON recipes(cuisine);
CREATE INDEX idx_recipes_cooking_method ON recipes(cooking_method);
CREATE INDEX idx_recipes_effort_level ON recipes(effort_level);
CREATE INDEX idx_products_store ON products(store);
CREATE INDEX idx_products_department ON products(department);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_substitutions_ingredient ON substitutions(ingredient);
CREATE INDEX idx_glossary_en ON glossary(en);
CREATE INDEX idx_glossary_zh ON glossary(zh);
CREATE INDEX idx_glossary_category ON glossary(category);
