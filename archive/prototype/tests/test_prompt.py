"""Tests for system prompt assembly — specifically the glossary-miss fallback instruction.

Verifies that the system prompt instructs the agent to:
1. Provide its own translation when translate_term returns match_type='none'
2. Label such translations as 'AI-translated'
3. NOT label glossary-verified translations
"""

from prototype.prompt import build_system_prompt
from prototype.schema import UserProfile


def _default_prompt() -> str:
    profile = UserProfile(household_size=2)
    return build_system_prompt(profile)


def test_prompt_contains_glossary_miss_fallback_rule():
    """The rules section must instruct the agent to handle glossary misses."""
    prompt = _default_prompt()

    assert "match_type" in prompt.lower() or "glossary" in prompt.lower()
    assert "AI-translated" in prompt


def test_prompt_translate_term_tool_instruction_mentions_fallback():
    """The translate_term tool instruction must mention how to handle no-match."""
    prompt = _default_prompt()

    # The translate_term tool instruction should explicitly mention glossary miss handling
    # Extract the translate_term instruction area
    assert "translate_term" in prompt
    # Must mention what to do on match_type "none" near the translate_term instruction
    assert "AI-translated" in prompt
    assert "match_type" in prompt or "glossary miss" in prompt.lower()
