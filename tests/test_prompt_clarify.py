"""Failing tests for Bug 2: emit_clarify_turn must appear in _TOOL_INSTRUCTIONS
and Rule #9 must contain a strong guard against free-text fallback on complex inputs.

Canonical substrings the implementer MUST produce
--------------------------------------------------
These are the exact strings asserted below.  The implementation MUST include
them verbatim so the tests pass after the fix.

  In _TOOL_INSTRUCTIONS (the module-level constant):
    - "8 tools"              (updated tool count)
    - "emit_clarify_turn"    (tool listed explicitly in the numbered playbook)

  In the built prompt for screen="clarify" (output of build_system_prompt):
    - "emit_clarify_turn"    (tool name present anywhere in prompt)
    - "EVEN IF"              (unconditional guard — e.g. "EVEN IF the input is long/complex")
    - "[]"                   (valid-empty-questions clause)
    - "Do NOT respond with free-text"   (explicit prohibition of markdown fallback)
"""

from src.ai.prompt import _TOOL_INSTRUCTIONS, build_system_prompt

from contracts.tool_schemas import UserProfile

# ---------------------------------------------------------------------------
# 1. _TOOL_INSTRUCTIONS lists emit_clarify_turn
# ---------------------------------------------------------------------------


def test_tool_instructions_lists_emit_clarify_turn():
    """_TOOL_INSTRUCTIONS must name emit_clarify_turn so the LLM sees it as a
    valid, required tool — not an unlisted side-effect."""
    assert "emit_clarify_turn" in _TOOL_INSTRUCTIONS, (
        "_TOOL_INSTRUCTIONS does not mention 'emit_clarify_turn'. "
        "Add it as tool #8 (or similar) so the LLM's numbered playbook includes it."
    )


# ---------------------------------------------------------------------------
# 2. Tool count updated to 8
# ---------------------------------------------------------------------------


def test_tool_instructions_tool_count_updated():
    """_TOOL_INSTRUCTIONS must say '8 tools' (not '7 tools') after adding
    emit_clarify_turn to the numbered list."""
    assert "8 tools" in _TOOL_INSTRUCTIONS, (
        "_TOOL_INSTRUCTIONS still says '7 tools'. Update the phrasing to '8 tools' after adding emit_clarify_turn."
    )


# ---------------------------------------------------------------------------
# 3. Built prompt for clarify screen: strong guard + valid-empty clause
# ---------------------------------------------------------------------------


def test_rule_9_forbids_freetext_on_complex_input():
    """On the Clarify screen the assembled prompt must contain:
    - 'EVEN IF'          — unconditional guard that survives complex inputs
    - 'emit_clarify_turn' — tool name visible in the final prompt
    - '[]'               — valid-empty-questions clause (questions=[] is legal)
    """
    prompt = build_system_prompt(UserProfile(), screen="clarify")

    assert "EVEN IF" in prompt, (
        "Rule #9 is missing the 'EVEN IF' guard. "
        "Add language like 'EVEN IF the input is long or complex, you MUST call "
        "emit_clarify_turn' so the rule is unconditional."
    )
    assert "emit_clarify_turn" in prompt, "Built clarify prompt does not mention 'emit_clarify_turn'."
    assert "[]" in prompt, (
        "Rule #9 is missing the valid-empty-questions clause. "
        "Add language clarifying that questions=[] is a valid call."
    )


# ---------------------------------------------------------------------------
# 4. Built prompt explicitly forbids free-text markdown response on Clarify
# ---------------------------------------------------------------------------


def test_rule_9_says_no_freetext_on_clarify():
    """The assembled prompt for screen='clarify' must contain the explicit
    prohibition substring 'Do NOT respond with free-text' so there is no
    ambiguity for the LLM."""
    prompt = build_system_prompt(UserProfile(), screen="clarify")

    assert "Do NOT respond with free-text" in prompt, (
        "Rule #9 is missing the explicit prohibition. "
        "Add 'Do NOT respond with free-text' (verbatim) to Rule #9 so the LLM "
        "cannot fall back to a markdown response on the Clarify screen."
    )
