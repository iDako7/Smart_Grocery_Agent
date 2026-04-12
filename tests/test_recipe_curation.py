"""Tests for Phase 1a: Validate curated recipe fields in data/recipes.json."""

import json
import unittest
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RECIPES_PATH = DATA_DIR / "recipes.json"

EXPECTED_KEYS = {
    "id",
    "name",
    "name_zh",
    "source",
    "source_url",
    "cuisine",
    "cooking_method",
    "time_minutes",
    "effort_level",
    "flavor_tags",
    "serves",
    "ingredients",
    "instructions",
    "is_ai_generated",
}


class TestRecipeCuration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RECIPES_PATH) as f:
            cls.recipes = json.load(f)

    def test_recipe_count(self):
        self.assertEqual(len(self.recipes), 120)

    def test_every_recipe_has_effort_level(self):
        for r in self.recipes:
            self.assertIn("effort_level", r, f"{r['id']} missing effort_level")
            self.assertIsInstance(r["effort_level"], str)

    def test_effort_level_values_valid(self):
        valid = {"quick", "medium", "long"}
        for r in self.recipes:
            self.assertIn(r["effort_level"], valid, f"{r['id']} has invalid effort_level: {r['effort_level']}")

    def test_effort_level_matches_time_minutes(self):
        for r in self.recipes:
            t = r["time_minutes"]
            expected = "quick" if t <= 15 else ("medium" if t <= 45 else "long")
            self.assertEqual(
                r["effort_level"],
                expected,
                f"{r['id']} time_minutes={t} should be {expected}, got {r['effort_level']}",
            )

    def test_every_recipe_has_flavor_tags(self):
        for r in self.recipes:
            self.assertIn("flavor_tags", r, f"{r['id']} missing flavor_tags")
            self.assertIsInstance(r["flavor_tags"], list, f"{r['id']} flavor_tags not a list")
            self.assertGreater(len(r["flavor_tags"]), 0, f"{r['id']} flavor_tags is empty")

    def test_flavor_tags_are_strings(self):
        for r in self.recipes:
            for tag in r["flavor_tags"]:
                self.assertIsInstance(tag, str, f"{r['id']} has non-string flavor_tag: {tag}")

    def test_no_unexpected_fields(self):
        for r in self.recipes:
            self.assertEqual(
                set(r.keys()), EXPECTED_KEYS, f"{r['id']} has unexpected keys: {set(r.keys()) - EXPECTED_KEYS}"
            )

    def test_existing_fields_intact(self):
        by_id = {r["id"]: r for r in self.recipes}
        self.assertEqual(by_id["r001"]["name"], "Korean BBQ Pork Belly")
        self.assertEqual(by_id["r015"]["cuisine"], "Italian")
        self.assertEqual(by_id["r008"]["time_minutes"], 60)

    def test_all_ids_present(self):
        ids = {r["id"] for r in self.recipes}
        expected_ids = {f"r{i:03d}" for i in range(1, 121)}
        self.assertEqual(ids, expected_ids)


if __name__ == "__main__":
    unittest.main()
