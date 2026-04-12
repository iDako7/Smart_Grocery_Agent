"""Store product lookup: fuzzy match against SQLite KB using rapidfuzz."""

import aiosqlite
from contracts.tool_schemas import LookupStoreProductInput, StoreProduct
from rapidfuzz import fuzz


def score_products(
    rows: list[tuple],
    query: str,
    threshold: int = 60,
) -> list[tuple[int, dict]]:
    """Score pre-fetched product rows against query.

    Returns (score, product_dict) pairs >= threshold, sorted descending.
    Each row must be (name, size, department, category, store).
    """
    query_lower = query.lower().strip()
    scored: list[tuple[int, dict]] = []
    for row in rows:
        name_score = fuzz.token_sort_ratio(query_lower, row[0].lower())
        cat_score = fuzz.token_sort_ratio(query_lower, (row[3] or "").lower())
        best_score = max(name_score, cat_score)
        if best_score >= threshold:
            scored.append(
                (
                    best_score,
                    {
                        "name": row[0],
                        "size": row[1] or "",
                        "department": row[2] or "",
                        "store": row[4] or "costco",
                    },
                )
            )
    scored.sort(key=lambda x: (x[0], -len(x[1]["name"])), reverse=True)
    return scored


async def fuzzy_match_products(
    db: aiosqlite.Connection,
    query: str,
    store: str | None = None,
    threshold: int = 60,
) -> list[tuple[int, dict]]:
    """Return products matching query, scored and sorted descending.

    Each tuple is (score, product_dict) where product_dict has keys:
    name, size, department, store.
    Only includes results with score >= threshold.
    """
    effective_store = store or "costco"
    cursor = await db.execute(
        "SELECT name, size, department, category, store FROM products WHERE store = ?",
        (effective_store,),
    )
    rows = await cursor.fetchall()
    return score_products(rows, query, threshold)


async def lookup_store_product(db: aiosqlite.Connection, input: LookupStoreProductInput) -> StoreProduct | None:
    scored = await fuzzy_match_products(db, input.item_name, store=input.store)

    if not scored:
        return None

    best = scored[0][1]
    alternatives = [s[1]["name"] for s in scored[1:4]]

    return StoreProduct(
        name=best["name"],
        size=best["size"],
        department=best["department"],
        store=best["store"],
        alternatives=alternatives,
    )
