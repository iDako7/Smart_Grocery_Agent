"""Tests for Alembic migration — up and down.

These tests run migrations via subprocess using psycopg2 (sync).
They need a clean DB, so we drop all tables before each test.
"""

import os
import subprocess
import sys

import pytest

_BACKEND_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "src", "backend")
)

_DROP_ALL = """\
DROP TABLE IF EXISTS saved_grocery_lists CASCADE;
DROP TABLE IF EXISTS saved_recipes CASCADE;
DROP TABLE IF EXISTS saved_meal_plans CASCADE;
DROP TABLE IF EXISTS conversation_turns CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS alembic_version CASCADE;
"""


def _alembic_env() -> dict:
    return {
        **os.environ,
        "DATABASE_URL": os.environ.get(
            "TEST_DATABASE_URL",
            "postgresql+asyncpg://sga:sga_dev@localhost:5432/sga",
        ),
        "PYTHONPATH": os.path.normpath(os.path.join(os.path.dirname(__file__), "..")),
    }


def _run_alembic(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=_BACKEND_DIR,
        capture_output=True,
        text=True,
        env=_alembic_env(),
    )


def _drop_all_tables():
    """Drop all app tables + alembic_version via docker exec."""
    subprocess.run(
        ["docker", "exec", "sga_v2-wt2-backend-db-1",
         "psql", "-U", "sga", "-d", "sga", "-c", _DROP_ALL],
        capture_output=True,
    )


@pytest.fixture(autouse=True)
def _clean_slate():
    """Drop everything before each test."""
    _drop_all_tables()
    yield
    # Restore tables for other tests that use conftest's create_all
    _drop_all_tables()
    # Force conftest to recreate tables on next use
    import tests.conftest as c
    c._tables_created = False


def test_alembic_upgrade_head():
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, f"upgrade failed: {result.stderr}"


def test_alembic_downgrade_base():
    _run_alembic("upgrade", "head")
    result = _run_alembic("downgrade", "base")
    assert result.returncode == 0, f"downgrade failed: {result.stderr}"


def test_alembic_up_down_up():
    _run_alembic("upgrade", "head")
    _run_alembic("downgrade", "base")
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, f"re-upgrade failed: {result.stderr}"
