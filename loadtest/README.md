# Load test + post-deploy smoke — SGA V2 demo

Issue #134 · tracker #131 · target: `https://sga-v2.fly.dev`.

Three artifacts live here and in `scripts/`:

| Artifact | What it measures |
|---|---|
| `loadtest/locustfile.py` | Metrics 1–3 (Locust run, p95 time-to-first-event, p95 time-to-done) and an `SSE sse_prompt_cache_ratio_x1000` custom metric (see §Metric 4 — measures OpenRouter prompt-cache hits, not Redis). |
| `loadtest/run_promptfoo_deploy.sh` | Metric 8 (promptfoo suite ≥ 80% pass on the deployed URL). |
| `scripts/verify-chat-flow.py --base-url <url>` | Metric 7 (Journey 1 smoke green). |

Metrics 5, 6 (Fly CPU / memory) are read out-of-band via `fly metrics`.
Metric 9 (browser console clean on Journey 1) is a manual check.

Halt bar: first-run miss on any metric → stop, do not weaken thresholds.

---

## One-time setup — isolated locust venv

Locust is intentionally not in `src/backend/pyproject.toml` so the production
Docker image stays slim. Install it into a throwaway venv:

```bash
cd loadtest
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Step 1 — Enable dev-mode auth on the Fly app

The load test bypasses magic-link auth by setting `SGA_AUTH_MODE=dev`. This
disables per-user isolation and is acceptable **for the demo load window
only** — revert immediately after the run.

```bash
fly secrets set SGA_AUTH_MODE=dev --app sga-v2   # triggers a rolling restart
fly status --app sga-v2                          # wait for machines "started"
```

---

## Step 2 — Locust (metrics 1–4)

```bash
# Inside loadtest/.venv
locust -f loadtest/locustfile.py \
       --host https://sga-v2.fly.dev \
       --users 10 --spawn-rate 2 --run-time 5m \
       --headless --csv loadtest/report
```

Reading the report:

- **Metric 1 — zero 5xx**: `loadtest/report_stats.csv`, column `Failures/s` on
  `POST /session/{id}/chat` must be 0.
- **Metric 2 — p95 time-to-first-event < 2000 ms**: in the "Percentiles" block
  for `SSE sse_time_to_first_event`, look up the `95%` column.
- **Metric 3 — p95 time-to-done < 30000 ms**: same block, `SSE sse_time_to_done`,
  `95%` column.
- **Metric 4 — cache hit ratio > 0.5**: the locustfile emits a custom metric
  `SSE sse_prompt_cache_ratio_x1000` (ratio × 1000 so Locust's integer-ms
  percentile table can hold it; divide the `50%`/`95%` column by 1000 to get
  the real ratio). Cross-check on a sample via `fly logs --app sga-v2` during
  the run — the `done.token_usage` line shows raw `cached_tokens` +
  `prompt_tokens`. **Known miss**: Redis was deferred from the demo cut
  (Upstash free plan was retired in 2026; the Redis tool cache at
  `src/ai/cache/client.py` falls through when `REDIS_URL` is unset). That
  means metric 4's bar of > 0.5 is only achievable via OpenRouter prompt-cache
  hits today. If the run misses, log it against the halt bar — do not weaken
  the threshold.

In parallel with the run, in another shell:

```bash
fly metrics --app sga-v2   # metric 5 (CPU < 80%) + metric 6 (memory < 80%)
```

---

## Step 3 — Journey 1 smoke (metric 7)

`scripts/verify-chat-flow.py` already accepts `--base-url` (landed on main
with the Phase 3 deploy bundle). The script also does a direct Postgres
query for the bug-#98 regression check (Step 3), so a DB tunnel is required
when running against the Fly app:

```bash
# Shell A — fetch the actual DATABASE_URL from inside the app (not from
# `fly secrets list`, which only exposes digests). Copy the value it prints.
fly ssh console --app sga-v2 -C "env" | grep ^DATABASE_URL=

# Shell B — tunnel Fly Postgres to localhost:5432
fly proxy 5432 --app sga-v2-db

# Shell C — run the smoke. Rewrite the host in the URL you copied from
# Shell A to localhost:5432 (keep the user + password + dbname).
DATABASE_URL="postgres://sga_v2:<PASSWORD>@localhost:5432/sga_v2?sslmode=disable" \
  python scripts/verify-chat-flow.py --base-url https://sga-v2.fly.dev
```

Exit code 0 = metric 7 green. The script prints WARN for known `[EXPECTED
FAIL D1]` items; only UNEXPECTED FAILS cause exit 1. Close the proxy
(Ctrl-C on Shell B) as soon as the smoke finishes.

---

## Step 4 — promptfoo suite (metric 8)

```bash
bash loadtest/run_promptfoo_deploy.sh
```

This wraps `evals/phase2/promptfooconfig.yaml` with
`SGA_EVAL_BASE_URL=https://sga-v2.fly.dev`. The 5 trimmed cases must pass at
≥ 80% (4 / 5). The provider at `evals/phase2/provider.py` already honors
`SGA_EVAL_BASE_URL`.

---

## Step 5 — Browser console (metric 9, manual)

Open https://sga-v2.fly.dev/ in Chrome, open DevTools → Console, run the
Journey 1 happy path (home → clarify → recipes → grocery → save). The
console must stay clean: no red errors (yellow warnings OK).

---

## Step 6 — Revert auth mode (DO NOT SKIP)

As soon as you have the metrics, flip auth back. `SGA_AUTH_MODE=dev`
eliminates per-user isolation for every request, including any human
traffic that hits the URL while the setting is live. If the load run
crashes or is interrupted, jump straight to this step before anything
else — there is no automated revert.

```bash
fly secrets unset SGA_AUTH_MODE --app sga-v2   # reverts to prod mode
fly status --app sga-v2                        # wait for "started"

# Gate: the following must print NO line for SGA_AUTH_MODE
fly secrets list --app sga-v2 | grep SGA_AUTH_MODE || echo "auth reverted"

# Sanity: /session without a bearer token should now 401
curl -o /dev/null -s -w "%{http_code}\n" -X POST https://sga-v2.fly.dev/session
# expected: 401
```

Do not share the URL publicly until the revert is confirmed.

---

## When metrics miss

Do not retune the bar. File an issue tagged `perf` or `reliability`
describing which metric missed, by how much, and attach the locust CSVs
(`loadtest/report_*`). The halt bar exists to surface real regressions
before the URL goes public.
