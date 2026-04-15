"""Saved content CRUD endpoints — meal plans, recipes, grocery lists."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection
from src.ai.kb import get_kb
from src.ai.tools.get_recipe_detail import get_recipe_detail
from src.backend.auth import get_current_user_id
from src.backend.db.engine import get_db
from src.backend.db.tables import (
    saved_grocery_lists,
    saved_meal_plans,
    saved_recipes,
    sessions,
)

from contracts.tool_schemas import GetRecipeDetailInput

from contracts.api_types import (
    SavedGroceryList,
    SavedGroceryListSummary,
    SavedMealPlan,
    SavedMealPlanSummary,
    SavedRecipe,
    SavedRecipeSummary,
    SaveGroceryListRequest,
    SaveMealPlanRequest,
    SaveRecipeRequest,
    UpdateGroceryListRequest,
    UpdateMealPlanRequest,
    UpdateSavedRecipeRequest,
)

router = APIRouter(prefix="/saved")


# ---------------------------------------------------------------------------
# Meal Plans
# ---------------------------------------------------------------------------


@router.post("/meal-plans", status_code=201)
async def create_meal_plan(
    body: SaveMealPlanRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedMealPlan:
    # Get recipes from session state
    sess_row = (
        await conn.execute(sessions.select().where(sessions.c.id == body.session_id, sessions.c.user_id == user_id))
    ).first()
    recipes_data = (sess_row.state_snapshot or {}).get("recipes", []) if sess_row else []

    # Lazy upgrade: pre-existing sessions may have un-hydrated RecipeSummary
    # entries (no `instructions` / empty `ingredients`). Re-fetch detail from
    # the KB and hydrate in place before persisting (issue #71).
    async with get_kb() as kb:
        for entry in recipes_data:
            if not entry.get("instructions") and not entry.get("ingredients"):
                detail = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id=entry["id"]))
                if detail is not None:
                    entry["ingredients"] = [i.model_dump() for i in detail.ingredients]
                    entry["instructions"] = detail.instructions

    pid = uuid.uuid4()
    result = await conn.execute(
        saved_meal_plans.insert()
        .values(id=pid, user_id=user_id, name=body.name, recipes=recipes_data)
        .returning(saved_meal_plans.c.created_at, saved_meal_plans.c.updated_at)
    )
    row = result.first()
    await conn.commit()
    return SavedMealPlan(
        id=str(pid), name=body.name, recipes=recipes_data, created_at=row.created_at, updated_at=row.updated_at
    )


@router.get("/meal-plans")
async def list_meal_plans(
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> list[SavedMealPlanSummary]:
    result = await conn.execute(
        select(
            saved_meal_plans.c.id,
            saved_meal_plans.c.name,
            saved_meal_plans.c.recipes,
            saved_meal_plans.c.created_at,
            saved_meal_plans.c.updated_at,
        )
        .where(saved_meal_plans.c.user_id == user_id)
        .order_by(saved_meal_plans.c.updated_at.desc())
    )
    return [
        SavedMealPlanSummary(
            id=str(r.id),
            name=r.name,
            recipe_count=len(r.recipes) if r.recipes else 0,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in result.fetchall()
    ]


@router.get("/meal-plans/{plan_id}")
async def get_meal_plan(
    plan_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedMealPlan:
    row = (
        await conn.execute(
            saved_meal_plans.select().where(saved_meal_plans.c.id == plan_id, saved_meal_plans.c.user_id == user_id)
        )
    ).first()
    if not row:
        raise HTTPException(404, "Meal plan not found")
    return SavedMealPlan(
        id=str(row.id), name=row.name, recipes=row.recipes or [], created_at=row.created_at, updated_at=row.updated_at
    )


@router.put("/meal-plans/{plan_id}")
async def update_meal_plan(
    plan_id: uuid.UUID,
    body: UpdateMealPlanRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedMealPlan:
    updates: dict = {"updated_at": text("now()")}
    if body.name is not None:
        updates["name"] = body.name
    if body.recipes is not None:
        updates["recipes"] = [r.model_dump() for r in body.recipes]
    result = await conn.execute(
        saved_meal_plans.update()
        .where(saved_meal_plans.c.id == plan_id, saved_meal_plans.c.user_id == user_id)
        .values(**updates)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Meal plan not found")
    await conn.commit()
    return await get_meal_plan(plan_id, user_id, conn)


@router.delete("/meal-plans/{plan_id}", status_code=204)
async def delete_meal_plan(
    plan_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> None:
    result = await conn.execute(
        saved_meal_plans.delete().where(saved_meal_plans.c.id == plan_id, saved_meal_plans.c.user_id == user_id)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Meal plan not found")
    await conn.commit()


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------


@router.post("/recipes", status_code=201)
async def save_recipe(
    body: SaveRecipeRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedRecipe:
    rid = uuid.uuid4()
    result = await conn.execute(
        saved_recipes.insert()
        .values(
            id=rid,
            user_id=user_id,
            recipe_id=body.recipe_id,
            recipe_snapshot=body.recipe_snapshot.model_dump(),
            notes=body.notes or "",
        )
        .returning(saved_recipes.c.created_at, saved_recipes.c.updated_at)
    )
    row = result.first()
    await conn.commit()
    return SavedRecipe(
        id=str(rid),
        recipe_snapshot=body.recipe_snapshot,
        notes=body.notes or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/recipes")
async def list_recipes(
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> list[SavedRecipeSummary]:
    result = await conn.execute(
        select(
            saved_recipes.c.id, saved_recipes.c.recipe_snapshot, saved_recipes.c.created_at, saved_recipes.c.updated_at
        )
        .where(saved_recipes.c.user_id == user_id)
        .order_by(saved_recipes.c.updated_at.desc())
    )
    return [
        SavedRecipeSummary(
            id=str(r.id),
            recipe_name=r.recipe_snapshot.get("name", "") if r.recipe_snapshot else "",
            recipe_name_zh=r.recipe_snapshot.get("name_zh", "") if r.recipe_snapshot else "",
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in result.fetchall()
    ]


@router.get("/recipes/{recipe_id}")
async def get_saved_recipe(
    recipe_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedRecipe:
    row = (
        await conn.execute(
            saved_recipes.select().where(saved_recipes.c.id == recipe_id, saved_recipes.c.user_id == user_id)
        )
    ).first()
    if not row:
        raise HTTPException(404, "Recipe not found")
    return SavedRecipe(
        id=str(row.id),
        recipe_snapshot=row.recipe_snapshot,
        notes=row.notes or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.put("/recipes/{recipe_id}")
async def update_saved_recipe(
    recipe_id: uuid.UUID,
    body: UpdateSavedRecipeRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedRecipe:
    updates: dict = {"updated_at": text("now()")}
    if body.recipe_snapshot is not None:
        updates["recipe_snapshot"] = body.recipe_snapshot.model_dump()
    if body.notes is not None:
        updates["notes"] = body.notes
    result = await conn.execute(
        saved_recipes.update()
        .where(saved_recipes.c.id == recipe_id, saved_recipes.c.user_id == user_id)
        .values(**updates)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Recipe not found")
    await conn.commit()
    return await get_saved_recipe(recipe_id, user_id, conn)


@router.delete("/recipes/{recipe_id}", status_code=204)
async def delete_saved_recipe(
    recipe_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> None:
    result = await conn.execute(
        saved_recipes.delete().where(saved_recipes.c.id == recipe_id, saved_recipes.c.user_id == user_id)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Recipe not found")
    await conn.commit()


# ---------------------------------------------------------------------------
# Grocery Lists
# ---------------------------------------------------------------------------


@router.post("/grocery-lists", status_code=201)
async def create_grocery_list(
    body: SaveGroceryListRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedGroceryList:
    sess_row = (
        await conn.execute(sessions.select().where(sessions.c.id == body.session_id, sessions.c.user_id == user_id))
    ).first()
    stores_data = (sess_row.state_snapshot or {}).get("grocery_list", []) if sess_row else []

    gid = uuid.uuid4()
    result = await conn.execute(
        saved_grocery_lists.insert()
        .values(id=gid, user_id=user_id, name=body.name, stores=stores_data)
        .returning(saved_grocery_lists.c.created_at, saved_grocery_lists.c.updated_at)
    )
    row = result.first()
    await conn.commit()
    return SavedGroceryList(
        id=str(gid), name=body.name, stores=stores_data, created_at=row.created_at, updated_at=row.updated_at
    )


@router.get("/grocery-lists")
async def list_grocery_lists(
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> list[SavedGroceryListSummary]:
    result = await conn.execute(
        select(
            saved_grocery_lists.c.id,
            saved_grocery_lists.c.name,
            saved_grocery_lists.c.stores,
            saved_grocery_lists.c.created_at,
            saved_grocery_lists.c.updated_at,
        )
        .where(saved_grocery_lists.c.user_id == user_id)
        .order_by(saved_grocery_lists.c.updated_at.desc())
    )
    return [
        SavedGroceryListSummary(
            id=str(r.id),
            name=r.name,
            item_count=sum(
                len(d.get("items", []))
                for s in (r.stores or [])
                for d in (s.get("departments", []) if isinstance(s, dict) else [])
            ),
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in result.fetchall()
    ]


@router.get("/grocery-lists/{list_id}")
async def get_grocery_list(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedGroceryList:
    row = (
        await conn.execute(
            saved_grocery_lists.select().where(
                saved_grocery_lists.c.id == list_id, saved_grocery_lists.c.user_id == user_id
            )
        )
    ).first()
    if not row:
        raise HTTPException(404, "Grocery list not found")
    return SavedGroceryList(
        id=str(row.id), name=row.name, stores=row.stores or [], created_at=row.created_at, updated_at=row.updated_at
    )


@router.put("/grocery-lists/{list_id}")
async def update_grocery_list(
    list_id: uuid.UUID,
    body: UpdateGroceryListRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SavedGroceryList:
    updates: dict = {"updated_at": text("now()")}
    if body.name is not None:
        updates["name"] = body.name
    if body.stores is not None:
        updates["stores"] = [s.model_dump() for s in body.stores]
    result = await conn.execute(
        saved_grocery_lists.update()
        .where(saved_grocery_lists.c.id == list_id, saved_grocery_lists.c.user_id == user_id)
        .values(**updates)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Grocery list not found")
    await conn.commit()
    return await get_grocery_list(list_id, user_id, conn)


@router.delete("/grocery-lists/{list_id}", status_code=204)
async def delete_grocery_list(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> None:
    result = await conn.execute(
        saved_grocery_lists.delete().where(
            saved_grocery_lists.c.id == list_id, saved_grocery_lists.c.user_id == user_id
        )
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Grocery list not found")
    await conn.commit()
