"""Bilingual EN↔ZH glossary lookup from SQLite KB."""

import aiosqlite

from contracts.tool_schemas import TranslateTermInput, TranslateTermResult


def _contains_chinese(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


async def translate_term(
    db: aiosqlite.Connection, input: TranslateTermInput
) -> TranslateTermResult:
    term = input.term.strip()
    direction = input.direction or "auto"

    if direction == "auto":
        resolved = "zh_to_en" if _contains_chinese(term) else "en_to_zh"
    else:
        resolved = direction

    no_match = TranslateTermResult(
        term=term, translation="", direction=resolved, match_type="none"
    )

    if resolved == "en_to_zh":
        # Exact match (case-insensitive)
        cursor = await db.execute(
            "SELECT en, zh FROM glossary WHERE LOWER(en) = LOWER(?)", (term,)
        )
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(
                term=row[0], translation=row[1], direction="en_to_zh", match_type="exact"
            )

        # Partial match
        cursor = await db.execute(
            "SELECT en, zh FROM glossary WHERE LOWER(en) LIKE ? OR ? LIKE '%' || LOWER(en) || '%' LIMIT 1",
            (f"%{term.lower()}%", term.lower()),
        )
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(
                term=row[0], translation=row[1], direction="en_to_zh", match_type="partial"
            )

    else:  # zh_to_en
        cursor = await db.execute(
            "SELECT zh, en FROM glossary WHERE zh = ?", (term,)
        )
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(
                term=row[0], translation=row[1], direction="zh_to_en", match_type="exact"
            )

        cursor = await db.execute(
            "SELECT zh, en FROM glossary WHERE zh LIKE ? OR ? LIKE '%' || zh || '%' LIMIT 1",
            (f"%{term}%", term),
        )
        row = await cursor.fetchone()
        if row:
            return TranslateTermResult(
                term=row[0], translation=row[1], direction="zh_to_en", match_type="partial"
            )

    return no_match
