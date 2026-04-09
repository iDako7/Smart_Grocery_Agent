# WT1: KB + Data — Implementation Plan

**Date:** 2026-04-09 | **Status:** Active | **Branch:** `wt1-kb-data`

---

## Scope

- **Owns:** `data/`, `scripts/`, `contracts/kb_schema.sql`
- **Must not edit:** `prototype/`, `src/`, `contracts/` (except `kb_schema.sql`)
- **Output:** `data/kb.sqlite` (committed to git)

---

## Critical Decisions

| # | Decision | Resolution |
|---|---|---|
| D1 | `effort_level` derivation | Derive from `time_minutes`: quick <=15, medium 16-45, long >45 |
| D2 | `flavor_tags` population | Manually curate for all 20 existing recipes |
| D3 | SQLite file location | `data/kb.sqlite` — alongside source data, within WT1's owned directory |
| D4 | SQLite committed or gitignored | **Committed** — WT2 can use immediately after rebase without running migration |
| D5 | Validation approach | **Separate `scripts/validate_kb.py`** — clean separation, runnable independently by WT2 |
| D6 | Future store support | Schema accommodates `community_market` via `UNIQUE(product_id, store)` — seed only Costco in Phase 1 |
| D7 | Scraping timing | Parallel with core migration — two independent tasks, not sequential |
| D8 | Scraping details (API patterns, recipe count, script organization) | **Open — deferred to each scraping session** |

---

## Work Structure

```
Phase 1 ─────────────────────  Task A ──────────────  Task B ──────────────
(core, critical path)          (parallel)              (parallel)
                               Scrape Save-On-Foods    Scrape CookWell
                               → community_market      → new recipes
                               products                + pcsv + glossary

         \                          |                       |
          \                         |                       |
           \                        v                       v
            ────────────────> Phase 2: Integrate scraped data
                             Re-migrate → updated kb.sqlite
                             → Merge to main
```

---

## Phase 1: Core Migration (critical path → merge to `main`, unblocks WT2)

### 1a. Curate missing recipe fields

- Add `effort_level` to each recipe in `data/recipes.json` (derived from `time_minutes`)
- Add `flavor_tags` to each recipe (manually curated per recipe)
- No schema changes needed — fields already defined in `contracts/kb_schema.sql`

### 1b. Migration script (`scripts/migrate_kb.py`)

- **Dependencies:** Python stdlib only (`sqlite3`, `json`, `pathlib`)
- **Idempotent:** drop-if-exists → create tables → insert → create indexes
- **Data sources → tables:**

| Source | Table | Coercions |
|---|---|---|
| `data/recipes.json` | `recipes` | `ingredients` list → JSON string, `flavor_tags` list → JSON string, `is_ai_generated` bool → int |
| `data/pcsv_mappings.json` | `pcsv_mappings` | dict entries → rows, categories list → JSON string |
| `data/costco_raw/*.json` (7 files) | `products` | `productId` → `product_id`, `brandName` null → `''`, `available` bool → int, department from file-level field, store hardcoded `'costco'`, drop `retailerRef`/`imageUrl` |
| `data/substitutions.json` | `substitutions` | Direct mapping |
| `data/glossary.json` | `glossary` | Direct mapping |

- **Output:** `data/kb.sqlite`

### 1c. Validation script (`scripts/validate_kb.py`)

- Row count checks (every table matches source data count)
- Spot-check queries mimicking prototype tool access patterns:
  - PCSV lookup by ingredient
  - Recipe filter by cuisine / effort_level
  - Recipe detail by ID
  - Product search by name substring
  - Substitution lookup by ingredient
  - Glossary lookup by EN and ZH
- Constraint checks (no null where NOT NULL, effort_level values valid, etc.)
- Print pass/fail report to stdout

### Merge → `main` (unblocks WT2)

---

## Task A: Scrape Save-On-Foods (parallel, independent)

- **Target:** `https://www.saveonfoods.com/sm/planning/rsid/1982`
- **Output:** `data/saveonfoods_raw/*.json` (same structure as `costco_raw/`)
- **Schema:** products table, `store = 'community_market'`
- **Open questions:** API pattern discovery, department mapping, data normalization
- **Script:** TBD (decided in scraping session)

## Task B: Scrape CookWell (parallel, independent)

- **Target:** `https://www.cookwell.com/discover`
- **Output:** New entries appended to `data/recipes.json`
- **Schema:** Must match existing recipe structure including `effort_level`, `flavor_tags`, ingredient PCSV roles
- **Downstream:** Requires expanding `data/pcsv_mappings.json` and `data/glossary.json` for new ingredients
- **Open questions:** Recipe count target, PCSV role assignment strategy, glossary expansion
- **Script:** TBD (decided in scraping session)

---

## Phase 2: Integrate Scraped Data (sequential, after Phase 1 + Tasks A/B)

### 2a. Expand supporting data

- Add new ingredients to `data/pcsv_mappings.json`
- Add new EN/ZH terms to `data/glossary.json`

### 2b. Re-migrate

- Re-run `scripts/migrate_kb.py` — picks up all new data automatically

### 2c. Re-validate

- Re-run `scripts/validate_kb.py` — counts now reflect expanded dataset

### Merge → `main` (WT2 rebases for expanded KB)

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `effort_level`/`flavor_tags` curation takes time | Low | Only 20 recipes, straightforward |
| Save-On-Foods anti-scraping / dynamic SPA | Medium | Deferred to scraping session; doesn't block Phase 1 |
| New recipe ingredients missing from PCSV mappings | Medium | Phase 2a explicitly handles; validate_kb.py can flag unmapped ingredients |
| Duplicate `productId` across Costco departments | Low | Check during migration; UNIQUE constraint will catch it |
