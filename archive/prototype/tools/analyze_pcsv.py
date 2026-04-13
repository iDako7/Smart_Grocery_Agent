"""PCSV analysis: deterministic ingredient categorization."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_mappings() -> dict[str, list[str]]:
    with open(DATA_DIR / "pcsv_mappings.json") as f:
        return json.load(f)


def _status(count: int) -> str:
    if count == 0:
        return "gap"
    elif count <= 1:
        return "low"
    return "ok"


def analyze_pcsv(ingredients: list[str]) -> dict:
    mappings = _load_mappings()
    categories: dict[str, list[str]] = {
        "protein": [],
        "carb": [],
        "veggie": [],
        "sauce": [],
    }

    for ingredient in ingredients:
        key = ingredient.lower().strip()
        roles = mappings.get(key, [])
        if not roles:
            # Try partial match — prefer the closest-length match to avoid
            # "rice" matching "rice vinegar" when "rice" itself exists
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

    return {
        cat: {"status": _status(len(items)), "items": items}
        for cat, items in categories.items()
    }
