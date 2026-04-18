#!/usr/bin/env bash
# PreToolUse hook: run local CI-style checks before a PR is created or updated.
# Gates both the GitHub MCP tools (tool_name contains create_pull_request /
# update_pull_request) and the gh CLI (tool_name == Bash, command matches
# `gh pr create` / `gh pr edit`). Non-PR Bash calls exit 0 immediately.
#
# Checks mirror .github/workflows/ci-{backend,frontend}.yml, minus slow/
# service-dependent steps (pytest, docker build, vite build, vitest).
# Exit 2 = blocking; stderr is surfaced to Claude and the user.

set -uo pipefail

# Read hook input (stdin JSON). Same sed pattern as merge_safety_check.sh to
# avoid a jq dependency.
input="$(cat)"
tool_name="$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
cmd="$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)"

# Early-exit for unrelated Bash calls. When the matcher is Bash, only fire on
# `gh pr create` / `gh pr edit`; every other Bash tool call passes through.
if [[ "$tool_name" == "Bash" ]]; then
  if ! printf '%s' "$cmd" | grep -qE '(^|[;&|`$(]| )gh[[:space:]]+pr[[:space:]]+(create|edit)([[:space:]]|$)'; then
    exit 0
  fi
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  exit 0
fi
cd "$repo_root"

# Change detection. Never network inside a hook: use whatever origin/main
# already resolves to locally; fall back to uncommitted-only if it doesn't.
base_ref=""
if git rev-parse --verify --quiet origin/main >/dev/null; then
  base_ref="origin/main"
fi

changed=""
if [[ -n "$base_ref" ]]; then
  changed+="$(git diff --name-only "$base_ref"...HEAD 2>/dev/null || true)"$'\n'
fi
changed+="$(git diff --name-only HEAD 2>/dev/null || true)"$'\n'
changed+="$(git ls-files --others --exclude-standard 2>/dev/null || true)"

match_path() {
  printf '%s\n' "$changed" | grep -qE "$1"
}

need_backend=0
need_frontend=0
if match_path '^(src/backend/|src/ai/|contracts/|tests/)' \
   || match_path '^(ruff\.toml|pytest\.ini)$'; then
  need_backend=1
fi
if match_path '^(src/frontend/|contracts/)'; then
  need_frontend=1
fi

# Check runner — captures combined output, keeps last 40 lines on failure.
failures=()
run_check() {
  local label="$1"; shift
  local out code
  out="$("$@" 2>&1)"
  code=$?
  if [[ $code -eq 0 ]]; then
    return 0
  fi
  failures+=("[$label] exit=$code
$(printf '%s\n' "$out" | tail -n 40)")
  return 1
}

if [[ $need_backend -eq 1 ]]; then
  if ! command -v uvx >/dev/null 2>&1; then
    failures+=("[backend] uvx not on PATH — install uv (astral-sh) or skip backend checks")
  else
    run_check "ruff check"          uvx ruff@0.11.6 check src/backend/ src/ai/ contracts/ tests/
    run_check "ruff format --check" uvx ruff@0.11.6 format --check src/backend/ src/ai/ contracts/ tests/
  fi
fi

if [[ $need_frontend -eq 1 ]]; then
  if ! command -v bun >/dev/null 2>&1; then
    failures+=("[frontend] bun not on PATH — install bun or skip frontend checks")
  else
    pushd src/frontend >/dev/null
    run_check "bun run lint" bun run lint
    run_check "tsc -b"       bunx tsc -b
    popd >/dev/null
  fi
fi

# Fallback: nothing backend/frontend matched — at least catch whitespace +
# merge-conflict markers on the diff.
if [[ $need_backend -eq 0 && $need_frontend -eq 0 ]]; then
  run_check "git diff --check" git diff --check
fi

if [[ ${#failures[@]} -eq 0 ]]; then
  exit 0
fi

{
  echo "[ci-before-pr] blocking: ${#failures[@]} check(s) failed before PR tool call."
  for f in "${failures[@]}"; do
    echo
    echo "--- $f"
  done
  echo
  echo "Fix locally, then retry the PR command. To bypass in an emergency, temporarily disable this hook via /hooks."
} >&2
exit 2
