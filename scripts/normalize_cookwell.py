"""
Normalize scraped CookWell batch files into recipes.json schema format.

Input: data/cookwell_raw/batch_*.json
Output: data/cookwell_raw/normalized_recipes.json

Does NOT modify recipes.json — that happens in the merge step.
"""

import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "cookwell_raw"
OUTPUT = RAW_DIR / "normalized_recipes.json"

# ── Time parsing ──────────────────────────────────────────────────────────────

def parse_time_minutes(cook_time: str) -> int:
    """Parse free-text cook time to minutes. Returns best estimate."""
    if not cook_time:
        return 0
    s = cook_time.lower().strip()

    total = 0
    # Match patterns like "4 hrs 30 mins", "1 hour", "45 minutes", "2 hours 30 minutes"
    hr_match = re.findall(r'(\d+)\s*(?:hrs?|hours?)', s)
    min_match = re.findall(r'(\d+)\s*(?:mins?|minutes?)', s)

    for h in hr_match:
        total += int(h) * 60
    for m in min_match:
        total += int(m)

    if total > 0:
        return total

    # Handle "30 minutes plus marinating time" — just take the cook time
    # Handle ranges like "15-20 minutes" — take midpoint
    range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(?:mins?|minutes?)', s)
    if range_match:
        return (int(range_match.group(1)) + int(range_match.group(2))) // 2

    # Plain number with "min"
    plain = re.search(r'(\d+)\s*min', s)
    if plain:
        return int(plain.group(1))

    # Just a number
    just_num = re.search(r'(\d+)', s)
    if just_num:
        return int(just_num.group(1))

    return 30  # fallback


def effort_from_minutes(minutes: int) -> str:
    if minutes <= 15:
        return "quick"
    elif minutes <= 45:
        return "medium"
    else:
        return "long"


# ── Servings parsing ──────────────────────────────────────────────────────────

def parse_servings(servings_text: str) -> int:
    if not servings_text:
        return 4
    s = servings_text.lower()

    # "serves 3-4" or "3-4 servings" → take higher
    range_match = re.search(r'(\d+)\s*[-–]\s*(\d+)', s)
    if range_match:
        return int(range_match.group(2))

    # "4 servings" or "serves 4"
    num_match = re.search(r'(\d+)', s)
    if num_match:
        return int(num_match.group(1))

    return 4  # fallback


# ── Cooking method inference ──────────────────────────────────────────────────

COOKING_METHODS = [
    ("deep fr", "deep-fry"),
    ("air fr", "air-fry"),
    ("stir.?fr", "stir-fry"),
    ("fry", "fry"),
    ("brais", "braise"),
    ("broth|simmer|stew|pozole|soup", "braise"),
    ("grill", "grill"),
    ("roast|oven|bake|broil", "oven"),
    ("boil", "boil"),
    ("sear|pan", "pan-sear"),
    ("wok", "stir-fry"),
]

def infer_cooking_method(instructions: str, title: str) -> str:
    text = (title + " " + instructions).lower()
    for pattern, method in COOKING_METHODS:
        if re.search(pattern, text):
            return method
    return "mixed"


# ── Flavor tags inference ─────────────────────────────────────────────────────

CUISINE_FLAVOR_MAP = {
    "Mexican": ["savory", "spicy"],
    "Korean-Mexican": ["spicy", "umami", "savory"],
    "Indian": ["spicy", "aromatic"],
    "Pakistani": ["spicy", "aromatic"],
    "Thai": ["spicy", "aromatic", "umami"],
    "Vietnamese": ["aromatic", "fresh", "umami"],
    "Filipino": ["savory", "tangy", "umami"],
    "Chinese": ["umami", "savory"],
    "Chinese-American": ["savory", "sweet"],
    "Taiwanese": ["umami", "savory", "aromatic"],
    "Cantonese": ["umami", "savory"],
    "Japanese": ["umami", "savory"],
    "Italian": ["savory", "herby"],
    "Italian-American": ["savory", "cheesy"],
    "French": ["rich", "savory"],
    "Belgian": ["rich", "savory"],
    "Eastern European": ["savory", "comfort"],
    "Mediterranean": ["aromatic", "herby"],
    "Middle Eastern": ["spicy", "aromatic"],
    "West African": ["spicy", "aromatic"],
    "Caribbean": ["spicy", "savory"],
    "German-Turkish": ["spicy", "savory"],
    "Colombian": ["savory", "comfort"],
    "Southeast Asian": ["aromatic", "savory", "umami"],
    "Malaysian/Indonesian": ["spicy", "aromatic", "rich"],
}

EXTRA_FLAVOR_SIGNALS = [
    (r"chili|chile|gochujang|harissa|sriracha|jalapeño|spicy|hot sauce", "spicy"),
    (r"sweet|honey|sugar|caramel", "sweet"),
    (r"soy sauce|fish sauce|miso|oyster sauce|msg", "umami"),
    (r"lemon|lime|vinegar|tamarind|citrus", "tangy"),
    (r"ginger|lemongrass|cinnamon|star anise|cardamom|cumin", "aromatic"),
    (r"cheese|cream|butter|bechamel", "rich"),
    (r"garlic|herb|rosemary|basil|cilantro|thyme|oregano", "herby"),
    (r"smoke|charr|bbq|grill", "smoky"),
]

def infer_flavor_tags(cuisine: str, ingredients: list, instructions: str) -> list[str]:
    tags = set(CUISINE_FLAVOR_MAP.get(cuisine, ["savory"]))

    text = instructions.lower()
    for ing in ingredients:
        text += " " + ing.get("name", "").lower()

    for pattern, tag in EXTRA_FLAVOR_SIGNALS:
        if re.search(pattern, text):
            tags.add(tag)

    return sorted(tags)[:4]  # cap at 4 tags


# ── Ingredient normalization ──────────────────────────────────────────────────

# Prep/descriptor suffixes to strip from ingredient names
PREP_PATTERNS = [
    r',\s*(thinly\s+)?sliced.*$',
    r',\s*diced.*$',
    r',\s*minced.*$',
    r',\s*chopped.*$',
    r',\s*grated.*$',
    r',\s*julienned.*$',
    r',\s*cubed.*$',
    r',\s*finely\s+\w+.*$',
    r',\s*optional.*$',
    r',\s*crushed.*$',
    r',\s*peeled.*$',
    r'\s*\(.*\)$',  # strip parenthetical notes
    r',\s*low-cal.*$',
    r',\s*for\s+\w+.*$',
]

def normalize_ingredient_name(name: str) -> str:
    """Lowercase and strip prep notes to get a clean ingredient name."""
    n = name.strip().lower()
    for pattern in PREP_PATTERNS:
        n = re.sub(pattern, '', n, flags=re.IGNORECASE)
    return n.strip()


def dedupe_ingredients(ingredients: list) -> list:
    """Remove duplicate ingredients (same name), keeping the first occurrence."""
    seen = set()
    result = []
    for ing in ingredients:
        norm = normalize_ingredient_name(ing["name"])
        if norm not in seen:
            seen.add(norm)
            result.append(ing)
    return result


# ── Cuisine normalization ─────────────────────────────────────────────────────

CUISINE_NORMALIZE = {
    "Korean-Mexican": "Korean-Mexican",
    "Italian-American": "American",
    "Chinese-American": "Chinese",
    "Cantonese": "Chinese",
    "Taiwanese": "Chinese",
    "Malaysian/Indonesian": "Malaysian",
    "Eastern European": "Eastern European",
    "German-Turkish": "Turkish",
    "Southeast Asian": "Southeast Asian",
}

def normalize_cuisine(cuisine: str) -> str:
    return CUISINE_NORMALIZE.get(cuisine, cuisine)


# ── Main ──────────────────────────────────────────────────────────────────────

def normalize_all():
    # Load all batches
    raw_recipes = []
    for batch_file in sorted(RAW_DIR.glob("batch_*.json")):
        with open(batch_file) as f:
            raw_recipes.extend(json.load(f))

    print(f"Loaded {len(raw_recipes)} raw recipes from {len(list(RAW_DIR.glob('batch_*.json')))} batch files")

    normalized = []
    for i, raw in enumerate(raw_recipes, start=21):
        recipe_id = f"r{i:03d}"

        time_minutes = parse_time_minutes(raw.get("cook_time", ""))
        cuisine_raw = raw.get("cuisine", "")

        # Dedupe and keep original names for ingredient list
        deduped = dedupe_ingredients(raw.get("ingredients", []))

        ingredients = []
        for ing in deduped:
            ingredients.append({
                "name": normalize_ingredient_name(ing["name"]),
                "amount": ing.get("amount", ""),
                "pcsv": []  # filled in B6
            })

        recipe = {
            "id": recipe_id,
            "name": raw["title"],
            "name_zh": "",  # filled in B5
            "source": "CookWell",
            "source_url": raw.get("source_url", f"https://www.cookwell.com/recipe/{raw['slug']}"),
            "cuisine": normalize_cuisine(cuisine_raw),
            "cooking_method": infer_cooking_method(raw.get("instructions", ""), raw["title"]),
            "time_minutes": time_minutes,
            "effort_level": effort_from_minutes(time_minutes),
            "flavor_tags": infer_flavor_tags(cuisine_raw, raw.get("ingredients", []), raw.get("instructions", "")),
            "serves": parse_servings(raw.get("servings", "")),
            "ingredients": ingredients,
            "instructions": raw.get("instructions", ""),
            "is_ai_generated": False,
        }
        normalized.append(recipe)

    with open(OUTPUT, "w") as f:
        json.dump(normalized, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(normalized)} normalized recipes to {OUTPUT}")

    # Summary
    cuisines = {}
    efforts = {}
    methods = {}
    for r in normalized:
        cuisines[r["cuisine"]] = cuisines.get(r["cuisine"], 0) + 1
        efforts[r["effort_level"]] = efforts.get(r["effort_level"], 0) + 1
        methods[r["cooking_method"]] = methods.get(r["cooking_method"], 0) + 1

    print(f"\nCuisine distribution: {dict(sorted(cuisines.items(), key=lambda x: -x[1]))}")
    print(f"Effort distribution: {efforts}")
    print(f"Method distribution: {dict(sorted(methods.items(), key=lambda x: -x[1]))}")


if __name__ == "__main__":
    normalize_all()
