"""Validate the KB SQLite database after migration.

Usage: python3 -m scripts.validate_kb

Checks row counts, spot-check queries, and constraint domains.
Exit code 0 if all pass, 1 if any fail.
Dependencies: Python stdlib only.
"""
import json
import sqlite3
import sys
from collections import namedtuple
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_DB_PATH = DATA_DIR / "kb.sqlite"

CheckResult = namedtuple("CheckResult", ["name", "passed", "detail"])

# Explicit whitelist of table names that may appear in f-string SQL queries.
# Trust boundary: only names in this set are ever interpolated into SQL.
# Any table name not present here will raise ValueError before query execution.
ALLOWED_TABLES: frozenset = frozenset({
    "recipes",
    "pcsv_mappings",
    "products",
    "substitutions",
    "glossary",
})

# Expected counts derived from source data at migration time.
# All keys must be members of ALLOWED_TABLES (asserted at module load time below).
EXPECTED_COUNTS = {
    "recipes": 70,
    "pcsv_mappings": 378,
    "products": 6401,
    "substitutions": 20,
    "glossary": 409,
}

# Module-load assertion: every EXPECTED_COUNTS key must be in ALLOWED_TABLES.
# This catches accidental drift between the two constants during development.
assert set(EXPECTED_COUNTS.keys()) <= ALLOWED_TABLES, (
    "EXPECTED_COUNTS contains table names not in ALLOWED_TABLES: "
    f"{set(EXPECTED_COUNTS.keys()) - ALLOWED_TABLES}"
)


def _check_row_counts(conn: sqlite3.Connection) -> list:
    results = []
    for table, expected in EXPECTED_COUNTS.items():
        # Safety check: table name must be in the explicit whitelist before
        # being interpolated into SQL.  EXPECTED_COUNTS keys are controlled
        # by this module, but we validate defensively to prevent any future
        # mutation (e.g. from tests or calling code) from reaching sqlite.
        if table not in ALLOWED_TABLES:
            raise ValueError(
                f"Table name '{table}' is not in ALLOWED_TABLES; "
                "refusing to interpolate into SQL query."
            )
        actual = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        passed = actual == expected
        results.append(CheckResult(
            name=f"{table} row count",
            passed=passed,
            detail=f"{actual}/{expected}",
        ))
    return results


def _check_spot_queries(conn: sqlite3.Connection) -> list:
    results = []

    # PCSV lookup
    row = conn.execute("SELECT categories FROM pcsv_mappings WHERE ingredient = 'chicken'").fetchone()
    passed = row is not None and json.loads(row[0]) == ["protein"]
    results.append(CheckResult("pcsv lookup chicken", passed, f"got {row[0] if row else 'NULL'}"))

    # Recipe filter by cuisine
    rows = conn.execute("SELECT id FROM recipes WHERE cuisine = 'Korean'").fetchall()
    passed = len(rows) >= 4
    results.append(CheckResult("recipe filter by cuisine Korean", passed, f"{len(rows)} results"))

    # Recipe filter by effort_level
    rows = conn.execute("SELECT id FROM recipes WHERE effort_level = 'quick'").fetchall()
    passed = len(rows) >= 1
    results.append(CheckResult("recipe filter effort_level quick", passed, f"{len(rows)} results"))

    # Recipe detail by ID
    row = conn.execute("SELECT ingredients FROM recipes WHERE id = 'r001'").fetchone()
    try:
        items = json.loads(row[0]) if row else None
        passed = isinstance(items, list) and len(items) > 0
    except (json.JSONDecodeError, TypeError):
        passed = False
    results.append(CheckResult("recipe detail r001", passed, f"{len(items) if passed else 0} ingredients"))

    # Product search by name
    rows = conn.execute("SELECT name FROM products WHERE name LIKE '%chicken%'").fetchall()
    passed = len(rows) > 0
    results.append(CheckResult("product search chicken", passed, f"{len(rows)} results"))

    # Substitution lookup
    row = conn.execute("SELECT substitute FROM substitutions WHERE ingredient = 'gochujang'").fetchone()
    passed = row is not None and "miso" in row[0].lower()
    results.append(CheckResult("substitution lookup gochujang", passed, f"got {row[0] if row else 'NULL'}"))

    # Glossary EN lookup
    row = conn.execute("SELECT zh FROM glossary WHERE en = 'chicken wings'").fetchone()
    passed = row is not None and row[0] == "鸡翅"
    results.append(CheckResult("glossary EN chicken wings", passed, f"got {row[0] if row else 'NULL'}"))

    # Glossary ZH lookup
    row = conn.execute("SELECT en FROM glossary WHERE zh = '酱油'").fetchone()
    passed = row is not None and row[0] == "soy sauce"
    results.append(CheckResult("glossary ZH 酱油", passed, f"got {row[0] if row else 'NULL'}"))

    return results


def _check_constraints(conn: sqlite3.Connection) -> list:
    results = []

    # effort_level domain
    vals = {r[0] for r in conn.execute("SELECT DISTINCT effort_level FROM recipes")}
    passed = vals.issubset({"quick", "medium", "long"})
    results.append(CheckResult("effort_level domain", passed, f"values: {vals}"))

    # match_quality domain
    vals = {r[0] for r in conn.execute("SELECT DISTINCT match_quality FROM substitutions")}
    passed = vals.issubset({"good", "fair", "poor"})
    results.append(CheckResult("match_quality domain", passed, f"values: {vals}"))

    # reason domain
    vals = {r[0] for r in conn.execute("SELECT DISTINCT reason FROM substitutions")}
    passed = vals.issubset({"unavailable", "dietary", "preference"})
    results.append(CheckResult("reason domain", passed, f"values: {vals}"))

    # glossary category domain
    vals = {r[0] for r in conn.execute("SELECT DISTINCT category FROM glossary")}
    passed = vals.issubset({"ingredient", "dish_name", "cooking_term", "grocery_term"})
    results.append(CheckResult("glossary category domain", passed, f"values: {vals}"))

    # products store domain
    vals = {r[0] for r in conn.execute("SELECT DISTINCT store FROM products")}
    passed = vals == {"costco", "community_market"}
    results.append(CheckResult("products store domain", passed, f"values: {vals}"))

    # no NULL brand_name
    count = conn.execute("SELECT COUNT(*) FROM products WHERE brand_name IS NULL").fetchone()[0]
    passed = count == 0
    results.append(CheckResult("no NULL brand_name", passed, f"{count} nulls found"))

    # is_ai_generated domain
    vals = {r[0] for r in conn.execute("SELECT DISTINCT is_ai_generated FROM recipes")}
    passed = vals.issubset({0, 1})
    results.append(CheckResult("is_ai_generated domain", passed, f"values: {vals}"))

    # non-empty instructions
    count = conn.execute("SELECT COUNT(*) FROM recipes WHERE instructions = ''").fetchone()[0]
    passed = count == 0
    results.append(CheckResult("non-empty instructions", passed, f"{count} empty"))

    return results


def validate(db_path: Path = None) -> list:
    """Validate the KB database. Returns a list of CheckResult."""
    if db_path is None:
        db_path = DEFAULT_DB_PATH
    db_path = Path(db_path)

    conn = sqlite3.connect(db_path)
    try:
        results = []
        results.extend(_check_row_counts(conn))
        results.extend(_check_spot_queries(conn))
        results.extend(_check_constraints(conn))
        return results
    finally:
        conn.close()


def _print_report(results: list) -> bool:
    """Print results and return True if all passed."""
    for r in results:
        tag = "PASS" if r.passed else "FAIL"
        print(f"[{tag}] {r.name}: {r.detail}")

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    print(f"\nResults: {passed}/{len(results)} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    results = validate()
    all_ok = _print_report(results)
    sys.exit(0 if all_ok else 1)
