"""Recipe search: filter and rank KB recipes by ingredient overlap."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_recipes() -> list[dict]:
    with open(DATA_DIR / "recipes.json") as f:
        return json.load(f)


def search_recipes(
    ingredients: list[str],
    cuisine: str | None = None,
    cooking_method: str | None = None,
    max_time: int | None = None,
    serves: int | None = None,
) -> list[dict]:
    recipes = _load_recipes()
    user_ingredients = {i.lower().strip() for i in ingredients}
    results = []

    for recipe in recipes:
        # Apply filters
        if cuisine and recipe.get("cuisine", "").lower() != cuisine.lower():
            continue
        if cooking_method and recipe.get("cooking_method", "").lower() != cooking_method.lower():
            continue
        if max_time and recipe.get("time_minutes", 0) > max_time:
            continue

        # Compute match score: how many user ingredients appear in recipe
        have = []
        need = []
        for ing in recipe["ingredients"]:
            name = ing["name"].lower()
            matched = False
            for user_ing in user_ingredients:
                if user_ing in name or name in user_ing:
                    matched = True
                    break
            if matched:
                have.append(ing["name"])
            else:
                need.append(ing["name"])

        # Skip recipes with zero ingredient overlap
        if not have:
            continue

        match_score = len(have) / len(recipe["ingredients"])

        results.append({
            "id": recipe["id"],
            "name": recipe["name"],
            "name_zh": recipe.get("name_zh", ""),
            "cuisine": recipe.get("cuisine", ""),
            "cooking_method": recipe.get("cooking_method", ""),
            "time_minutes": recipe.get("time_minutes", 0),
            "serves": recipe.get("serves", 0),
            "ingredients_have": have,
            "ingredients_need": need,
            "match_score": round(match_score, 2),
        })

    # Sort by match score descending
    results.sort(key=lambda r: r["match_score"], reverse=True)
    return results[:10]
