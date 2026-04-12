"""Tests for Phase 1b: Migration script (scripts/migrate_kb.py).

TDD RED phase — these tests define the contract the migration must satisfy.
All tests use a temp DB file for isolation.
"""

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Expected counts from actual source data
EXPECTED_RECIPES = 120
EXPECTED_PCSV = 564
EXPECTED_PRODUCTS = 6401  # Costco + Save-On-Foods after dedup
EXPECTED_SUBSTITUTIONS = 20
EXPECTED_GLOSSARY = 595

EXPECTED_TABLES = {"recipes", "pcsv_mappings", "products", "substitutions", "glossary"}
EXPECTED_INDEXES = {
    "idx_recipes_cuisine",
    "idx_recipes_cooking_method",
    "idx_recipes_effort_level",
    "idx_products_store",
    "idx_products_department",
    "idx_products_category",
    "idx_substitutions_ingredient",
    "idx_glossary_en",
    "idx_glossary_zh",
    "idx_glossary_category",
}


def _run_migration(db_path: Path) -> Path:
    """Import and run migration, returning the db path."""
    from scripts.migrate_kb import migrate

    return migrate(db_path=db_path)


class TestMigrateImport(unittest.TestCase):
    """Migration function is importable and accepts db_path."""

    def test_migrate_is_callable(self):
        from scripts.migrate_kb import migrate

        self.assertTrue(callable(migrate))

    def test_migrate_accepts_db_path(self):
        import inspect

        from scripts.migrate_kb import migrate

        sig = inspect.signature(migrate)
        self.assertIn("db_path", sig.parameters)

    def test_migrate_accepts_data_dir(self):
        import inspect

        from scripts.migrate_kb import migrate

        sig = inspect.signature(migrate)
        self.assertIn("data_dir", sig.parameters)


class MigrateTestBase(unittest.TestCase):
    """Base class that runs migration into a temp DB once per test class."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        cls._tmp.close()
        cls.db_path = Path(cls._tmp.name)
        _run_migration(cls.db_path)
        cls.conn = sqlite3.connect(cls.db_path)
        cls.conn.row_factory = sqlite3.Row

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        cls.db_path.unlink(missing_ok=True)


class TestSchemaCreation(MigrateTestBase):
    def test_all_tables_exist(self):
        cur = self.conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = {row["name"] for row in cur}
        self.assertEqual(tables, EXPECTED_TABLES)

    def test_all_indexes_exist(self):
        cur = self.conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        indexes = {row["name"] for row in cur}
        self.assertEqual(indexes, EXPECTED_INDEXES)


class TestIdempotency(unittest.TestCase):
    def test_run_twice_no_error_same_counts(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        tmp.close()
        db_path = Path(tmp.name)
        try:
            _run_migration(db_path)
            conn1 = sqlite3.connect(db_path)
            counts1 = {t: conn1.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in EXPECTED_TABLES}
            conn1.close()

            # Second run — should not raise and counts should match
            _run_migration(db_path)
            conn2 = sqlite3.connect(db_path)
            counts2 = {t: conn2.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in EXPECTED_TABLES}
            conn2.close()

            self.assertEqual(counts1, counts2)
        finally:
            Path(db_path).unlink(missing_ok=True)


class TestRecipesTable(MigrateTestBase):
    def test_row_count(self):
        count = self.conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        self.assertEqual(count, EXPECTED_RECIPES)

    def test_r001_spot_check(self):
        row = self.conn.execute("SELECT * FROM recipes WHERE id = 'r001'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["name"], "Korean BBQ Pork Belly")
        self.assertEqual(row["effort_level"], "medium")
        self.assertEqual(row["is_ai_generated"], 0)
        ingredients = json.loads(row["ingredients"])
        self.assertEqual(len(ingredients), 9)

    def test_r003_quick(self):
        row = self.conn.execute("SELECT effort_level FROM recipes WHERE id = 'r003'").fetchone()
        self.assertEqual(row["effort_level"], "quick")

    def test_r008_long(self):
        row = self.conn.execute("SELECT effort_level FROM recipes WHERE id = 'r008'").fetchone()
        self.assertEqual(row["effort_level"], "long")

    def test_effort_level_domain(self):
        cur = self.conn.execute("SELECT DISTINCT effort_level FROM recipes")
        values = {row[0] for row in cur}
        self.assertTrue(values.issubset({"quick", "medium", "long"}))

    def test_ingredients_json_valid(self):
        for row in self.conn.execute("SELECT id, ingredients FROM recipes"):
            items = json.loads(row["ingredients"])
            self.assertIsInstance(items, list, f"{row['id']} ingredients not a list")
            for item in items:
                self.assertIn("name", item)
                self.assertIn("amount", item)
                self.assertIn("pcsv", item)

    def test_flavor_tags_json_valid(self):
        for row in self.conn.execute("SELECT id, flavor_tags FROM recipes"):
            tags = json.loads(row["flavor_tags"])
            self.assertIsInstance(tags, list, f"{row['id']} flavor_tags not a list")
            self.assertGreater(len(tags), 0)


class TestPcsvMappingsTable(MigrateTestBase):
    def test_row_count(self):
        count = self.conn.execute("SELECT COUNT(*) FROM pcsv_mappings").fetchone()[0]
        self.assertEqual(count, EXPECTED_PCSV)

    def test_chicken_is_protein(self):
        row = self.conn.execute("SELECT categories FROM pcsv_mappings WHERE ingredient = 'chicken'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(json.loads(row["categories"]), ["protein"])

    def test_soy_sauce_is_sauce(self):
        row = self.conn.execute("SELECT categories FROM pcsv_mappings WHERE ingredient = 'soy sauce'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(json.loads(row["categories"]), ["sauce"])

    def test_all_categories_json_valid(self):
        for row in self.conn.execute("SELECT ingredient, categories FROM pcsv_mappings"):
            cats = json.loads(row["categories"])
            self.assertIsInstance(cats, list, f"{row['ingredient']} categories not a list")


class TestProductsTable(MigrateTestBase):
    def test_row_count(self):
        count = self.conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        self.assertEqual(count, EXPECTED_PRODUCTS)

    def test_expected_stores(self):
        cur = self.conn.execute("SELECT DISTINCT store FROM products")
        stores = {row[0] for row in cur}
        self.assertEqual(stores, {"costco", "community_market"})

    def test_no_null_brand_name(self):
        count = self.conn.execute("SELECT COUNT(*) FROM products WHERE brand_name IS NULL").fetchone()[0]
        self.assertEqual(count, 0, "Found NULL brand_name values — coercion failed")

    def test_department_populated(self):
        count = self.conn.execute(
            "SELECT COUNT(*) FROM products WHERE department = '' OR department IS NULL"
        ).fetchone()[0]
        self.assertEqual(count, 0, "Found products with empty or NULL department")

    def test_available_is_integer(self):
        cur = self.conn.execute("SELECT DISTINCT available FROM products")
        values = {row[0] for row in cur}
        self.assertTrue(values.issubset({0, 1}), f"available has non-boolean values: {values}")

    def test_unique_product_id_store(self):
        total = self.conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        distinct = self.conn.execute("SELECT COUNT(DISTINCT product_id || '|' || store) FROM products").fetchone()[0]
        self.assertEqual(total, distinct, "Duplicate (product_id, store) pairs found")

    def test_spot_check_beverage(self):
        row = self.conn.execute("SELECT * FROM products WHERE product_id = '35994022'").fetchone()
        self.assertIsNotNone(row)
        self.assertIn("SToK", row["name"])
        self.assertEqual(row["store"], "costco")
        self.assertEqual(row["department"], "beverages")


class TestSubstitutionsTable(MigrateTestBase):
    def test_row_count(self):
        count = self.conn.execute("SELECT COUNT(*) FROM substitutions").fetchone()[0]
        self.assertEqual(count, EXPECTED_SUBSTITUTIONS)

    def test_gochujang_exists(self):
        row = self.conn.execute("SELECT substitute FROM substitutions WHERE ingredient = 'gochujang'").fetchone()
        self.assertIsNotNone(row)
        self.assertIn("miso", row["substitute"])

    def test_match_quality_domain(self):
        cur = self.conn.execute("SELECT DISTINCT match_quality FROM substitutions")
        values = {row[0] for row in cur}
        self.assertTrue(values.issubset({"good", "fair", "poor"}))

    def test_reason_domain(self):
        cur = self.conn.execute("SELECT DISTINCT reason FROM substitutions")
        values = {row[0] for row in cur}
        self.assertTrue(values.issubset({"unavailable", "dietary", "preference"}))


class TestGlossaryTable(MigrateTestBase):
    def test_row_count(self):
        count = self.conn.execute("SELECT COUNT(*) FROM glossary").fetchone()[0]
        self.assertEqual(count, EXPECTED_GLOSSARY)

    def test_chicken_wings_zh(self):
        row = self.conn.execute("SELECT zh FROM glossary WHERE en = 'chicken wings'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["zh"], "鸡翅")

    def test_all_four_categories(self):
        cur = self.conn.execute("SELECT DISTINCT category FROM glossary")
        values = {row[0] for row in cur}
        self.assertEqual(values, {"ingredient", "dish_name", "cooking_term", "grocery_term"})

    def test_no_null_en_zh(self):
        for col in ("en", "zh"):
            count = self.conn.execute(f"SELECT COUNT(*) FROM glossary WHERE {col} IS NULL").fetchone()[0]
            self.assertEqual(count, 0, f"Found NULL {col} values in glossary")


class TestMigrateErrorRollback(unittest.TestCase):
    """migrate() must call conn.rollback() explicitly when a load step raises.

    Issue: migrate_kb.py:140-145 — the except block deletes the output file
    but does not explicitly call conn.rollback() before the connection closes.
    Explicit rollback makes the intent clear and is robust against any future
    change that removes autocommit behaviour.
    """

    def test_rollback_called_on_load_error(self):
        """conn.rollback() must be called when a load function raises."""
        import sqlite3
        import tempfile
        import unittest.mock as mock

        from scripts.migrate_kb import migrate

        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        tmp.close()
        db_path = Path(tmp.name)

        rollback_called = []

        class TrackingConnection:
            """Thin proxy around sqlite3.Connection that records rollback() calls."""

            def __init__(self, real_conn):
                self._real = real_conn

            def rollback(self):
                rollback_called.append(True)
                self._real.rollback()

            def __getattr__(self, name):
                return getattr(self._real, name)

        original_connect = sqlite3.connect

        def patched_connect(path, *args, **kwargs):
            return TrackingConnection(original_connect(path, *args, **kwargs))

        boom = RuntimeError("simulated load failure")

        with (
            mock.patch("scripts.migrate_kb.sqlite3.connect", side_effect=patched_connect),
            mock.patch("scripts.migrate_kb._load_recipes", side_effect=boom),
        ):
            with self.assertRaises(RuntimeError):
                migrate(db_path=db_path)

        self.assertTrue(
            rollback_called,
            "conn.rollback() was not called when a load step raised an exception",
        )
        # Cleanup (file may already be deleted by the except block)
        db_path.unlink(missing_ok=True)

    def test_db_file_deleted_on_error(self):
        """The partial DB file must be removed when migration fails mid-way."""
        import unittest.mock as mock

        from scripts.migrate_kb import migrate

        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        tmp.close()
        db_path = Path(tmp.name)

        with mock.patch("scripts.migrate_kb._load_recipes", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                migrate(db_path=db_path)

        self.assertFalse(db_path.exists(), "Partial DB file was not cleaned up after error")

    def test_source_code_contains_explicit_rollback(self):
        """The migrate() source must contain an explicit conn.rollback() call."""
        source = (PROJECT_ROOT / "scripts" / "migrate_kb.py").read_text()
        self.assertIn(
            "conn.rollback()",
            source,
            "migrate_kb.py must contain an explicit conn.rollback() in the error path",
        )


if __name__ == "__main__":
    unittest.main()
