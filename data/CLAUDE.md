# WT1: KB + Data — Scope

## Owns
- `data/` — all KB source data (recipes, PCSV mappings, products, substitutions, glossary)
- `scripts/` — migration scripts (JSON → SQLite)
- `contracts/kb_schema.sql` — SQLite DDL (may propose changes via PR to `main`)

## Imports
- Nothing

## Must not edit
- `prototype/` — read-only reference
- `src/` — all application code (backend, AI, frontend)
- `contracts/` — except `kb_schema.sql`
- `evals/`

## Key task
Migrate JSON data files → SQLite database using `contracts/kb_schema.sql` as the schema definition. The migration script must be reproducible and idempotent.
