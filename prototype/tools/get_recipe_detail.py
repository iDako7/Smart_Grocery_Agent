"""Get full recipe detail by ID."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_recipes() -> list[dict]:
    with open(DATA_DIR / "recipes.json") as f:
        return json.load(f)


def get_recipe_detail(recipe_id: str) -> dict:
    recipes = _load_recipes()
    for recipe in recipes:
        if recipe["id"] == recipe_id:
            return recipe

    return {"error": f"Recipe {recipe_id} not found"}
