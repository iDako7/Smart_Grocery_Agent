"""Bilingual EN↔ZH glossary lookup for grocery, ingredient, and cooking terms."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_glossary() -> list[dict]:
    with open(DATA_DIR / "glossary.json") as f:
        return json.load(f)


def _contains_chinese(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def translate_term(term: str, direction: str = "auto") -> dict:
    """Translate a grocery, ingredient, or cooking term between English and Chinese.

    Args:
        term: The term to translate.
        direction: "en_to_zh", "zh_to_en", or "auto" (detect from input characters).

    Returns:
        A dict with keys: term, translation, category, notes, match_type.
    """
    glossary = _load_glossary()
    term = term.strip()

    # Resolve direction
    if direction == "auto":
        resolved_direction = "zh_to_en" if _contains_chinese(term) else "en_to_zh"
    else:
        resolved_direction = direction

    no_match = {
        "term": term,
        "translation": "",
        "category": "",
        "notes": "Term not found in glossary",
        "match_type": "none",
    }

    if resolved_direction == "en_to_zh":
        term_lower = term.lower()

        # Exact match (case-insensitive)
        for entry in glossary:
            if entry["en"].lower() == term_lower:
                return {
                    "term": entry["en"],
                    "translation": entry["zh"],
                    "category": entry["category"],
                    "notes": entry["notes"],
                    "match_type": "exact",
                }

        # Partial/substring match
        for entry in glossary:
            en_lower = entry["en"].lower()
            if term_lower in en_lower or en_lower in term_lower:
                return {
                    "term": entry["en"],
                    "translation": entry["zh"],
                    "category": entry["category"],
                    "notes": entry["notes"],
                    "match_type": "partial",
                }

        return no_match

    else:  # zh_to_en
        # Exact match
        for entry in glossary:
            if entry["zh"] == term:
                return {
                    "term": entry["zh"],
                    "translation": entry["en"],
                    "category": entry["category"],
                    "notes": entry["notes"],
                    "match_type": "exact",
                }

        # Partial/substring match
        for entry in glossary:
            if term in entry["zh"] or entry["zh"] in term:
                return {
                    "term": entry["zh"],
                    "translation": entry["en"],
                    "category": entry["category"],
                    "notes": entry["notes"],
                    "match_type": "partial",
                }

        return no_match
