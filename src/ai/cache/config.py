"""Per-tool TTL configuration for the Redis tool cache (issue #121).

Per user direction, v1 uses a uniform 48-hour TTL for all cached KB tools.
Lives in one file so TTLs can be tuned without touching handler code.
"""

# 48 hours in seconds
_H48 = 48 * 60 * 60

TTL_SECONDS = {
    "analyze_pcsv": _H48,
    "search_recipes": _H48,
    "get_recipe_detail": _H48,
    "get_substitutions": _H48,
    "lookup_store_product": _H48,
    "translate_term": _H48,
}
