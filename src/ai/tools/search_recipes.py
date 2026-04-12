"""Recipe search: SQL filters + Python ingredient scoring against SQLite KB."""

import json

import aiosqlite
from contracts.tool_schemas import RecipeSummary, SearchRecipesInput


async def search_recipes(db: aiosqlite.Connection, input: SearchRecipesInput) -> list[RecipeSummary]:
    # Build SQL query with optional filters
    clauses = []
    params: list[object] = []

    if input.cuisine:
        clauses.append("LOWER(cuisine) = LOWER(?)")
        params.append(input.cuisine)
    if input.cooking_method:
        clauses.append("LOWER(cooking_method) = LOWER(?)")
        params.append(input.cooking_method)
    if input.effort_level:
        clauses.append("effort_level = ?")
        params.append(input.effort_level)

    # SAFETY: clauses contain only hardcoded SQL fragments with ? placeholders.
    # All user-supplied values go into params. Never interpolate user data into clauses.
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT id, name, name_zh, cuisine, cooking_method, effort_level, flavor_tags, serves, ingredients FROM recipes{where}"

    cursor = await db.execute(sql, params)
    user_ingredients = {i.lower().strip() for i in input.ingredients}
    results: list[tuple[float, RecipeSummary]] = []

    async for row in cursor:
        ingredients_json = json.loads(row[8]) if row[8] else []
        have = []
        need = []
        pcsv_roles: dict[str, list[str]] = {}

        for ing in ingredients_json:
            name = ing["name"].lower()
            matched = any(ui in name or name in ui for ui in user_ingredients)
            if matched:
                have.append(ing["name"])
            else:
                need.append(ing["name"])
            for role in ing.get("pcsv", []):
                pcsv_roles.setdefault(role, []).append(ing["name"])

        if not have:
            continue

        score = len(have) / len(ingredients_json) if ingredients_json else 0
        flavor_tags = json.loads(row[6]) if row[6] else []

        results.append(
            (
                score,
                RecipeSummary(
                    id=row[0],
                    name=row[1],
                    name_zh=row[2] or "",
                    cuisine=row[3] or "",
                    cooking_method=row[4] or "",
                    effort_level=row[5] or "medium",
                    flavor_tags=flavor_tags,
                    serves=row[7] or 0,
                    pcsv_roles=pcsv_roles,
                    ingredients_have=have,
                    ingredients_need=need,
                ),
            )
        )

    results.sort(key=lambda r: r[0], reverse=True)
    return [r[1] for r in results[:10]]
