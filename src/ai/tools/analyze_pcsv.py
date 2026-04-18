"""PCSV analysis: deterministic ingredient categorization via SQLite KB."""

import json
import re

import aiosqlite

from contracts.tool_schemas import AnalyzePcsvInput, PCSVCategory, PCSVResult
from src.ai.cache import cached_tool
from src.ai.cache.config import TTL_SECONDS


def _status(count: int) -> str:
    if count == 0:
        return "gap"
    elif count <= 1:
        return "low"
    return "ok"


@cached_tool("analyze_pcsv", TTL_SECONDS["analyze_pcsv"], PCSVResult)
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
            # Partial match — word-boundary matching to avoid false positives
            # (e.g. "egg" should not match "eggplant")
            key_pattern = re.compile(r"\b" + re.escape(key) + r"\b")
            best_match = None
            best_delta = float("inf")
            for mapped_name, mapped_roles in mappings.items():
                key_in_mapped = bool(key_pattern.search(mapped_name))
                mapped_in_key = bool(re.search(r"\b" + re.escape(mapped_name) + r"\b", key))
                if key_in_mapped or mapped_in_key:
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
