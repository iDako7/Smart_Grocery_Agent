"""Substitution lookup."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_substitutions() -> list[dict]:
    with open(DATA_DIR / "substitutions.json") as f:
        return json.load(f)


def get_substitutions(
    ingredient: str,
    reason: str | None = None,
) -> list[dict]:
    subs = _load_substitutions()
    query = ingredient.lower().strip()
    results = []

    for sub in subs:
        if query in sub["ingredient"].lower() or sub["ingredient"].lower() in query:
            entry = {
                "substitute": sub["substitute"],
                "match_quality": sub["match_quality"],
                "notes": sub.get("notes", ""),
            }
            if reason:
                entry["reason_match"] = sub.get("reason") == reason
            results.append(entry)

    # Sort reason-matched results first
    if reason:
        results.sort(key=lambda r: r["reason_match"], reverse=True)

    return results
