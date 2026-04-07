"""Tool definitions in OpenAI function-calling format (used by OpenRouter)."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "analyze_pcsv",
            "description": (
                "Categorize a list of ingredients by Protein, Carb, Veggie, and Sauce roles. "
                "Returns the status of each category (gap, low, ok) and which items belong to it. "
                "Call this FIRST to understand the user's nutritional balance before searching recipes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of ingredient names the user has or mentioned",
                    }
                },
                "required": ["ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_recipes",
            "description": (
                "Search the recipe knowledge base for recipes matching the given ingredients and constraints. "
                "Returns recipe summaries ranked by ingredient match score. "
                "Call this AFTER analyze_pcsv to find recipes that fill identified gaps."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ingredients the user has available",
                    },
                    "cuisine": {
                        "type": "string",
                        "description": "Filter by cuisine (e.g., Korean, Chinese, Italian). Optional.",
                    },
                    "cooking_method": {
                        "type": "string",
                        "description": "Filter by method (e.g., grill, stir-fry, bake). Optional.",
                    },
                    "max_time": {
                        "type": "integer",
                        "description": "Maximum cooking time in minutes. Optional.",
                    },
                    "serves": {
                        "type": "integer",
                        "description": "Number of servings needed. Optional, used for ranking.",
                    },
                },
                "required": ["ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_store_product",
            "description": (
                "Look up a grocery item in the Costco product database. "
                "Returns the product name, package size, and department. "
                "Use this to ground grocery suggestions in real store data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {
                        "type": "string",
                        "description": "The ingredient or product to look up (e.g., 'chicken thighs', 'soy sauce')",
                    },
                    "store": {
                        "type": "string",
                        "enum": ["costco", "community_market"],
                        "description": "Which store to search. Defaults to costco.",
                    },
                },
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_substitutions",
            "description": (
                "Find substitutes for an ingredient. Returns alternatives with match quality and notes. "
                "Use when the user can't find an ingredient or has dietary restrictions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient": {
                        "type": "string",
                        "description": "The ingredient to find substitutes for",
                    },
                    "reason": {
                        "type": "string",
                        "enum": ["unavailable", "dietary", "preference"],
                        "description": "Why a substitute is needed. Optional.",
                    },
                },
                "required": ["ingredient"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recipe_detail",
            "description": (
                "Get full cooking instructions for a recipe by its ID. "
                "Use this when the user wants to see how to cook a specific recipe."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "recipe_id": {
                        "type": "string",
                        "description": "The recipe ID (e.g., 'r001')",
                    }
                },
                "required": ["recipe_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_user_profile",
            "description": (
                "Update the user's profile with a learned preference or restriction. "
                "Call this when the user mentions a persistent fact like dietary restrictions, "
                "preferred cuisines, disliked ingredients, or household size."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {
                        "type": "string",
                        "enum": [
                            "household_size",
                            "dietary_restrictions",
                            "preferred_cuisines",
                            "disliked_ingredients",
                            "preferred_stores",
                            "notes",
                        ],
                        "description": "Which profile field to update",
                    },
                    "value": {
                        "description": "The new value. For list fields, provide the full updated list.",
                    },
                },
                "required": ["field", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "translate_term",
            "description": (
                "Translate grocery, ingredient, or cooking terms between English and Chinese. "
                "Use when the user speaks Chinese, when explaining unfamiliar ingredients, "
                "or when providing bilingual names for items not in the recipe KB."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "term": {
                        "type": "string",
                        "description": "The term to translate (English or Chinese)",
                    },
                    "direction": {
                        "type": "string",
                        "enum": ["en_to_zh", "zh_to_en", "auto"],
                        "description": "Translation direction. 'auto' detects based on input characters. Defaults to 'auto'.",
                    },
                },
                "required": ["term"],
            },
        },
    },
]
