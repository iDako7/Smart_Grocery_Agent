"""
Merge CookWell scraped data into the main KB data files.

Reads:
  - data/cookwell_raw/normalized_recipes.json (50 recipes)
  - data/cookwell_raw/recipe_translations.json (id → name_zh)
  - data/cookwell_raw/pcsv_additions.json (ingredient → categories)
  - data/cookwell_raw/glossary_additions.json (new glossary entries)

Updates:
  - data/recipes.json (append 50 new recipes with name_zh + PCSV filled)
  - data/pcsv_mappings.json (merge new ingredient mappings)
  - data/glossary.json (append new glossary entries)
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "cookwell_raw"


def merge():
    # ── Load all inputs ───────────────────────────────────────────────────
    with open(RAW / "normalized_recipes.json") as f:
        new_recipes = json.load(f)

    with open(RAW / "recipe_translations.json") as f:
        translations = json.load(f)

    with open(RAW / "pcsv_additions.json") as f:
        pcsv_additions = json.load(f)

    with open(RAW / "glossary_additions.json") as f:
        glossary_additions = json.load(f)

    # ── Load existing data ────────────────────────────────────────────────
    with open(DATA / "recipes.json") as f:
        existing_recipes = json.load(f)

    with open(DATA / "pcsv_mappings.json") as f:
        existing_pcsv = json.load(f)

    with open(DATA / "glossary.json") as f:
        existing_glossary = json.load(f)

    # ── Apply translations + PCSV to new recipes ─────────────────────────
    merged_pcsv = {**existing_pcsv, **pcsv_additions}

    for recipe in new_recipes:
        # Fill name_zh from translations
        recipe["name_zh"] = translations.get(recipe["id"], "")

        # Fill PCSV roles for each ingredient
        for ing in recipe["ingredients"]:
            ing["pcsv"] = merged_pcsv.get(ing["name"], [])

    # ── Merge recipes ─────────────────────────────────────────────────────
    existing_ids = {r["id"] for r in existing_recipes}
    added = 0
    for recipe in new_recipes:
        if recipe["id"] not in existing_ids:
            existing_recipes.append(recipe)
            added += 1

    print(f"Recipes: {added} added → {len(existing_recipes)} total")

    # ── Merge PCSV mappings ───────────────────────────────────────────────
    pcsv_before = len(existing_pcsv)
    existing_pcsv.update(pcsv_additions)
    print(f"PCSV mappings: {len(existing_pcsv) - pcsv_before} added → {len(existing_pcsv)} total")

    # ── Merge glossary ────────────────────────────────────────────────────
    existing_en = {e["en"].lower() for e in existing_glossary}
    glossary_added = 0
    for entry in glossary_additions:
        if entry["en"].lower() not in existing_en:
            existing_glossary.append(entry)
            existing_en.add(entry["en"].lower())
            glossary_added += 1

    print(f"Glossary: {glossary_added} added → {len(existing_glossary)} total")

    # ── Write updated files ───────────────────────────────────────────────
    with open(DATA / "recipes.json", "w") as f:
        json.dump(existing_recipes, f, indent=2, ensure_ascii=False)

    with open(DATA / "pcsv_mappings.json", "w") as f:
        json.dump(existing_pcsv, f, indent=2, ensure_ascii=False)

    with open(DATA / "glossary.json", "w") as f:
        json.dump(existing_glossary, f, indent=2, ensure_ascii=False)

    print("\nAll data files updated successfully.")


if __name__ == "__main__":
    merge()
