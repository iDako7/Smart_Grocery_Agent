# Contract Changelog

Breaking changes to contract files require a PR to `main` and an entry here.
All worktrees must rebase after a breaking change merges.

## Format

YYYY-MM-DD | file | description

---

2026-04-12 | sse_events.py | sse_events: DoneEvent gains optional error_category (config|llm|validation|unknown). Additive, non-breaking. (#47)
