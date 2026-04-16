#!/usr/bin/env bash
# Shared helpers for commit-signal hooks.
# Sourced, not executed.

emit_additional_context() {
  local msg="$1"
  jq -cn --arg ctx "$msg" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
}

emit_system_message() {
  local msg="$1"
  jq -cn --arg msg "$msg" '{systemMessage: $msg}'
}

hooks_disabled() {
  [[ "${SGA_DISABLE_COMMIT_HOOKS:-0}" == "1" ]]
}
