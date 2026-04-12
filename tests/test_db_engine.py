"""Tests for database engine and get_db dependency."""

import uuid

from sqlalchemy import text
from src.backend.db.tables import users


async def test_connection_works(db):
    """Basic connectivity — run a simple query."""
    result = await db.execute(text("SELECT 1 AS n"))
    assert result.scalar() == 1


async def test_insert_and_select_user(db):
    """Round-trip: insert a user, read it back."""
    uid = uuid.uuid4()
    await db.execute(users.insert().values(id=uid, email="test@example.com"))
    row = (await db.execute(users.select().where(users.c.id == uid))).first()
    assert row is not None
    assert row.email == "test@example.com"


async def test_transaction_rollback_isolation(db):
    """Insert inside the tx-rollback fixture doesn't persist to next test."""
    uid = uuid.uuid4()
    await db.execute(users.insert().values(id=uid, email="isolation@test.com"))
    # This insert is visible within this test's transaction
    row = (await db.execute(users.select().where(users.c.id == uid))).first()
    assert row is not None
    # After rollback (in fixture teardown), this row won't persist


async def test_seeded_user_fixture(seeded_user, db, dev_user_id):
    """The seeded_user fixture creates a user + profile row."""
    assert seeded_user == dev_user_id
    row = (await db.execute(users.select().where(users.c.id == dev_user_id))).first()
    assert row is not None
    assert row.email == "dev@test.local"
