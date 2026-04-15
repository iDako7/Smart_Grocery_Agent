"""Unit tests for grocery grouping logic — pure function, no DB."""

from src.backend.api.grocery import group_items_by_store


def test_group_single_store():
    items = [
        {
            "ingredient_name": "chicken",
            "amount": "1 kg",
            "recipe_name": "Curry",
            "product": {
                "name": "Chicken Breast",
                "size": "2 kg",
                "department": "Meat",
                "store": "costco",
            },
        },
        {
            "ingredient_name": "rice",
            "amount": "2 cups",
            "recipe_name": "Curry",
            "product": {
                "name": "Jasmine Rice",
                "size": "5 kg",
                "department": "Grains",
                "store": "costco",
            },
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 1
    assert result[0].store_name == "costco"
    assert len(result[0].departments) == 2


def test_group_multiple_stores():
    items = [
        {
            "ingredient_name": "chicken",
            "amount": "1 kg",
            "recipe_name": "Curry",
            "product": {
                "name": "Chicken",
                "size": "2 kg",
                "department": "Meat",
                "store": "costco",
            },
        },
        {
            "ingredient_name": "bok choy",
            "amount": "1 bunch",
            "recipe_name": "Stir Fry",
            "product": {
                "name": "Bok Choy",
                "size": "",
                "department": "Produce",
                "store": "community_market",
            },
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 2
    store_names = {s.store_name for s in result}
    assert store_names == {"costco", "community_market"}


def test_group_unmatched_items_go_to_other():
    items = [
        {
            "ingredient_name": "gochujang",
            "amount": "3 tbsp",
            "recipe_name": "Korean BBQ",
            "product": None,
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 1
    assert result[0].store_name == "Other"
    assert result[0].departments[0].name == "Uncategorized"
    assert result[0].departments[0].items[0].name == "gochujang"


def test_group_empty_list():
    result = group_items_by_store([])
    assert result == []


def test_grocery_item_has_recipe_context():
    items = [
        {
            "ingredient_name": "pork belly",
            "amount": "500g",
            "recipe_name": "Korean BBQ Pork Belly",
            "product": {
                "name": "Pork Belly",
                "size": "1 kg",
                "department": "Meat",
                "store": "costco",
            },
        },
    ]
    result = group_items_by_store(items)
    item = result[0].departments[0].items[0]
    assert item.recipe_context == "for Korean BBQ Pork Belly"


def test_grocery_item_no_recipe_context_when_recipe_name_empty():
    items = [
        {
            "ingredient_name": "butter",
            "amount": "100g",
            "recipe_name": "",
            "product": {
                "name": "Unsalted Butter",
                "size": "454g",
                "department": "Dairy",
                "store": "costco",
            },
        },
    ]
    result = group_items_by_store(items)
    item = result[0].departments[0].items[0]
    assert item.recipe_context == ""


def test_other_store_comes_last():
    """When there are matched and unmatched items, 'Other' store should be last."""
    items = [
        {
            "ingredient_name": "gochujang",
            "amount": "3 tbsp",
            "recipe_name": "BBQ",
            "product": None,
        },
        {
            "ingredient_name": "chicken",
            "amount": "1 kg",
            "recipe_name": "BBQ",
            "product": {
                "name": "Chicken",
                "size": "2 kg",
                "department": "Meat",
                "store": "costco",
            },
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 2
    assert result[-1].store_name == "Other"


def test_item_ids_are_unique():
    """Each GroceryItem in a result should have a unique id."""
    items = [
        {
            "ingredient_name": "chicken",
            "amount": "1 kg",
            "recipe_name": "A",
            "product": {"name": "Chicken", "size": "", "department": "Meat", "store": "costco"},
        },
        {
            "ingredient_name": "rice",
            "amount": "2 cups",
            "recipe_name": "A",
            "product": {"name": "Rice", "size": "", "department": "Grains", "store": "costco"},
        },
        {
            "ingredient_name": "gochujang",
            "amount": "3 tbsp",
            "recipe_name": "B",
            "product": None,
        },
    ]
    result = group_items_by_store(items)
    all_ids = []
    for store in result:
        for dept in store.departments:
            for gi in dept.items:
                all_ids.append(gi.id)
    assert len(all_ids) == len(set(all_ids)), "GroceryItem ids must be unique"


def test_null_department_falls_back_to_general():
    """Products with department=None or '' should group under 'General'."""
    items = [
        {
            "ingredient_name": "salt",
            "amount": "1 tsp",
            "recipe_name": "Soup",
            "product": {
                "name": "Sea Salt",
                "size": "1 kg",
                "department": None,
                "store": "costco",
            },
        },
    ]
    result = group_items_by_store(items)
    assert result[0].departments[0].name == "General"


def test_items_grouped_within_same_store_and_department():
    """Two items from same store + department end up in the same department bucket."""
    items = [
        {
            "ingredient_name": "chicken",
            "amount": "1 kg",
            "recipe_name": "Soup",
            "product": {"name": "Chicken Thighs", "size": "", "department": "Meat", "store": "costco"},
        },
        {
            "ingredient_name": "pork",
            "amount": "500g",
            "recipe_name": "BBQ",
            "product": {"name": "Pork Ribs", "size": "", "department": "Meat", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 1
    assert len(result[0].departments) == 1
    assert result[0].departments[0].name == "Meat"
    assert len(result[0].departments[0].items) == 2


# ---------------------------------------------------------------------------
# Dedupe tests (issue #72 part C)
# ---------------------------------------------------------------------------


def test_duplicate_product_name_collapses_to_one_item():
    """Two ingredients that fuzzy-match to the same product.name in the same
    (store, department) bucket must be collapsed to a single GroceryItem."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Congee",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 1
    dept = result[0].departments[0]
    assert len(dept.items) == 1, "Same product.name in same bucket must collapse to one item"


def test_duplicate_product_recipe_context_is_merged():
    """Collapsed duplicate entries must have recipe_context from both sources,
    comma-separated and deduped, in original order."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Congee",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    item = result[0].departments[0].items[0]
    assert "Fried Rice" in item.recipe_context
    assert "Congee" in item.recipe_context


def test_duplicate_product_recipe_context_deduped():
    """When both entries have the same recipe_name, recipe_context must not repeat it."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    item = result[0].departments[0].items[0]
    # "for Fried Rice" should appear exactly once, not twice
    assert item.recipe_context.count("Fried Rice") == 1


def test_duplicate_product_case_insensitive_match():
    """Deduplication is case-insensitive: 'green onions' and 'Green Onions' collapse."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "green onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Congee",
            "product": {"name": "GREEN ONIONS", "size": "bunch", "department": "Produce", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    dept = result[0].departments[0]
    assert len(dept.items) == 1, "Case-insensitive match must collapse to one item"


def test_same_product_name_different_stores_do_not_collapse():
    """Products with the same name but different stores must remain separate."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Congee",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "community_market"},
        },
    ]
    result = group_items_by_store(items)
    assert len(result) == 2, "Different stores must not collapse"
    for store in result:
        assert len(store.departments[0].items) == 1


def test_same_product_name_different_departments_do_not_collapse():
    """Same product name in different departments of the same store must not collapse."""
    items = [
        {
            "ingredient_name": "salt",
            "amount": "1 tsp",
            "recipe_name": "Soup",
            "product": {"name": "Sea Salt", "size": "1 kg", "department": "Baking", "store": "costco"},
        },
        {
            "ingredient_name": "salt",
            "amount": "1 tsp",
            "recipe_name": "Stew",
            "product": {"name": "Sea Salt", "size": "1 kg", "department": "Condiments", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    assert len(result[0].departments) == 2, "Different departments must not collapse"


def test_three_duplicates_collapse_to_one():
    """Three entries with the same product.name in same bucket collapse to one item
    with all three recipe names merged."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Congee",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "spring onions",
            "amount": "2 stalks",
            "recipe_name": "Ramen",
            "product": {"name": "Green Onions", "size": "bunch", "department": "Produce", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    dept = result[0].departments[0]
    assert len(dept.items) == 1
    item = dept.items[0]
    assert "Fried Rice" in item.recipe_context
    assert "Congee" in item.recipe_context
    assert "Ramen" in item.recipe_context


def test_duplicate_collapsed_item_id_is_unique_across_full_result():
    """After deduplication, all remaining item ids are still unique."""
    items = [
        {
            "ingredient_name": "green onions",
            "amount": "1 bunch",
            "recipe_name": "Fried Rice",
            "product": {"name": "Green Onions", "size": "", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "scallions",
            "amount": "1 bunch",
            "recipe_name": "Congee",
            "product": {"name": "Green Onions", "size": "", "department": "Produce", "store": "costco"},
        },
        {
            "ingredient_name": "rice",
            "amount": "2 cups",
            "recipe_name": "Fried Rice",
            "product": {"name": "Jasmine Rice", "size": "5 kg", "department": "Grains", "store": "costco"},
        },
    ]
    result = group_items_by_store(items)
    all_ids = [gi.id for store in result for dept in store.departments for gi in dept.items]
    assert len(all_ids) == len(set(all_ids)), "All item ids must remain unique after dedup"
