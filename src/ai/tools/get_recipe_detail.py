"""Get full recipe detail by ID from SQLite KB."""

import json

import aiosqlite

from contracts.tool_schemas import GetRecipeDetailInput, Ingredient, RecipeDetail
from src.ai.cache import cached_tool
from src.ai.cache.config import TTL_SECONDS


@cached_tool("get_recipe_detail", TTL_SECONDS["get_recipe_detail"], RecipeDetail | None)
async def get_recipe_detail(db: aiosqlite.Connection, input: GetRecipeDetailInput) -> RecipeDetail | None:
    cursor = await db.execute(
        "SELECT id, name, name_zh, source, source_url, cuisine, cooking_method, "
        "effort_level, time_minutes, flavor_tags, serves, ingredients, instructions, "
        "is_ai_generated FROM recipes WHERE id = ?",
        (input.recipe_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    ingredients_raw = json.loads(row[11]) if row[11] else []
    ingredients = [
        Ingredient(name=i["name"], amount=i.get("amount", ""), pcsv=i.get("pcsv", [])) for i in ingredients_raw
    ]

    return RecipeDetail(
        id=row[0],
        name=row[1],
        name_zh=row[2] or "",
        source=row[3] or "",
        source_url=row[4] or "",
        cuisine=row[5] or "",
        cooking_method=row[6] or "",
        effort_level=row[7] or "medium",
        time_minutes=row[8] or 0,
        flavor_tags=json.loads(row[9]) if row[9] else [],
        serves=row[10] or 0,
        ingredients=ingredients,
        instructions=row[12] or "",
        is_ai_generated=bool(row[13]),
    )
