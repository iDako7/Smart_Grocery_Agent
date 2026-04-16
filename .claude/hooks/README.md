# Commit-signal hooks

PostToolUse hooks that nudge Claude to ask the user about committing at natural checkpoints. **They never run `git commit` themselves** — they only inject guidance into Claude's next turn via `additionalContext` or `systemMessage`. The CLAUDE.md rule "NEVER commit unless explicitly asked" is absolute.

## What fires when

| Hook | Trigger | Output |
|---|---|---|
| `commit_signal_green.sh` | `Bash` tool call whose command matches a test runner (pytest, vitest, bun test, playwright, promptfoo eval) AND exits 0 | `hookSpecificOutput.additionalContext` — visible to Claude next turn |
| `commit_signal_task.sh` | `TodoWrite` tool call where at least one todo transitions to `completed` (diffed against `state/last-todos.json`) | `systemMessage` — lighter-touch nudge |

Both hooks are registered in `.claude/settings.local.json` under `hooks.PostToolUse`.

## Kill switch

Set `SGA_DISABLE_COMMIT_HOOKS=1` in the environment to silence both hooks without editing JSON.

## State

`.claude/state/last-todos.json` is the only persistent state (task-boundary snapshot). The whole `.claude/state/` directory is gitignored.

## Testing

`./test.sh` runs 25 stdin-fixture tests covering test-runner detection, exclusions, exit-code gating, tool-name filtering, todo-diff logic, re-fire prevention, plural wording, and the kill switch. Uses a throwaway state dir so real state is not touched.

## Design notes

- **Signal, don't act.** Hooks emit JSON on stdout; Claude reads it and decides what to do. Scripts never shell out to `git`.
- **Fail open.** Missing `jq`, missing stdin, or any error → exit 0 silently. A broken hook must never break the tool call.
- **Word-boundary regex.** Test-runner detection uses ERE with explicit word boundaries and an exclusion list (`install`, `grep`, `rg`, `cat`, etc.) to avoid false positives like `pip install pytest-asyncio`.
- **Snapshot-based todo diff.** Hooks are stateless, so task-boundary persists `last-todos.json` between calls and diffs on `content` as the stable key.
