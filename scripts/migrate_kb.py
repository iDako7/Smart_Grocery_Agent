"""Migrate JSON source data into SQLite knowledge base.

Usage: python3 -m scripts.migrate_kb

Reads schema from contracts/kb_schema.sql and loads data from data/*.json.
Output: data/kb.sqlite (idempotent — deletes and rebuilds on each run).
Dependencies: Python stdlib only.
"""

import contextlib
import json
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SCHEMA_PATH = PROJECT_ROOT / "contracts" / "kb_schema.sql"
DEFAULT_DB_PATH = DATA_DIR / "kb.sqlite"


def _load_recipes(cur: sqlite3.Cursor, data_dir: Path) -> int:
    recipes = json.loads((data_dir / "recipes.json").read_text())
    for r in recipes:
        cur.execute(
            """INSERT INTO recipes
               (id, name, name_zh, source, source_url, cuisine, cooking_method,
                effort_level, time_minutes, flavor_tags, serves, ingredients,
                instructions, is_ai_generated)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                r["id"],
                r["name"],
                r["name_zh"],
                r["source"],
                r["source_url"],
                r["cuisine"],
                r["cooking_method"],
                r["effort_level"],
                r["time_minutes"],
                json.dumps(r["flavor_tags"]),
                r["serves"],
                json.dumps(r["ingredients"]),
                r["instructions"],
                int(r["is_ai_generated"]),
            ),
        )
    return len(recipes)


def _load_pcsv_mappings(cur: sqlite3.Cursor, data_dir: Path) -> int:
    mappings = json.loads((data_dir / "pcsv_mappings.json").read_text())
    for ingredient, categories in mappings.items():
        cur.execute(
            "INSERT INTO pcsv_mappings (ingredient, categories) VALUES (?,?)",
            (ingredient, json.dumps(categories)),
        )
    return len(mappings)


def _load_products(cur: sqlite3.Cursor, data_dir: Path) -> int:
    # Each entry: (raw_dir_name, store_label)
    store_sources = [
        ("costco_raw", "costco"),
        ("saveonfoods_raw", "community_market"),
    ]
    total = 0
    seen: set[tuple[str, str]] = set()
    for raw_dir_name, store in store_sources:
        raw_dir = data_dir / raw_dir_name
        if not raw_dir.exists():
            continue
        for fpath in sorted(raw_dir.glob("*.json")):
            data = json.loads(fpath.read_text())
            department = data["department"]
            for p in data["products"]:
                pid = str(p["productId"])
                dedup_key = (pid, store)
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)
                cur.execute(
                    """INSERT INTO products
                       (product_id, name, size, brand_name, category, department, store, available)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (
                        pid,
                        p["name"],
                        p.get("size") or "",
                        p.get("brandName") or "",
                        p.get("category", ""),
                        department,
                        store,
                        int(p.get("available", True)),
                    ),
                )
                total += 1
    return total


def _load_substitutions(cur: sqlite3.Cursor, data_dir: Path) -> int:
    subs = json.loads((data_dir / "substitutions.json").read_text())
    for s in subs:
        cur.execute(
            """INSERT INTO substitutions
               (ingredient, substitute, match_quality, reason, notes)
               VALUES (?,?,?,?,?)""",
            (s["ingredient"], s["substitute"], s["match_quality"], s["reason"], s["notes"]),
        )
    return len(subs)


def _load_glossary(cur: sqlite3.Cursor, data_dir: Path) -> int:
    entries = json.loads((data_dir / "glossary.json").read_text())
    for g in entries:
        cur.execute(
            "INSERT INTO glossary (en, zh, category, notes) VALUES (?,?,?,?)",
            (g["en"], g["zh"], g["category"], g["notes"]),
        )
    return len(entries)


def migrate(db_path: Path = None, data_dir: Path = None) -> Path:
    """Run the full migration. Returns the path to the created DB."""
    if db_path is None:
        db_path = DEFAULT_DB_PATH
    db_path = Path(db_path)
    if data_dir is None:
        data_dir = DATA_DIR
    data_dir = Path(data_dir)

    # Idempotency: delete and rebuild
    if db_path.exists():
        db_path.unlink()

    db_path.parent.mkdir(parents=True, exist_ok=True)
    schema_sql = SCHEMA_PATH.read_text()

    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(schema_sql)
        cur = conn.cursor()

        n = _load_recipes(cur, data_dir)
        print(f"Loaded {n} recipes")

        n = _load_pcsv_mappings(cur, data_dir)
        print(f"Loaded {n} PCSV mappings")

        n = _load_products(cur, data_dir)
        print(f"Loaded {n} products")

        n = _load_substitutions(cur, data_dir)
        print(f"Loaded {n} substitutions")

        n = _load_glossary(cur, data_dir)
        print(f"Loaded {n} glossary entries")

        conn.commit()
    except Exception:
        # Explicitly roll back any partial writes before closing the connection.
        # sqlite3 would discard the transaction on close anyway, but the
        # explicit call makes the intent unambiguous and is robust against
        # future changes to the connection lifecycle.
        conn.rollback()
        with contextlib.suppress(OSError):
            db_path.unlink(missing_ok=True)
        raise
    finally:
        conn.close()

    print(f"Database written to {db_path}")
    return db_path


if __name__ == "__main__":
    migrate()
