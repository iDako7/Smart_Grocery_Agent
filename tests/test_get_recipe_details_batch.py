"""Unit tests for get_recipe_details_batch — one SQLite round-trip for N ids.

Issue #79: replaces per-recipe get_recipe_detail() loop in sessions.py/saved.py.
"""

import json
from collections.abc import AsyncIterator

import aiosqlite
import pytest_asyncio
from src.ai.tools.get_recipe_detail import get_recipe_details_batch

_KB_DDL = """
CREATE TABLE recipes (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    name_zh         TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',
    source_url      TEXT NOT NULL DEFAULT '',
    cuisine         TEXT NOT NULL DEFAULT '',
    cooking_method  TEXT NOT NULL DEFAULT '',
    effort_level    TEXT NOT NULL DEFAULT 'medium',
    time_minutes    INTEGER NOT NULL DEFAULT 0,
    flavor_tags     TEXT NOT NULL DEFAULT '[]',
    serves          INTEGER NOT NULL DEFAULT 0,
    ingredients     TEXT NOT NULL DEFAULT '[]',
    instructions    TEXT NOT NULL DEFAULT '',
    is_ai_generated INTEGER NOT NULL DEFAULT 0
);
"""


def _recipe_row(rid: str, name: str, instructions: str = "") -> dict:
    return {
        "id": rid,
        "name": name,
        "name_zh": "",
        "source": "",
        "source_url": "",
        "cuisine": "",
        "cooking_method": "",
        "effort_level": "medium",
        "time_minutes": 0,
        "flavor_tags": json.dumps([]),
        "serves": 0,
        "ingredients": json.dumps([{"name": "chicken", "amount": "1 lb", "pcsv": ["protein"]}]),
        "instructions": instructions or f"Cook {name}.",
        "is_ai_generated": 0,
    }


@pytest_asyncio.fixture()
async def seeded_db() -> AsyncIterator[aiosqlite.Connection]:
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(_KB_DDL)
    for row in (_recipe_row("r1", "Alpha"), _recipe_row("r2", "Beta"), _recipe_row("r3", "Gamma")):
        await db.execute(
            "INSERT INTO recipes (id, name, name_zh, source, source_url, cuisine, cooking_method, "
            "effort_level, time_minutes, flavor_tags, serves, ingredients, instructions, is_ai_generated) "
            "VALUES (:id, :name, :name_zh, :source, :source_url, :cuisine, :cooking_method, "
            ":effort_level, :time_minutes, :flavor_tags, :serves, :ingredients, :instructions, :is_ai_generated)",
            row,
        )
    await db.commit()
    try:
        yield db
    finally:
        await db.close()


async def test_batch_returns_all_requested_ids(seeded_db):
    result = await get_recipe_details_batch(seeded_db, ["r1", "r2", "r3"])

    assert set(result.keys()) == {"r1", "r2", "r3"}
    assert result["r1"].name == "Alpha"
    assert result["r1"].instructions == "Cook Alpha."
    assert result["r1"].ingredients[0].name == "chicken"


async def test_batch_omits_unknown_ids(seeded_db):
    result = await get_recipe_details_batch(seeded_db, ["r1", "does-not-exist"])

    assert set(result.keys()) == {"r1"}
    assert result["r1"].name == "Alpha"


def _count_executes(db: aiosqlite.Connection) -> list[int]:
    """Wrap db.execute with a counter; returns a mutable [count] handle."""
    calls = [0]
    real_execute = db.execute

    async def counting_execute(*args, **kwargs):
        calls[0] += 1
        return await real_execute(*args, **kwargs)

    db.execute = counting_execute  # type: ignore[method-assign]
    return calls


async def test_batch_empty_list_skips_query(seeded_db):
    calls = _count_executes(seeded_db)

    result = await get_recipe_details_batch(seeded_db, [])

    assert result == {}
    assert calls[0] == 0


async def test_batch_dedupes_duplicate_ids(seeded_db):
    result = await get_recipe_details_batch(seeded_db, ["r1", "r1", "r2"])

    assert set(result.keys()) == {"r1", "r2"}
    assert len(result) == 2


async def test_batch_uses_single_query(seeded_db):
    """≤1 KB query regardless of id count — the acceptance criterion."""
    calls = _count_executes(seeded_db)

    await get_recipe_details_batch(seeded_db, ["r1", "r2", "r3"])

    assert calls[0] == 1
