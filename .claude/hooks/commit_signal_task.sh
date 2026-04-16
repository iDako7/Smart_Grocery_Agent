#!/usr/bin/env bash
# PostToolUse hook: fires when a TodoWrite call marks any todo as completed.
# Diffs against a snapshot of the previous todo list.
# Outputs JSON systemMessage nudging Claude to ask the user about committing.
# Never runs git commit itself. Always exits 0 (fail-open).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/emit.sh
source "$SCRIPT_DIR/lib/emit.sh"

STATE_DIR="${SGA_HOOK_STATE_DIR:-$SCRIPT_DIR/../state}"
SNAPSHOT="$STATE_DIR/last-todos.json"

command -v jq >/dev/null 2>&1 || exit 0
hooks_disabled && exit 0

input="$(cat)"
[[ -z "$input" ]] && exit 0

tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null)
[[ "$tool_name" != "TodoWrite" ]] && exit 0

mkdir -p "$STATE_DIR"

# Extract current todos as [{content, status}, ...]. Tolerate either .todos at
# root of tool_input, or under .tool_input.todos.
current=$(echo "$input" | jq -c '.tool_input.todos // .tool_input.input.todos // []' 2>/dev/null)
[[ -z "$current" || "$current" == "null" ]] && current='[]'

# Prior snapshot (empty array if missing).
if [[ -f "$SNAPSHOT" ]]; then
  prior=$(cat "$SNAPSHOT")
else
  prior='[]'
fi
[[ -z "$prior" ]] && prior='[]'

# Items whose content appears completed in current but was NOT completed in prior.
# Match on .content as the stable key. An item is "newly completed" if either
# (a) it did not exist in prior, or (b) it existed with a non-completed status.
newly_completed=$(jq -cn \
  --argjson cur "$current" \
  --argjson prev "$prior" \
  '[ $cur[] | select(.status == "completed") as $c
     | ($prev | map(select(.content == $c.content))) as $match
     | if ($match | length) == 0 then $c
       elif ($match[0].status // "") != "completed" then $c
       else empty end
   ]' 2>/dev/null)

# Always refresh the snapshot so we do not re-fire for the same completion.
echo "$current" > "$SNAPSHOT.tmp" && mv "$SNAPSHOT.tmp" "$SNAPSHOT"

count=$(echo "$newly_completed" | jq 'length' 2>/dev/null)
[[ -z "$count" || "$count" == "0" ]] && exit 0

first_content=$(echo "$newly_completed" | jq -r '.[0].content' 2>/dev/null)

if [[ "$count" == "1" ]]; then
  msg="Task completed: \"$first_content\". Consider asking the user whether to commit this slice. Do NOT commit without explicit user approval."
else
  msg="$count tasks just completed (first: \"$first_content\"). Consider asking the user whether to commit these slices. Do NOT commit without explicit user approval."
fi

emit_system_message "$msg"
exit 0
