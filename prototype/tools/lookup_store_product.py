"""Store product lookup: fuzzy match against Costco data."""

import json
from pathlib import Path

from thefuzz import fuzz

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
COSTCO_DIR = DATA_DIR / "costco_raw"

_product_cache: list[dict] | None = None


def _load_all_products() -> list[dict]:
    global _product_cache
    if _product_cache is not None:
        return _product_cache

    products = []
    for path in COSTCO_DIR.glob("*.json"):
        with open(path) as f:
            data = json.load(f)
        department = data.get("department", path.stem)
        for product in data.get("products", []):
            products.append({
                "name": product["name"],
                "size": product.get("size", ""),
                "department": department,
                "category": product.get("category", ""),
                "available": product.get("available", True),
            })
    _product_cache = products
    return products


def lookup_store_product(
    item_name: str,
    store: str | None = None,
) -> dict:
    if store and store != "costco":
        return {
            "product_name": item_name,
            "package_size": "varies",
            "department": "unknown",
            "store": store,
            "alternatives": [],
            "note": "Community market data not available in prototype",
        }

    products = _load_all_products()
    query = item_name.lower().strip()

    scored = []
    for product in products:
        # Score against both name and category
        name_score = fuzz.token_sort_ratio(query, product["name"].lower())
        cat_score = fuzz.token_sort_ratio(query, product.get("category", "").lower())
        best_score = max(name_score, cat_score)
        scored.append((best_score, product))

    scored.sort(key=lambda x: x[0], reverse=True)

    if not scored or scored[0][0] < 40:
        return {
            "product_name": item_name,
            "package_size": "not found",
            "department": "unknown",
            "store": "costco",
            "alternatives": [],
        }

    best = scored[0][1]
    alternatives = [
        s[1]["name"] for s in scored[1:4] if s[0] > 50
    ]

    return {
        "product_name": best["name"],
        "package_size": best["size"],
        "department": best["department"],
        "store": "costco",
        "alternatives": alternatives,
    }
