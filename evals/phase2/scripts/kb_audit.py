#!/usr/bin/env python3
"""Audit the SQLite knowledge base for ingredient quality issues.

Detects overlapping/near-duplicate ingredients and excessive pantry staples
across all recipes in the KB.

Usage:
    python kb_audit.py [--kb-path PATH] [--json]
"""

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

PANTRY_STAPLES = {
    "salt",
    "pepper",
    "black pepper",
    "water",
    "oil",
    "neutral oil",
    "olive oil",
    "vegetable oil",
    "cooking oil",
    "sugar",
    "flour",
    "butter",
    "soy sauce",
    "sesame oil",
}


def normalize(name: str) -> str:
    """Lowercase, strip whitespace, remove trailing 's'."""
    return name.lower().strip().rstrip("s")


def is_similar(a: str, b: str) -> bool:
    """Check if two ingredient names are similar enough to be overlapping."""
    na, nb = normalize(a), normalize(b)
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    words_a, words_b = na.split(), nb.split()
    if words_a and words_b and words_a[-1] == words_b[-1]:
        return True
    return False


def find_overlaps(ingredients: list[dict]) -> list[tuple[str, str]]:
    """Find all overlapping ingredient pairs in a recipe."""
    names = [ing.get("name", "") for ing in ingredients]
    names = [n for n in names if n]
    overlaps = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if is_similar(names[i], names[j]):
                overlaps.append((names[i], names[j]))
    return overlaps


def is_pantry_staple(name: str) -> bool:
    """Check if an ingredient is a pantry staple (fuzzy match)."""
    nn = normalize(name)
    for staple in PANTRY_STAPLES:
        ns = normalize(staple)
        if nn == ns:
            return True
        if nn in ns or ns in nn:
            return True
    return False


def count_pantry_staples(ingredients: list[dict]) -> list[str]:
    """Return pantry staple ingredient names found in a recipe."""
    found = []
    for ing in ingredients:
        name = ing.get("name", "")
        if name and is_pantry_staple(name):
            found.append(name)
    return found


def get_repo_root() -> Path:
    """Walk up from this script to find the repo root (contains data/)."""
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / "data").is_dir():
            return current
        current = current.parent
    return Path.cwd()


def main():
    parser = argparse.ArgumentParser(description="Audit KB ingredients for quality issues")
    parser.add_argument(
        "--kb-path",
        type=str,
        default=None,
        help="Path to kb.sqlite (default: data/kb.sqlite relative to repo root)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="output_json",
        help="Also write results to evals/phase2/scripts/kb_audit_results.json",
    )
    args = parser.parse_args()

    repo_root = get_repo_root()

    if args.kb_path:
        db_path = Path(args.kb_path)
    else:
        db_path = repo_root / "data" / "kb.sqlite"

    if not db_path.exists():
        print(f"Error: database not found at {db_path}", file=sys.stderr)
        print("Use --kb-path to specify the correct location.", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT id, name, ingredients FROM recipes")
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        print("No recipes found in the database.")
        sys.exit(0)

    total_recipes = len(rows)

    # Collect per-recipe data
    all_ingredient_counts: list[int] = []
    max_count = 0
    max_recipe_name = ""
    max_recipe_id = ""

    recipes_with_overlaps: list[dict] = []
    overlap_pair_counter: Counter = Counter()

    recipes_with_3plus_staples: list[dict] = []
    staple_counter: Counter = Counter()
    total_staple_count = 0

    for row in rows:
        recipe_id = row["id"]
        recipe_name = row["name"]
        try:
            ingredients = json.loads(row["ingredients"])
        except (json.JSONDecodeError, TypeError):
            ingredients = []

        count = len(ingredients)
        all_ingredient_counts.append(count)

        if count > max_count:
            max_count = count
            max_recipe_name = recipe_name
            max_recipe_id = recipe_id

        # Overlaps
        overlaps = find_overlaps(ingredients)
        if overlaps:
            recipes_with_overlaps.append({
                "id": recipe_id,
                "name": recipe_name,
                "overlaps": overlaps,
            })
            for a, b in overlaps:
                # Canonical ordering for consistent counting
                pair = tuple(sorted([normalize(a), normalize(b)]))
                overlap_pair_counter[pair] += 1

        # Pantry staples
        staples = count_pantry_staples(ingredients)
        total_staple_count += len(staples)
        for s in staples:
            staple_counter[normalize(s)] += 1
        if len(staples) >= 3:
            recipes_with_3plus_staples.append({
                "id": recipe_id,
                "name": recipe_name,
                "staples": staples,
            })

    # Compute stats
    avg_ingredients = sum(all_ingredient_counts) / total_recipes if total_recipes else 0
    avg_staples = total_staple_count / total_recipes if total_recipes else 0

    # Distribution buckets
    buckets = [(1, 5), (6, 10), (11, 15), (16, 20), (21, 100)]
    bucket_counts: list[tuple[str, int]] = []
    for lo, hi in buckets:
        n = sum(1 for c in all_ingredient_counts if lo <= c <= hi)
        if n > 0:
            label = f"{lo}-{hi}" if hi < 100 else f"{lo}+"
            bucket_counts.append((label, n))

    overlap_count = len(recipes_with_overlaps)
    overlap_pct = (overlap_count / total_recipes * 100) if total_recipes else 0

    staple3_count = len(recipes_with_3plus_staples)
    staple3_pct = (staple3_count / total_recipes * 100) if total_recipes else 0

    top_overlap_pairs = overlap_pair_counter.most_common(10)
    top_staples = staple_counter.most_common(10)

    # --- Print report ---
    print("=== KB Ingredient Audit ===")
    print(f"Database: {db_path}")
    print(f"Total recipes: {total_recipes}")
    print()

    print("--- Ingredient counts ---")
    print(f"Average ingredients per recipe: {avg_ingredients:.1f}")
    print(f"Max ingredients: {max_count} ({max_recipe_name}, {max_recipe_id})")
    print("Distribution:")
    for label, n in bucket_counts:
        pct = n / total_recipes * 100
        print(f"  {label:>15s} ingredients: {n:>4d} recipes ({pct:.0f}%)")
    print()

    print("--- Overlapping ingredients ---")
    print(f"Recipes with overlaps: {overlap_count}/{total_recipes} ({overlap_pct:.0f}%)")
    if top_overlap_pairs:
        print("Top overlap pairs:")
        for i, (pair, n) in enumerate(top_overlap_pairs, 1):
            a, b = pair
            print(f'  {i}. "{a}" \u2248 "{b}" \u2014 {n} recipes')
    print()

    if recipes_with_overlaps:
        print("Affected recipes:")
        for r in recipes_with_overlaps:
            overlap_strs = [f'"{a}" \u2248 "{b}"' for a, b in r["overlaps"]]
            print(f"  {r['id']} {r['name']}: [{', '.join(overlap_strs)}]")
        print()

    print("--- Pantry staples ---")
    print(f"Recipes with 3+ pantry staples: {staple3_count}/{total_recipes} ({staple3_pct:.0f}%)")
    if top_staples:
        print("Most common:")
        for i, (name, n) in enumerate(top_staples, 1):
            print(f"  {i}. {name} \u2014 {n} recipes")
    print()
    print(f"Average pantry staples per recipe: {avg_staples:.1f}")

    # --- Optional JSON output ---
    if args.output_json:
        json_path = Path(__file__).resolve().parent / "kb_audit_results.json"
        results = {
            "database": str(db_path),
            "total_recipes": total_recipes,
            "ingredient_counts": {
                "average": round(avg_ingredients, 1),
                "max": max_count,
                "max_recipe": {"id": max_recipe_id, "name": max_recipe_name},
                "distribution": {label: n for label, n in bucket_counts},
            },
            "overlapping_ingredients": {
                "count": overlap_count,
                "percentage": round(overlap_pct, 1),
                "top_pairs": [
                    {"pair": list(pair), "count": n}
                    for pair, n in top_overlap_pairs
                ],
                "affected_recipes": [
                    {
                        "id": r["id"],
                        "name": r["name"],
                        "overlaps": [[a, b] for a, b in r["overlaps"]],
                    }
                    for r in recipes_with_overlaps
                ],
            },
            "pantry_staples": {
                "recipes_with_3_plus": staple3_count,
                "recipes_with_3_plus_percentage": round(staple3_pct, 1),
                "average_per_recipe": round(avg_staples, 1),
                "most_common": [
                    {"name": name, "count": n} for name, n in top_staples
                ],
            },
        }
        json_path.write_text(json.dumps(results, indent=2) + "\n")
        print(f"\nJSON results written to {json_path}")


if __name__ == "__main__":
    main()
