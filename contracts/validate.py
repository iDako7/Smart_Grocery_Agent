"""Dev-only smoke test for contract files.

Validates:
1. All Pydantic models import and instantiate with sample data
2. JSON round-trip (serialize → deserialize) works
3. TOOLS list has 7 entries with correct names
4. kb_schema.sql executes against in-memory SQLite
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. Import all contract models
# ---------------------------------------------------------------------------

from contracts.tool_schemas import (
    TOOLS,
    AnalyzePcsvInput,
    GetRecipeDetailInput,
    GetSubstitutionsInput,
    Ingredient,
    LookupStoreProductInput,
    PCSVCategory,
    PCSVResult,
    RecipeDetail,
    RecipeSummary,
    SearchRecipesInput,
    StoreProduct,
    Substitution,
    TranslateTermInput,
    TranslateTermResult,
    UpdateUserProfileInput,
    UpdateUserProfileResult,
    UserProfile,
)
from contracts.sse_events import (
    DoneEvent,
    ErrorEvent,
    ExplanationEvent,
    GroceryDepartment,
    GroceryItem,
    GroceryListEvent,
    GroceryStore,
    PcsvUpdateEvent,
    RecipeCardEvent,
    ThinkingEvent,
)
from contracts.api_types import (
    ChatRequest,
    ConversationTurn,
    CreateSessionRequest,
    CreateSessionResponse,
    SavedGroceryList,
    SavedGroceryListSummary,
    SavedMealPlan,
    SavedMealPlanSummary,
    SavedRecipe,
    SavedRecipeSummary,
    SaveGroceryListRequest,
    SaveMealPlanRequest,
    SaveRecipeRequest,
    SendCodeRequest,
    SendCodeResponse,
    SessionStateResponse,
    UpdateGroceryListRequest,
    UpdateMealPlanRequest,
    UpdateSavedRecipeRequest,
    VerifyRequest,
    VerifyResponse,
)

errors: list[str] = []


def check(label: str, fn):
    try:
        fn()
    except Exception as e:
        errors.append(f"FAIL: {label} — {e}")


# ---------------------------------------------------------------------------
# 2. Instantiate each model with sample data and round-trip
# ---------------------------------------------------------------------------


def round_trip(model_cls, data: dict):
    """Instantiate, serialize to JSON, deserialize back, assert equality."""
    obj = model_cls(**data)
    json_str = obj.model_dump_json()
    obj2 = model_cls.model_validate_json(json_str)
    assert obj == obj2, f"Round-trip mismatch for {model_cls.__name__}"


# Tool input models
check("AnalyzePcsvInput", lambda: round_trip(AnalyzePcsvInput, {"ingredients": ["chicken", "rice"]}))
check("SearchRecipesInput", lambda: round_trip(SearchRecipesInput, {"ingredients": ["chicken"], "effort_level": "quick", "flavor_tags": ["spicy"]}))
check("LookupStoreProductInput", lambda: round_trip(LookupStoreProductInput, {"item_name": "chicken thighs", "store": "costco"}))
check("GetSubstitutionsInput", lambda: round_trip(GetSubstitutionsInput, {"ingredient": "gochujang", "reason": "unavailable"}))
check("GetRecipeDetailInput", lambda: round_trip(GetRecipeDetailInput, {"recipe_id": "r001"}))
check("UpdateUserProfileInput", lambda: round_trip(UpdateUserProfileInput, {"field": "dietary_restrictions", "value": ["halal"]}))
check("TranslateTermInput", lambda: round_trip(TranslateTermInput, {"term": "gochujang", "direction": "en_to_zh"}))

# Tool output models
check("PCSVResult", lambda: round_trip(PCSVResult, {
    "protein": {"status": "ok", "items": ["chicken"]},
    "carb": {"status": "gap", "items": []},
    "veggie": {"status": "low", "items": ["garlic"]},
    "sauce": {"status": "ok", "items": ["soy sauce"]},
}))

check("RecipeSummary", lambda: round_trip(RecipeSummary, {
    "id": "r001", "name": "Korean BBQ Pork Belly", "name_zh": "韩式烤五花肉",
    "cuisine": "Korean", "cooking_method": "grill", "effort_level": "medium",
    "flavor_tags": ["umami", "spicy"], "serves": 4,
    "pcsv_roles": {"protein": ["pork belly"]},
    "ingredients_have": ["pork belly"], "ingredients_need": ["gochujang"],
}))

check("RecipeDetail", lambda: round_trip(RecipeDetail, {
    "id": "r001", "name": "Korean BBQ Pork Belly", "name_zh": "韩式烤五花肉",
    "source": "Serious Eats / Kenji", "source_url": "https://example.com",
    "cuisine": "Korean", "cooking_method": "grill", "effort_level": "medium",
    "time_minutes": 45, "flavor_tags": ["umami", "spicy"], "serves": 4,
    "ingredients": [{"name": "pork belly", "amount": "2 lbs", "pcsv": ["protein"]}],
    "instructions": "Grill the pork belly.", "is_ai_generated": False,
}))

check("StoreProduct", lambda: round_trip(StoreProduct, {
    "name": "Kirkland Chicken Thighs", "size": "2.5 kg",
    "department": "meat_seafood", "store": "costco", "alternatives": [],
}))

check("Substitution", lambda: round_trip(Substitution, {
    "substitute": "miso paste + chili flakes", "match_quality": "good", "notes": "Less sweet",
}))

check("UserProfile", lambda: round_trip(UserProfile, {
    "household_size": 4, "dietary_restrictions": ["halal"],
    "preferred_cuisines": ["Korean"], "disliked_ingredients": ["cilantro"],
    "preferred_stores": ["costco"], "notes": "",
}))

check("UpdateUserProfileResult", lambda: round_trip(UpdateUserProfileResult, {
    "updated": True, "field": "dietary_restrictions", "new_value": ["halal"],
}))

check("TranslateTermResult", lambda: round_trip(TranslateTermResult, {
    "term": "gochujang", "translation": "辣椒酱", "direction": "en_to_zh", "match_type": "exact",
}))

# SSE event models
check("ThinkingEvent", lambda: round_trip(ThinkingEvent, {"message": "Analyzing..."}))
check("PcsvUpdateEvent", lambda: round_trip(PcsvUpdateEvent, {
    "pcsv": {
        "protein": {"status": "ok", "items": ["chicken"]},
        "carb": {"status": "gap", "items": []},
        "veggie": {"status": "low", "items": ["garlic"]},
        "sauce": {"status": "ok", "items": ["soy sauce"]},
    }
}))
check("RecipeCardEvent", lambda: round_trip(RecipeCardEvent, {
    "recipe": {"id": "r001", "name": "Test Recipe"},
}))
check("ExplanationEvent", lambda: round_trip(ExplanationEvent, {"text": "Here's my reasoning..."}))
check("GroceryListEvent", lambda: round_trip(GroceryListEvent, {
    "stores": [{
        "store_name": "Costco",
        "departments": [{
            "name": "meat_seafood",
            "items": [{"id": "gi-001", "name": "pork belly", "amount": "2 lbs", "recipe_context": "for Korean BBQ", "checked": False}],
        }],
    }],
}))
check("ErrorEvent", lambda: round_trip(ErrorEvent, {"message": "LLM timeout", "code": "llm_error", "recoverable": True}))
check("DoneEvent (complete)", lambda: round_trip(DoneEvent, {"status": "complete"}))
check("DoneEvent (partial)", lambda: round_trip(DoneEvent, {"status": "partial", "reason": "max_iterations"}))

# API types
check("CreateSessionRequest", lambda: round_trip(CreateSessionRequest, {}))
check("ChatRequest (core)", lambda: round_trip(ChatRequest, {"message": "I have chicken", "screen": "home"}))
check("ChatRequest (saved)", lambda: round_trip(ChatRequest, {"message": "Add a dessert", "screen": "saved_meal_plan", "target_id": "mp-001"}))
check("SendCodeRequest", lambda: round_trip(SendCodeRequest, {"email": "test@example.com"}))
check("VerifyRequest", lambda: round_trip(VerifyRequest, {"email": "test@example.com", "code": "123456"}))
check("SaveMealPlanRequest", lambda: round_trip(SaveMealPlanRequest, {"name": "Saturday BBQ", "session_id": "s-001"}))
check("SaveRecipeRequest", lambda: round_trip(SaveRecipeRequest, {
    "recipe_id": "r001",
    "recipe_snapshot": {"id": "r001", "name": "Test Recipe"},
}))
check("SaveGroceryListRequest", lambda: round_trip(SaveGroceryListRequest, {"name": "Weekend Shop", "session_id": "s-001"}))
check("UpdateMealPlanRequest", lambda: round_trip(UpdateMealPlanRequest, {"name": "Updated BBQ"}))
check("UpdateSavedRecipeRequest", lambda: round_trip(UpdateSavedRecipeRequest, {"notes": "Halved the recipe"}))
check("UpdateGroceryListRequest", lambda: round_trip(UpdateGroceryListRequest, {}))

# ---------------------------------------------------------------------------
# 3. Validate TOOLS list
# ---------------------------------------------------------------------------

EXPECTED_TOOL_NAMES = [
    "analyze_pcsv",
    "search_recipes",
    "lookup_store_product",
    "get_substitutions",
    "get_recipe_detail",
    "update_user_profile",
    "translate_term",
]

def _check_tools_count():
    assert len(TOOLS) == 7, f"Expected 7 tools, got {len(TOOLS)}"

def _check_tools_names():
    actual = [t["function"]["name"] for t in TOOLS]
    assert actual == EXPECTED_TOOL_NAMES, f"Tool names mismatch: {actual}"

check("TOOLS count", _check_tools_count)
check("TOOLS names", _check_tools_names)

# ---------------------------------------------------------------------------
# 4. Validate kb_schema.sql against in-memory SQLite
# ---------------------------------------------------------------------------

kb_schema_path = Path(__file__).parent / "kb_schema.sql"

def validate_kb_schema():
    sql = kb_schema_path.read_text()
    conn = sqlite3.connect(":memory:")
    conn.executescript(sql)
    # Verify all 5 tables exist
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = sorted(row[0] for row in cursor.fetchall())
    expected = sorted(["recipes", "pcsv_mappings", "products", "substitutions", "glossary"])
    assert tables == expected, f"Tables mismatch: {tables} != {expected}"
    conn.close()

check("kb_schema.sql executes", validate_kb_schema)

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

if errors:
    print(f"\n{'=' * 60}")
    print(f"VALIDATION FAILED — {len(errors)} error(s):")
    print('=' * 60)
    for e in errors:
        print(f"  {e}")
    sys.exit(1)
else:
    print("All contracts valid.")
    sys.exit(0)
