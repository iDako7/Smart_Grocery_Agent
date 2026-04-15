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
    all_rows: list[RecipeSummary] = []

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

        flavor_tags = json.loads(row[6]) if row[6] else []
        summary = RecipeSummary(
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
        )
        all_rows.append(summary)

        if not have:
            continue

        score = len(have) / len(ingredients_json) if ingredients_json else 0
        results.append((score, summary))

    results.sort(key=lambda r: r[0], reverse=True)
    primaries = [r[1] for r in results[:10]]

    if input.include_alternatives and primaries:
        primary_ids = {p.id for p in primaries}
        used: set[str] = set()
        candidate_pool = [c for c in all_rows if c.id not in primary_ids]
        for primary in primaries:
            scored = [
                (_score_similarity(primary, c), c)
                for c in candidate_pool
                if c.id not in used
            ]
            scored = [(s, c) for s, c in scored if s > 0]
            scored.sort(key=lambda sc: (-sc[0], sc[1].id))
            top_alts = []
            for _, c in scored[:2]:
                used.add(c.id)
                top_alts.append(
                    RecipeSummary(
                        id=c.id,
                        name=c.name,
                        name_zh=c.name_zh,
                        cuisine=c.cuisine,
                        cooking_method=c.cooking_method,
                        effort_level=c.effort_level,
                        flavor_tags=c.flavor_tags,
                        serves=c.serves,
                        pcsv_roles=c.pcsv_roles,
                        ingredients_have=c.ingredients_have,
                        ingredients_need=c.ingredients_need,
                        alternatives=[],
                    )
                )
            primary.alternatives = top_alts

    return primaries


def _score_similarity(primary: RecipeSummary, candidate: RecipeSummary) -> int:
    score = 0
    p_proteins = {x.lower() for x in primary.pcsv_roles.get("protein", [])}
    c_proteins = {x.lower() for x in candidate.pcsv_roles.get("protein", [])}
    if p_proteins & c_proteins:
        score += 3
    if primary.cuisine and primary.cuisine.lower() == candidate.cuisine.lower():
        score += 2
    if primary.cooking_method and primary.cooking_method.lower() == candidate.cooking_method.lower():
        score += 1
    score += len(
        {t.lower() for t in (primary.flavor_tags or [])}
        & {t.lower() for t in (candidate.flavor_tags or [])}
    )
    if primary.effort_level == candidate.effort_level:
        score += 1
    return score
