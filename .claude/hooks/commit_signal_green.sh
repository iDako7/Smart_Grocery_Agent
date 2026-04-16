#!/usr/bin/env bash
# PostToolUse hook: fires when a test runner exits 0 in Bash.
# Outputs JSON additionalContext nudging Claude to ask the user about committing.
# Never runs git commit itself. Always exits 0 (fail-open).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/emit.sh
source "$SCRIPT_DIR/lib/emit.sh"

command -v jq >/dev/null 2>&1 || exit 0
hooks_disabled && exit 0

input="$(cat)"
[[ -z "$input" ]] && exit 0

tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null)
[[ "$tool_name" != "Bash" ]] && exit 0

command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
exit_code=$(echo "$input" | jq -r '.tool_response.exit_code // .tool_response.exitCode // empty' 2>/dev/null)

[[ -z "$command" ]] && exit 0
[[ "$exit_code" != "0" ]] && exit 0

# Exclusion list — bail if any of these appear as a whole word.
if echo "$command" | grep -Eqi '(^|[[:space:]])(install|add|remove|uninstall|--help|-h|grep|rg|cat|find|ls|which|echo)([[:space:]]|$)'; then
  exit 0
fi

# Test-runner detection (ERE, case-insensitive).
test_re='(^|[[:space:]/&;|()])(pytest|vitest|playwright[[:space:]]+test|bun[[:space:]]+(run[[:space:]]+)?test(:[a-z0-9:-]+)?|npm[[:space:]]+(run[[:space:]]+)?test|npx[[:space:]]+vitest|promptfoo[[:space:]]+eval)([[:space:]]|$)'

if echo "$command" | grep -Eqi "$test_re"; then
  msg="Tests just passed cleanly (\`$command\`). This is a natural commit point. If the current change is coherent, consider asking the user whether to stage and commit a checkpoint. Do NOT commit without explicit user approval."
  emit_additional_context "$msg"
fi

exit 0
