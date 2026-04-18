"""Grocery list generation — deterministic KB lookup, no LLM."""

import uuid

from contracts.api_types import GroceryListRequest
from contracts.sse_events import GroceryDepartment, GroceryItem, GroceryStore
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncConnection
from src.ai.kb import get_kb
from src.ai.tools.lookup_store_product import score_products
from src.backend.auth import get_current_user_id
from src.backend.db.engine import get_db
from src.backend.db.tables import sessions

router = APIRouter()


def group_items_by_store(
    items: list[dict],
) -> list[GroceryStore]:
    """Group matched items into GroceryStore > GroceryDepartment > GroceryItem.

    Each dict in items has:
      ingredient_name, amount, recipe_name,
      product (dict with name/size/department/store keys, or None if unmatched)

    Unmatched items go into store="Other", department="Uncategorized".
    "Other" is always placed last in the returned list.

    Within each (store, department) bucket, entries that share the same
    product.name (case-insensitive) are collapsed into a single GroceryItem.
    recipe_context strings are merged: comma-joined, order-preserving, deduped.
    """
    # bucket_map: (store, dept) -> {normalized_product_name -> GroceryItem}
    # We keep insertion order so the first-seen entry becomes canonical.
    bucket_map: dict[tuple[str, str], dict[str, GroceryItem]] = {}
    # Track all context strings seen per canonical key to dedupe them.
    context_parts: dict[tuple[str, str, str], list[str]] = {}
    id_counter = 0

    for item in items:
        product = item.get("product")
        recipe_context_val = f"for {item['recipe_name']}" if item["recipe_name"] else ""

        if product:
            store_name = product["store"]
            dept_name = product["department"] or "General"
            product_key = product["name"].lower()
            canonical_name = product["name"]
            amount = item["amount"]
        else:
            store_name = "Other"
            dept_name = "Uncategorized"
            product_key = item["ingredient_name"].lower()
            canonical_name = item["ingredient_name"]
            amount = item["amount"]

        bucket_key = (store_name, dept_name)
        ctx_key = (store_name, dept_name, product_key)

        bucket = bucket_map.setdefault(bucket_key, {})
        if product_key not in bucket:
            grocery_item = GroceryItem(
                id=f"gi-{id_counter}",
                name=canonical_name,
                amount=amount,
                recipe_context=recipe_context_val,
            )
            id_counter += 1
            bucket[product_key] = grocery_item
            context_parts[ctx_key] = [recipe_context_val] if recipe_context_val else []
        else:
            # Duplicate product in same bucket — merge recipe_context (order-preserving dedup)
            if recipe_context_val and recipe_context_val not in context_parts[ctx_key]:
                context_parts[ctx_key].append(recipe_context_val)
                bucket[product_key] = bucket[product_key].model_copy(
                    update={"recipe_context": ", ".join(context_parts[ctx_key])}
                )

    # Build GroceryStore objects, "Other" last
    store_map: dict[str, dict[str, list[GroceryItem]]] = {}
    for (store_name, dept_name), name_to_item in bucket_map.items():
        store_map.setdefault(store_name, {}).setdefault(dept_name, []).extend(name_to_item.values())

    result: list[GroceryStore] = []
    other: GroceryStore | None = None
    for store_name, depts in store_map.items():
        departments = [GroceryDepartment(name=dept_name, items=dept_items) for dept_name, dept_items in depts.items()]
        store = GroceryStore(store_name=store_name, departments=departments)
        if store_name == "Other":
            other = store
        else:
            result.append(store)
    if other:
        result.append(other)

    return result


@router.post("/session/{session_id}/grocery-list")
async def generate_grocery_list(
    session_id: uuid.UUID,
    body: GroceryListRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> list[GroceryStore]:
    """Generate a store-grouped grocery list from checked buy items."""
    # Verify session ownership
    row = (
        await conn.execute(
            sessions.select().where(
                sessions.c.id == session_id,
                sessions.c.user_id == user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Pre-fetch all products once, then score each item in-process
    async with get_kb() as kb:
        cursor = await kb.execute("SELECT name, size, department, category, store FROM products")
        all_products = await cursor.fetchall()

        matched_items = []
        for item in body.items:
            scored = score_products(all_products, item.ingredient_name)
            product = scored[0][1] if scored else None
            matched_items.append(
                {
                    "ingredient_name": item.ingredient_name,
                    "amount": item.amount,
                    "recipe_name": item.recipe_name,
                    "product": product,
                }
            )

    # Group and build response
    stores = group_items_by_store(matched_items)

    # Persist to session state_snapshot — merge with existing (don't overwrite pcsv/recipes)
    snapshot = dict(row.state_snapshot or {})
    snapshot["grocery_list"] = [s.model_dump() for s in stores]
    await conn.execute(
        sessions.update().where(sessions.c.id == session_id).values(screen="grocery", state_snapshot=snapshot)
    )
    await conn.commit()

    return stores
