"""
Scrape Save-On-Foods (store 1982, Langley BC) grocery product data via their public search API.

Iterates over department subcategories, using each subcategory name as a search query
combined with a Breadcrumb filter. Outputs one JSON file per department in data/saveonfoods_raw/,
matching the Costco raw data format.

Usage:
    python scripts/scrape_saveonfoods.py            # full scrape
    python scripts/scrape_saveonfoods.py --dry-run   # print plan without making API calls
"""

import argparse
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API_BASE = "https://storefrontgateway.saveonfoods.com/api"
STORE_ID = "1982"
STORE_NAME = "Save-On-Foods Langley"
TAKE = 100
DELAY_SECONDS = 1.0

# Each department: (key, display_name, parent_category_id, breadcrumb_parent, subcategories)
# Subcategories: list of (name, category_id, search_term, breadcrumb_slug)
# breadcrumb_slug is the lowercase subcategory name used in the Breadcrumb filter path.

DEPARTMENTS = [
    {
        "key": "produce",
        "name": "Fruits & Vegetables",
        "parent_id": 30681,
        "breadcrumb_parent": "fruits & vegetables",
        "subcategories": [
            ("Fresh Fruit", 30682, "fruit", "fresh fruit"),
            ("Fresh Vegetables", 30694, "vegetables", "fresh vegetables"),
            ("Salad Kits & Greens", 30717, "salad", "salad kits & greens, essentials"),
            ("Fresh Juice & Smoothies", 30723, "juice smoothies", "fresh juice & smoothies"),
            ("Fresh Noodle/Tofu/Soy", 30724, "tofu", "fresh noodle, tofu & soy products"),
            ("Trays/Baskets/Platters", 30713, "fruit vegetable tray", "trays, baskets, platters"),
            ("Dried Snack Fruit & Nuts", 30725, "dried fruit nuts", "dried snack fruit & nuts"),
            ("Dressing & Dips", 30722, "dressing dips", "dressing & dips"),
        ],
    },
    {
        "key": "meat_seafood",
        "name": "Meat & Seafood",
        "parent_id": 30791,
        "breadcrumb_parent": "meat & seafood",
        "subcategories": [
            ("Bacon", 30817, "bacon", "bacon"),
            ("Beef & Veal", 30792, "beef veal", "beef & veal"),
            ("Chicken & Turkey", 30798, "chicken turkey", "chicken & turkey"),
            ("Fish", 30827, "fish", "fish"),
            ("Frozen Meat", 30830, "frozen meat", "frozen meat"),
            ("Frozen Seafood", 30842, "frozen seafood", "frozen seafood"),
            ("Game & Specialty Meats", 30816, "game specialty meats", "game & specialty meats"),
            ("Hot Dogs & Sausages", 30818, "hot dogs sausages", "hot dogs & sausages"),
            ("Lamb", 30815, "lamb", "lamb"),
            ("Meat Alternatives", 30821, "meat alternatives", "meat alternatives"),
            ("Pork & Ham", 30807, "pork ham", "pork & ham"),
            ("Shrimp & Shell Fish", 30828, "shrimp shellfish", "shrimp & shell fish"),
            ("Smoked & Cured Fish", 30829, "smoked cured fish", "smoked & cured fish"),
        ],
    },
    {
        "key": "dairy_eggs",
        "name": "Dairy & Eggs",
        "parent_id": 30906,
        "breadcrumb_parent": "dairy & eggs",
        "subcategories": [
            ("Butter & Margarine", 30907, "butter margarine", "butter & margarine"),
            ("Cheese", 30910, "cheese", "cheese"),
            ("Chilled Juice & Drinks", 30920, "chilled juice drinks", "chilled juice & drinks"),
            ("Dough Products", 30929, "dough products", "dough products"),
            ("Eggs & Substitutes", 30919, "eggs", "eggs & substitutes"),
            ("Milk & Creams", 30930, "milk cream", "milk & creams"),
            ("Milk Substitutes", 30939, "milk substitutes", "milk substitutes"),
            ("Pudding & Desserts", 30943, "pudding desserts", "pudding & desserts"),
            ("Sour Cream & Dips", 30944, "sour cream dips", "sour cream & dips"),
            ("Yogurt", 30945, "yogurt", "yogurt"),
        ],
    },
    {
        "key": "bakery",
        "name": "Bakery",
        "parent_id": 30846,
        "breadcrumb_parent": "bakery",
        "subcategories": [
            ("Bagels & English Muffins", 30847, "bagels english muffins", "bagels & english muffins"),
            ("Breads", 30850, "bread", "breads"),
            ("Cakes", 30888, "cake", "cakes"),
            ("Dessert & Pastries", 30879, "dessert pastries", "dessert & pastries"),
            ("Frozen Bakery", 30901, "frozen bakery", "frozen bakery"),
            ("Pies & Tarts", 30894, "pies tarts", "pies & tarts"),
            ("Pitas/Flatbread/Wraps", 30899, "pita flatbread wraps", "pitas, flatbread & wraps"),
            ("Pizza Crust & Crumbs", 30887, "pizza crust crumbs", "pizza crust & crumbs"),
            ("Rolls & Buns", 30873, "rolls buns", "rolls & buns"),
            ("Roti & Naan", 30900, "roti naan", "roti & naan"),
        ],
    },
    {
        "key": "pantry",
        "name": "Pantry",
        "parent_id": 31475,
        "breadcrumb_parent": "pantry",
        "subcategories": [
            ("Baking Goods", 30373, "baking", "baking goods"),
            ("Breakfast", 30481, "breakfast cereal", "breakfast"),
            ("Canned & Packaged", 30527, "canned packaged", "canned & packaged"),
            ("Condiments & Toppings", 30596, "condiments toppings", "condiments & toppings"),
            ("Herbs/Spices/Seasonings", 30635, "herbs spices seasonings", "herbs, spices & seasonings"),
            ("Marinates & Sauces", 30614, "marinades sauces", "marinates & sauces"),
            ("Oils & Vinegars", 30625, "oil vinegar", "oils & vinegars"),
            ("Pasta/Sauces/Grains", 30652, "pasta grains rice", "pasta, sauces & grains"),
            ("Beverages", 30385, "beverages", "beverages"),
            ("Bulk", 31287, "bulk", "bulk"),
            ("Candy", 30504, "candy", "candy"),
            ("Snacks", 30511, "snacks chips", "snacks"),
        ],
    },
    {
        "key": "frozen",
        "name": "Frozen",
        "parent_id": 30949,
        "breadcrumb_parent": "frozen",
        "subcategories": [
            ("Frozen Appetizers & Snacks", 30950, "frozen appetizers snacks", "frozen appetizers & snacks"),
            ("Frozen Bakery", 30956, "frozen bakery", "frozen bakery"),
            ("Frozen Beverages & Ice", 30960, "frozen beverages ice", "frozen beverages & ice"),
            ("Frozen Breakfast", 30967, "frozen breakfast", "frozen breakfast"),
            ("Frozen Fruit", 30971, "frozen fruit", "frozen fruit"),
            ("Frozen Meals & Sides", 30976, "frozen meals sides", "frozen meals & sides"),
            ("Frozen Meat", 30982, "frozen meat", "frozen meat"),
            ("Frozen Pizza", 30993, "frozen pizza", "frozen pizza"),
            ("Frozen Seafood", 30999, "frozen seafood", "frozen seafood"),
            ("Frozen Vegetables", 31002, "frozen vegetables", "frozen vegetables"),
            ("Ice Cream & Desserts", 31008, "ice cream desserts", "ice cream & desserts"),
        ],
    },
    {
        "key": "deli",
        "name": "Deli & Ready Made Meals",
        "parent_id": 30726,
        "breadcrumb_parent": "deli & ready made meals",
        "subcategories": [
            ("Cheese", 30748, "deli cheese", "cheese"),
            ("Dips/Spreads/Olives", 30772, "dips spreads olives", "dips, spreads & olives"),
            ("Meat", 30727, "deli meat", "meat"),
            ("Party Platters", 30790, "party platters", "party platters"),
            ("Quick Ready Meals & Sides", 30776, "ready meals sides", "quick ready meals & sides"),
        ],
    },
    {
        "key": "international",
        "name": "International Foods",
        "parent_id": 31405,
        "breadcrumb_parent": "international foods",
        "subcategories": [
            ("Asian", 31406, "asian food", "asian"),
            ("European", 31439, "european food", "european"),
            ("Indian & Middle Eastern", 31415, "indian middle eastern", "indian & middle eastern"),
            ("Latin & Mexican", 31432, "latin mexican", "latin & mexican"),
            ("Mediterranean", 31445, "mediterranean food", "mediterranean"),
        ],
    },
    {
        "key": "plant_based",
        "name": "Plant Based & Non Dairy",
        "parent_id": 32100,
        "breadcrumb_parent": "plant based & non dairy",
        "subcategories": [
            ("Meat Alternatives", 34100, "meat alternatives plant based", "meat alternatives"),
            ("Non Dairy Beverages", 35100, "non dairy beverages", "non dairy beverages"),
            ("Non Dairy Cheese", 36100, "non dairy cheese", "non dairy cheese"),
            ("Non Dairy Creamers", 37100, "non dairy creamers", "non dairy creamers"),
            ("Non Dairy Frozen Dessert", 38100, "non dairy frozen dessert", "non dairy frozen dessert"),
            ("Non Dairy Spreads & Condiments", 39100, "non dairy spreads condiments", "non dairy spreads & condiments"),
            ("Non Dairy Yogurt", 39101, "non dairy yogurt", "non dairy yogurt"),
            ("Tofu", 39102, "tofu", "tofu"),
            ("Egg Alternatives", 33100, "egg alternatives", "egg alternatives"),
        ],
    },
]

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "saveonfoods_raw"


def build_search_url(query: str, breadcrumb_parent: str, breadcrumb_slug: str, skip: int = 0) -> str:
    """Build the search API URL with query, pagination, and breadcrumb filter."""
    breadcrumb_value = f"grocery/{breadcrumb_parent}/{breadcrumb_slug}"
    params = urllib.parse.urlencode({
        "q": query,
        "take": TAKE,
        "skip": skip,
        "sort": "relevance",
        "f": f"Breadcrumb:{breadcrumb_value}",
    })
    return f"{API_BASE}/stores/{STORE_ID}/search?{params}"


def _ssl_context() -> ssl.SSLContext:
    """Create an SSL context that trusts Cloudflare's certificate chain."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


_SSL_CTX = _ssl_context()


def fetch_json(url: str) -> dict:
    """Fetch a URL and parse the JSON response."""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def format_size(unit_of_size: dict | None) -> str:
    """Format unitOfSize into a human-readable string like '1.36 kg'."""
    if not unit_of_size:
        return ""
    size = unit_of_size.get("size")
    abbr = unit_of_size.get("abbreviation", "")
    if size is None:
        return abbr
    # Format size: drop trailing .0 for whole numbers
    if isinstance(size, float) and size == int(size):
        size_str = str(int(size))
    else:
        size_str = str(size)
    return f"{size_str} {abbr}".strip()


def extract_product(item: dict, subcategory_name: str) -> dict:
    """Convert an API search result item to our standard product format."""
    image = item.get("image") or {}
    return {
        "productId": str(item.get("sku", "")),
        "name": item.get("name", ""),
        "size": format_size(item.get("unitOfSize")),
        "brandName": item.get("brand"),  # preserve null
        "category": subcategory_name,
        "retailerRef": "",
        "imageUrl": image.get("default", ""),
        "available": item.get("available", False),
    }


def scrape_subcategory(
    subcat_name: str,
    search_term: str,
    breadcrumb_parent: str,
    breadcrumb_slug: str,
    dry_run: bool = False,
) -> list[dict]:
    """Scrape all products for a single subcategory, handling pagination."""
    products = []
    skip = 0

    while True:
        url = build_search_url(search_term, breadcrumb_parent, breadcrumb_slug, skip)

        if dry_run:
            print(f"    [DRY RUN] Would fetch: {url}")
            return []

        print(f"    Fetching skip={skip}: {url}")

        try:
            data = fetch_json(url)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            print(f"    ERROR fetching {subcat_name} (skip={skip}): {e}")
            break

        items = data.get("items", [])
        if not items:
            break

        for item in items:
            products.append(extract_product(item, subcat_name))

        print(f"    Got {len(items)} items (total so far: {len(products)})")

        # If we got fewer than TAKE results, we've reached the end
        if len(items) < TAKE:
            break

        skip += TAKE
        time.sleep(DELAY_SECONDS)

    return products


def scrape_department(dept: dict, dry_run: bool = False) -> dict:
    """Scrape all subcategories for a department, deduplicate by productId."""
    key = dept["key"]
    breadcrumb_parent = dept["breadcrumb_parent"]
    subcategories = dept["subcategories"]

    print(f"\n{'='*60}")
    print(f"Department: {dept['name']} ({key})")
    print(f"{'='*60}")

    seen_skus: set[str] = set()
    all_products: list[dict] = []

    for subcat_name, subcat_id, search_term, breadcrumb_slug in subcategories:
        print(f"\n  Subcategory: {subcat_name}")

        products = scrape_subcategory(
            subcat_name, search_term, breadcrumb_parent, breadcrumb_slug, dry_run
        )

        # Deduplicate by productId within the department
        new_count = 0
        for p in products:
            pid = p["productId"]
            if pid not in seen_skus:
                seen_skus.add(pid)
                all_products.append(p)
                new_count += 1

        dupes = len(products) - new_count
        if not dry_run:
            print(f"    Added {new_count} new products ({dupes} duplicates skipped)")
            time.sleep(DELAY_SECONDS)

    result = {
        "department": key,
        "scrape_date": date.today().isoformat(),
        "store": {
            "storeId": STORE_ID,
            "name": STORE_NAME,
        },
        "product_count": len(all_products),
        "products": all_products,
    }

    print(f"\n  Total unique products for {key}: {len(all_products)}")
    return result


def save_department(dept_data: dict) -> Path:
    """Write department data to a JSON file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{dept_data['department']}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dept_data, f, indent=2, ensure_ascii=False)
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Scrape Save-On-Foods grocery products for store 1982 (Langley BC)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without making API calls",
    )
    parser.add_argument(
        "--department",
        type=str,
        default=None,
        help="Scrape only this department key (e.g. 'produce', 'meat_seafood')",
    )
    args = parser.parse_args()

    dept_keys = {d["key"] for d in DEPARTMENTS}
    if args.department and args.department not in dept_keys:
        print(f"Unknown department: {args.department}")
        print(f"Available: {', '.join(sorted(dept_keys))}")
        return

    departments_to_scrape = DEPARTMENTS
    if args.department:
        departments_to_scrape = [d for d in DEPARTMENTS if d["key"] == args.department]

    print(f"Save-On-Foods Scraper — Store {STORE_ID} ({STORE_NAME})")
    print(f"Date: {date.today().isoformat()}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Departments: {len(departments_to_scrape)}")
    if args.dry_run:
        print("MODE: DRY RUN (no API calls)")

    total_products = 0
    for dept in departments_to_scrape:
        dept_data = scrape_department(dept, dry_run=args.dry_run)

        if not args.dry_run:
            output_path = save_department(dept_data)
            print(f"  Saved to: {output_path}")
            total_products += dept_data["product_count"]
        else:
            subcat_count = len(dept["subcategories"])
            print(f"  Would scrape {subcat_count} subcategories")

    print(f"\n{'='*60}")
    if args.dry_run:
        total_subcats = sum(len(d["subcategories"]) for d in departments_to_scrape)
        print(f"DRY RUN complete. Would scrape {total_subcats} subcategories across {len(departments_to_scrape)} departments.")
    else:
        print(f"Scrape complete. {total_products} total products across {len(departments_to_scrape)} departments.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
