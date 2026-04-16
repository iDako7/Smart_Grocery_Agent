#!/usr/bin/env bash
# Test driver for commit-signal hooks.
# Feeds inline stdin fixtures and asserts expected output.
# Exits 0 on success, 1 on any failure.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN="$SCRIPT_DIR/commit_signal_green.sh"
TASK="$SCRIPT_DIR/commit_signal_task.sh"

# Use a throwaway state dir so we do not clobber real state.
export SGA_HOOK_STATE_DIR="$(mktemp -d -t sga-hook-test.XXXXXX)"
trap 'rm -rf "$SGA_HOOK_STATE_DIR"' EXIT

pass=0
fail=0

assert_empty() {
  local label="$1" out="$2"
  if [[ -z "$out" ]]; then
    echo "  PASS: $label"
    pass=$((pass+1))
  else
    echo "  FAIL: $label -- expected empty output, got: $out"
    fail=$((fail+1))
  fi
}

assert_contains() {
  local label="$1" out="$2" needle="$3"
  if echo "$out" | grep -q "$needle"; then
    echo "  PASS: $label"
    pass=$((pass+1))
  else
    echo "  FAIL: $label -- expected output containing '$needle', got: $out"
    fail=$((fail+1))
  fi
}

echo "== green-state hook =="

# 1. pytest passes → should emit
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"uv run pytest"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_contains "pytest exit 0 emits additionalContext" "$out" "additionalContext"
assert_contains "pytest exit 0 mentions commit point" "$out" "commit point"
assert_contains "pytest exit 0 includes do-not-commit warning" "$out" "explicit user approval"

# 2. pytest fails → no output
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"uv run pytest"},"tool_response":{"exit_code":1}}' | "$GREEN")
assert_empty "pytest exit 1 emits nothing" "$out"

# 3. bun test passes → should emit
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"cd src/frontend && bun test"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_contains "bun test exit 0 emits" "$out" "additionalContext"

# 4. vitest passes → should emit
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"npx vitest"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_contains "npx vitest exit 0 emits" "$out" "additionalContext"

# 5. playwright test passes → should emit
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"playwright test --headed"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_contains "playwright test exit 0 emits" "$out" "additionalContext"

# 6. promptfoo eval passes → should emit
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"uv run promptfoo eval -c foo.yaml"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_contains "promptfoo eval exit 0 emits" "$out" "additionalContext"

# 7. pip install pytest-asyncio → exclusion, no output
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"pip install pytest-asyncio"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_empty "pip install pytest-asyncio is excluded" "$out"

# 8. rg pytest → exclusion, no output
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"rg pytest src/"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_empty "rg pytest is excluded" "$out"

# 9. ls (no test) → no output
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_empty "ls emits nothing" "$out"

# 10. non-Bash tool → no output
out=$(echo '{"tool_name":"Read","tool_input":{"file_path":"foo.py"},"tool_response":{}}' | "$GREEN")
assert_empty "non-Bash tool emits nothing" "$out"

# 11. kill-switch disables hook
out=$(SGA_DISABLE_COMMIT_HOOKS=1 bash -c "echo '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"uv run pytest\"},\"tool_response\":{\"exit_code\":0}}' | '$GREEN'")
assert_empty "kill-switch env var disables green-state hook" "$out"

# 12. bun run test:coverage passes → should emit
out=$(echo '{"tool_name":"Bash","tool_input":{"command":"bun run test:coverage"},"tool_response":{"exit_code":0}}' | "$GREEN")
assert_contains "bun run test:coverage exit 0 emits" "$out" "additionalContext"

echo ""
echo "== task-boundary hook =="

# Reset snapshot for each test scenario by using fresh state dirs.
fresh_state() {
  export SGA_HOOK_STATE_DIR="$(mktemp -d -t sga-hook-test.XXXXXX)"
}

# 1. First call, one completed item (no prior snapshot) → emits systemMessage
fresh_state
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[{"content":"Write green hook","status":"completed"},{"content":"Write task hook","status":"in_progress"}]},"tool_response":{}}' | "$TASK")
assert_contains "fresh snapshot, one completed emits systemMessage" "$out" "systemMessage"
assert_contains "mentions the completed task content" "$out" "Write green hook"
assert_contains "includes do-not-commit warning" "$out" "explicit user approval"

# 2. Second call to same state dir, same todos → no newly completed → no output
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[{"content":"Write green hook","status":"completed"},{"content":"Write task hook","status":"in_progress"}]},"tool_response":{}}' | "$TASK")
assert_empty "same todos second call emits nothing" "$out"

# 3. Transition in_progress → completed → emits
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[{"content":"Write green hook","status":"completed"},{"content":"Write task hook","status":"completed"}]},"tool_response":{}}' | "$TASK")
assert_contains "transition to completed emits systemMessage" "$out" "Write task hook"

# 4. Third call unchanged → no output (snapshot should prevent re-fire)
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[{"content":"Write green hook","status":"completed"},{"content":"Write task hook","status":"completed"}]},"tool_response":{}}' | "$TASK")
assert_empty "unchanged third call emits nothing" "$out"

# 5. Two newly completed in one call → emits with plural wording
fresh_state
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[{"content":"Task A","status":"pending"}]},"tool_response":{}}' | "$TASK")
assert_empty "seed snapshot with one pending todo" "$out"
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[{"content":"Task A","status":"completed"},{"content":"Task B","status":"completed"}]},"tool_response":{}}' | "$TASK")
assert_contains "two newly completed emits plural count" "$out" "2 tasks just completed"

# 6. Non-TodoWrite tool → no output
fresh_state
out=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"foo.py"},"tool_response":{}}' | "$TASK")
assert_empty "non-TodoWrite tool emits nothing" "$out"

# 7. Empty todo list → no output
fresh_state
out=$(echo '{"tool_name":"TodoWrite","tool_input":{"todos":[]},"tool_response":{}}' | "$TASK")
assert_empty "empty todos list emits nothing" "$out"

# 8. Kill-switch disables task hook
fresh_state
out=$(SGA_DISABLE_COMMIT_HOOKS=1 SGA_HOOK_STATE_DIR="$SGA_HOOK_STATE_DIR" bash -c "echo '{\"tool_name\":\"TodoWrite\",\"tool_input\":{\"todos\":[{\"content\":\"X\",\"status\":\"completed\"}]},\"tool_response\":{}}' | '$TASK'")
assert_empty "kill-switch env var disables task hook" "$out"

echo ""
echo "== summary =="
echo "PASS: $pass"
echo "FAIL: $fail"
[[ "$fail" -eq 0 ]] && exit 0 || exit 1
