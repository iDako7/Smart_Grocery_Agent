"""Substitution lookup from SQLite KB."""

import aiosqlite
from contracts.tool_schemas import GetSubstitutionsInput, Substitution


def _escape_like(value: str) -> str:
    """Escape LIKE special characters to prevent wildcard injection."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def get_substitutions(db: aiosqlite.Connection, input: GetSubstitutionsInput) -> list[Substitution]:
    query = input.ingredient.lower().strip()
    escaped = _escape_like(query)

    # Use LIKE for partial matching (ingredient contains query or query contains ingredient)
    cursor = await db.execute(
        "SELECT ingredient, substitute, match_quality, reason, notes "
        "FROM substitutions "
        "WHERE LOWER(ingredient) LIKE ? ESCAPE '\\' "
        "OR ? LIKE '%' || LOWER(ingredient) || '%'",
        (f"%{escaped}%", query),
    )

    results: list[tuple[bool, Substitution]] = []
    async for row in cursor:
        reason_match = row[3] == input.reason if input.reason else False
        results.append(
            (
                reason_match,
                Substitution(
                    substitute=row[1],
                    match_quality=row[2],
                    notes=row[4] or "",
                ),
            )
        )

    # Sort reason-matched results first
    if input.reason:
        results.sort(key=lambda r: r[0], reverse=True)

    return [r[1] for r in results]
