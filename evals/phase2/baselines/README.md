# Baselines

Per-case medians of cost, tokens, latency, and cache-hit ratio — captured
before a change we expect to move the dial (e.g., prompt caching in Phase 3).
Compare the before/after pair to validate the change.

## Files

`<git-ref>-<YYYY-MM-DD>.json` — one capture. Schema:

```
{
  "git_ref": "main",
  "captured_at": "2026-04-17T...Z",
  "base_url": "http://localhost:8000",
  "runs_per_case": 3,
  "cases": {
    "A1": {
      "category": "dish_count",
      "turns": 1,
      "runs": [{...}, {...}, {...}],
      "median": {
        "total_tokens": 4532,
        "prompt_tokens": 3210,
        "completion_tokens": 1322,
        "cached_tokens": 0,
        "cost": 0.0231,
        "latency_ms": 3420,
        "cache_hit_ratio": 0.0
      },
      "model": "openai/gpt-5.4-mini-20260317",
      "errors": 0
    }
  },
  "aggregate": {
    "cases_counted": 11,
    "total_tokens": 49852,
    "total_cost_usd": 0.2531,
    "mean_latency_ms": 3120,
    "mean_cache_hit_ratio": 0.0
  }
}
```

## Capture

```bash
docker compose up              # backend must be running
cd evals/phase2
uv run python scripts/capture_baseline.py --runs 3
```

Output lands in `evals/phase2/baselines/<ref>-<date>.json`. The script uses
the current git branch as the filename prefix; override with `--tag`.

## Compare

There's no built-in diff tool — open two JSON files and diff
`aggregate.total_cost_usd` and per-case `median.cost` / `median.latency_ms`.
Typical Phase 3 comparison:

- `main-2026-04-17.json` — pre-caching
- `caching-2026-05-01.json` — post-caching

Expect `cached_tokens` and `cache_hit_ratio` to rise, `total_cost_usd` and
`mean_latency_ms` to fall after caching lands.

## Notes

- `cost` is OpenRouter's returned cost in USD — no local pricing table to
  maintain.
- Latency is wall clock (client-side), summed across all turns for
  multi-turn cases (e.g., D3).
- Medians are computed over successful runs only. `errors` counts failures.
- Not a merge gate — purely recording. If you want a gate, see
  `consistency_runner.py`.
