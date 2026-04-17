#!/usr/bin/env bash
# PreToolUse hook: warn before destructive git operations that can drop files.
# Triggers on: git merge, git worktree remove, git branch -D/-d, git clean, git reset --hard.
# Exits 2 (blocking) with a message so Claude must surface it to the user before retrying.

set -euo pipefail

# Escape hatch: user has already seen the state and explicitly approved the op.
# Set in the command itself: SGA_SKIP_MERGE_SAFETY=1 git worktree remove ...
if [[ "${SGA_SKIP_MERGE_SAFETY:-0}" == "1" ]]; then
  exit 0
fi

# Hook input arrives on stdin as JSON: { "tool_name": "...", "tool_input": { "command": "..." } }
input="$(cat)"

# Also allow bypass via an inline env-var prefix in the command itself.
if printf '%s' "$input" | grep -qE 'SGA_SKIP_MERGE_SAFETY=1'; then
  exit 0
fi

# Extract the bash command (best-effort, no jq required).
cmd="$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)"

if [[ -z "$cmd" ]]; then
  exit 0
fi

# Match risky git operations.
# Use grep -E with word boundaries to avoid false positives on command substrings
# that appear inside quoted args (e.g. "restore" mentioned in a PR body).
is_risky=0
if printf '%s' "$cmd" | grep -qE '(^|[;&|`$(]| )git[[:space:]]+(merge([[:space:]]|$)|worktree[[:space:]]+remove|branch[[:space:]]+-[dD]([[:space:]]|$)|clean([[:space:]]|$)|reset[[:space:]]+--hard|checkout[[:space:]]+--([[:space:]]|$)|restore[[:space:]]+\.([[:space:]]|$))'; then
  is_risky=1
fi

if [[ $is_risky -eq 0 ]]; then
  exit 0
fi

# Collect what could be lost.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$repo_root" ]]; then
  exit 0
fi

cd "$repo_root"

untracked="$(git ls-files --others --exclude-standard 2>/dev/null || true)"
modified="$(git diff --name-only 2>/dev/null || true)"

warn_msg=""
if [[ -n "$untracked" ]]; then
  warn_msg+=$'\nUntracked files that could be lost:\n'"$untracked"
fi
if [[ -n "$modified" ]]; then
  warn_msg+=$'\nModified (unstaged) files:\n'"$modified"
fi

# Also check for stale worktrees whose branches have unmerged commits vs main.
worktrees="$(git worktree list --porcelain 2>/dev/null | awk '/^worktree/{p=$2} /^branch/{b=$2; print p"\t"b}' || true)"
if [[ -n "$worktrees" ]]; then
  stale=""
  while IFS=$'\t' read -r wt branch; do
    [[ -z "$wt" || "$wt" == "$repo_root" ]] && continue
    branch_short="${branch#refs/heads/}"
    # Commits on the branch not in main
    unmerged="$(git log --oneline "main..$branch_short" 2>/dev/null | head -5 || true)"
    if [[ -n "$unmerged" ]]; then
      stale+=$'\n  '"$wt"' ('"$branch_short"'): '"$(echo "$unmerged" | wc -l | tr -d ' ')"' unmerged commits'
    fi
  done <<< "$worktrees"
  if [[ -n "$stale" ]]; then
    warn_msg+=$'\nWorktrees with unmerged commits vs main:'"$stale"
  fi
fi

if [[ -z "$warn_msg" ]]; then
  exit 0
fi

# Exit 2 = blocking error; stderr is shown to Claude.
cat >&2 <<EOF
[merge-safety] About to run a destructive git operation:
  $cmd

The following may be lost or left behind:$warn_msg

Pause and surface this to the user before proceeding. If the user has already
confirmed, they can re-run the command and this check will re-fire — ask them
to explicitly approve dropping these files, or cherry-pick/stash them first.
EOF
exit 2
