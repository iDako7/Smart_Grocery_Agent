"""Bilingual EN↔ZH glossary lookup from SQLite KB."""

import aiosqlite
from src.ai.cache import cached_tool
from src.ai.cache.config import TTL_SECONDS
from src.ai.tools._sql_utils import _escape_like

from contracts.tool_schemas import TranslateTermInput, TranslateTermResult


def _contains_chinese(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


@cached_tool("translate_term", TTL_SECONDS["translate_term"], TranslateTermResult)
async def translate_term(db: aiosqlite.Connection, input: TranslateTermInput) -> TranslateTermResult:
    term = input.term.strip()
    direction = input.direction or "auto"

    if direction == "auto":
        resolved = "zh_to_en" if _contains_chinese(term) else "en_to_zh"
    else:
        resolved = direction

    no_match = TranslateTermResult(term=term, translation="", direction=resolved, match_type="none")

    if resolved == "en_to_zh":
        # Exact match (case-insensitive)
        cursor = await db.execute("SELECT en, zh FROM glossary WHERE LOWER(en) = LOWER(?)", (term,))
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(term=row[0], translation=row[1], direction="en_to_zh", match_type="exact")

        # Partial match
        escaped = _escape_like(term.lower())
        cursor = await db.execute(
            "SELECT en, zh FROM glossary WHERE LOWER(en) LIKE ? ESCAPE '\\' OR ? LIKE '%' || LOWER(en) || '%' LIMIT 1",
            (f"%{escaped}%", term.lower()),
        )
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(term=row[0], translation=row[1], direction="en_to_zh", match_type="partial")

    else:  # zh_to_en
        cursor = await db.execute("SELECT zh, en FROM glossary WHERE zh = ?", (term,))
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(term=row[0], translation=row[1], direction="zh_to_en", match_type="exact")

        escaped = _escape_like(term)
        cursor = await db.execute(
            "SELECT zh, en FROM glossary WHERE zh LIKE ? ESCAPE '\\' OR ? LIKE '%' || zh || '%' LIMIT 1",
            (f"%{escaped}%", term),
        )
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(term=row[0], translation=row[1], direction="zh_to_en", match_type="partial")

    return no_match
