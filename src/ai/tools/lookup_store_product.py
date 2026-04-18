"""Store product lookup: fuzzy match against SQLite KB using rapidfuzz."""

import aiosqlite
from rapidfuzz import fuzz

from contracts.tool_schemas import LookupStoreProductInput, StoreProduct
from src.ai.cache import cached_tool
from src.ai.cache.config import TTL_SECONDS


def score_products(
    rows: list[tuple],
    query: str,
    threshold: int = 82,
) -> list[tuple[int, dict]]:
    """Score pre-fetched product rows against query.

    Returns (score, product_dict) pairs >= threshold, sorted descending.
    Each row must be (name, size, department, category, store).

    Ranking is name-dominant: a product whose *name* fuzzy-matches the query
    always outranks a product whose only link is its *category* matching the
    query. Category remains a signal — it can still qualify a row through
    the threshold and break ties between products with identical name scores —
    but it can no longer promote a mismatched product (e.g. query "vinegar"
    must not surface "Mazola - Corn Oil" just because its category is
    "Oils & Vinegars").
    """
    query_lower = query.lower().strip()
    ranked: list[tuple[int, int, dict]] = []  # (name_score, cat_score, product)
    for row in rows:
        name_score = fuzz.WRatio(query_lower, row[0].lower())
        cat_score = fuzz.WRatio(query_lower, (row[3] or "").lower())
        if max(name_score, cat_score) < threshold:
            continue
        ranked.append(
            (
                name_score,
                cat_score,
                {
                    "name": row[0],
                    "size": row[1] or "",
                    "department": row[2] or "",
                    "store": row[4] or "costco",
                },
            )
        )
    # Primary: name_score desc. Secondary: cat_score desc. Tertiary: shorter name.
    ranked.sort(key=lambda x: (-x[0], -x[1], len(x[2]["name"])))
    return [(max(n, c), p) for n, c, p in ranked]


async def fuzzy_match_products(
    db: aiosqlite.Connection,
    query: str,
    store: str | None = None,
    threshold: int = 82,
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


@cached_tool("lookup_store_product", TTL_SECONDS["lookup_store_product"], StoreProduct | None)
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
