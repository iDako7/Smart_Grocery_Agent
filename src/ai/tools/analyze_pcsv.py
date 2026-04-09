"""PCSV analysis: deterministic ingredient categorization via SQLite KB."""

import json

import aiosqlite

from contracts.tool_schemas import AnalyzePcsvInput, PCSVCategory, PCSVResult


def _status(count: int) -> str:
    if count == 0:
        return "gap"
    elif count <= 1:
        return "low"
    return "ok"


async def analyze_pcsv(db: aiosqlite.Connection, input: AnalyzePcsvInput) -> PCSVResult:
    categories: dict[str, list[str]] = {
        "protein": [],
        "carb": [],
        "veggie": [],
        "sauce": [],
    }

    # Load all mappings (small table, ~100 rows)
    cursor = await db.execute("SELECT ingredient, categories FROM pcsv_mappings")
    mappings: dict[str, list[str]] = {}
    async for row in cursor:
        mappings[row[0]] = json.loads(row[1])

    for ingredient in input.ingredients:
        key = ingredient.lower().strip()
        roles = mappings.get(key, [])
        if not roles:
            # Partial match — prefer closest-length match
            best_match = None
            best_delta = float("inf")
            for mapped_name, mapped_roles in mappings.items():
                if key in mapped_name or mapped_name in key:
                    delta = abs(len(mapped_name) - len(key))
                    if delta < best_delta:
                        best_delta = delta
                        best_match = mapped_roles
            if best_match is not None:
                roles = best_match
        for role in roles:
            if role in categories and ingredient not in categories[role]:
                categories[role].append(ingredient)

    return PCSVResult(
        protein=PCSVCategory(status=_status(len(categories["protein"])), items=categories["protein"]),
        carb=PCSVCategory(status=_status(len(categories["carb"])), items=categories["carb"]),
        veggie=PCSVCategory(status=_status(len(categories["veggie"])), items=categories["veggie"]),
        sauce=PCSVCategory(status=_status(len(categories["sauce"])), items=categories["sauce"]),
    )
