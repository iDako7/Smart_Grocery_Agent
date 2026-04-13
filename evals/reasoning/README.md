# Reasoning Evals — Phase 1 Historical Baseline

**⚠️ STALE BASELINE — READ BEFORE RUNNING**

This eval suite runs against `archive/prototype/` (the Phase 1 agent), not
`src/ai/` (the Phase 2 production agent). Results represent Phase 1 behavior
and are useful as a frozen historical reference, NOT as a regression signal
against the current production agent.

See `provider.py` for the full systematic-review notice and the conditions
under which these results can be trusted.

## Run command

From the repo root:

```bash
cd archive/prototype && uv run promptfoo eval -c ../../evals/reasoning/promptfooconfig.yaml
```

The `cd archive/prototype` is required because `archive/prototype/` has its
own `pyproject.toml` with the uv deps for promptfoo. The config path uses
`../../` to reach back to `evals/reasoning/` from `archive/prototype/`.

## Rewriting against src/ai/

See PR #0's diff and the header in `provider.py`. Rewriting is a multi-hour
task that requires new DB fixtures, an updated `run_agent` signature, and
re-verification of all 14 test YAML files. Not in scope for PR 0.
