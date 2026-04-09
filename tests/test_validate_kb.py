"""Tests for Phase 1c: Validation script (scripts/validate_kb.py).

TDD RED phase — tests define the validation script's contract.
Uses a temp DB created by migrate_kb for isolation.
"""
import sqlite3
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _make_valid_db() -> Path:
    """Run migration into a temp DB and return its path."""
    from scripts.migrate_kb import migrate
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    tmp.close()
    migrate(db_path=Path(tmp.name))
    return Path(tmp.name)


def _make_partial_db() -> Path:
    """Create a DB with schema but only 1 recipe, to trigger row count failure."""
    schema_path = PROJECT_ROOT / "contracts" / "kb_schema.sql"
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    conn = sqlite3.connect(db_path)
    conn.executescript(schema_path.read_text())
    conn.execute(
        """INSERT INTO recipes (id, name, effort_level, time_minutes, ingredients, flavor_tags, instructions, is_ai_generated)
           VALUES ('r001', 'Test', 'medium', 30, '[]', '[]', 'test', 0)"""
    )
    conn.commit()
    conn.close()
    return db_path


class TestValidateImport(unittest.TestCase):

    def test_validate_is_callable(self):
        from scripts.validate_kb import validate
        self.assertTrue(callable(validate))

    def test_validate_accepts_db_path(self):
        import inspect
        from scripts.validate_kb import validate
        sig = inspect.signature(validate)
        self.assertIn("db_path", sig.parameters)

    def test_check_result_has_fields(self):
        from scripts.validate_kb import CheckResult
        r = CheckResult(name="test", passed=True, detail="ok")
        self.assertEqual(r.name, "test")
        self.assertTrue(r.passed)
        self.assertEqual(r.detail, "ok")


class TestValidateOnValidDB(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db_path = _make_valid_db()
        from scripts.validate_kb import validate
        cls.results = validate(db_path=cls.db_path)

    @classmethod
    def tearDownClass(cls):
        cls.db_path.unlink(missing_ok=True)

    def test_returns_list_of_check_results(self):
        self.assertIsInstance(self.results, list)
        self.assertGreater(len(self.results), 0)
        for r in self.results:
            self.assertTrue(hasattr(r, "name"))
            self.assertTrue(hasattr(r, "passed"))
            self.assertTrue(hasattr(r, "detail"))

    def test_all_checks_pass(self):
        failures = [r for r in self.results if not r.passed]
        self.assertEqual(
            failures, [],
            f"Failed checks: {[(r.name, r.detail) for r in failures]}",
        )

    def test_row_count_checks_present(self):
        names = {r.name for r in self.results}
        for table in ("recipes", "pcsv_mappings", "products", "substitutions", "glossary"):
            self.assertIn(f"{table} row count", names, f"Missing row count check for {table}")

    def test_spot_check_queries_present(self):
        names = {r.name for r in self.results}
        self.assertTrue(any("pcsv" in n.lower() for n in names), "Missing PCSV spot check")
        self.assertTrue(any("recipe" in n.lower() and "cuisine" in n.lower() for n in names), "Missing recipe cuisine check")
        self.assertTrue(any("glossary" in n.lower() for n in names), "Missing glossary spot check")

    def test_constraint_checks_present(self):
        names = {r.name for r in self.results}
        self.assertTrue(any("effort_level" in n.lower() for n in names), "Missing effort_level domain check")
        self.assertTrue(any("store" in n.lower() for n in names), "Missing store domain check")

    def test_is_ai_generated_check_present(self):
        names = {r.name for r in self.results}
        self.assertTrue(any("is_ai_generated" in n.lower() for n in names), "Missing is_ai_generated domain check")

    def test_instructions_check_present(self):
        names = {r.name for r in self.results}
        self.assertTrue(any("instructions" in n.lower() for n in names), "Missing non-empty instructions check")


class TestValidateDetectsFailures(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db_path = _make_partial_db()
        from scripts.validate_kb import validate
        cls.results = validate(db_path=cls.db_path)

    @classmethod
    def tearDownClass(cls):
        cls.db_path.unlink(missing_ok=True)

    def test_not_all_pass(self):
        passed = all(r.passed for r in self.results)
        self.assertFalse(passed, "All checks passed on a partial DB — should have failures")

    def test_recipes_row_count_fails(self):
        rc = next((r for r in self.results if r.name == "recipes row count"), None)
        self.assertIsNotNone(rc)
        self.assertFalse(rc.passed)


class TestValidateRunnable(unittest.TestCase):

    def test_has_main_block(self):
        source = (PROJECT_ROOT / "scripts" / "validate_kb.py").read_text()
        self.assertIn('if __name__ == "__main__"', source)


if __name__ == "__main__":
    unittest.main()
