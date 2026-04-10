"""Store product lookup: fuzzy match against SQLite KB using rapidfuzz."""

import aiosqlite
from rapidfuzz import fuzz

from contracts.tool_schemas import LookupStoreProductInput, StoreProduct


async def lookup_store_product(
    db: aiosqlite.Connection, input: LookupStoreProductInput
) -> StoreProduct | None:
    store = input.store or "costco"
    query = input.item_name.lower().strip()

    cursor = await db.execute(
        "SELECT name, size, department, category, store FROM products WHERE store = ?",
        (store,),
    )
    rows = await cursor.fetchall()

    scored: list[tuple[int, dict]] = []
    for row in rows:
        name_score = fuzz.token_sort_ratio(query, row[0].lower())
        cat_score = fuzz.token_sort_ratio(query, (row[3] or "").lower())
        best_score = max(name_score, cat_score)
        scored.append((best_score, {
            "name": row[0],
            "size": row[1] or "",
            "department": row[2] or "",
            "store": row[4] or store,
        }))

    scored.sort(key=lambda x: (x[0], -len(x[1]["name"])), reverse=True)

    if not scored or scored[0][0] < 60:
        return None

    best = scored[0][1]
    alternatives = [s[1]["name"] for s in scored[1:4] if s[0] >= 60]

    return StoreProduct(
        name=best["name"],
        size=best["size"],
        department=best["department"],
        store=best["store"],
        alternatives=alternatives,
    )
