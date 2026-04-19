# SGA V2 — 5-min Presentation Slide Outline

*Distributed-systems class. Each slide ~50s. Talking points in italics.*

---

## Slide 1 — System under test (≈40s)

**Smart Grocery Assistant V2 — a streaming LLM agent on Fly.io.**

```
React SPA ──SSE──> FastAPI ──tool-use loop──> Claude (Sonnet 4.6 via OpenRouter)
                       |
                       ├── SQLite (KB)
                       └── PostgreSQL (sessions/users)
```

- 7-tool agent, ~40-line orchestrator, max 10 iterations
- SSE streaming, prompt caching via OpenRouter
- Live at `https://sga-v2.fly.dev`

*Why interesting for distributed systems: a single user request triggers ~5–10 internal LLM round-trips, each ~500 ms; latency, throughput, and cost are all governed by the orchestrator.*

---

## Slide 2 — What we measured and how (≈50s)

| Property | Method | Cost |
|---|---|---|
| Latency vs. concurrency | Locust ramp 1, 5, 10, 20 users × 3 min | ~$3 |
| Steady-state distribution | Locust 5 users × 5 min | ~$1 |
| Cold start (Fly auto-suspend) | 6-min idle then probe | ~$0.10 |
| Quality + consistency | promptfoo, 9 cases × 2–3 runs | ~$2 |
| Cost & cache efficiency | per-call token accounting | (free, derived) |

Total budget: $10 → actual: **~$2** (well under).

---

## Slide 3 — Throughput / latency knee (≈55s)

![throughput_knee](charts/throughput_knee.png)

- 1 → 10 users: p50 stays at ~4.6s, RPS scales linearly (0.10 → 0.68)
- **20 users: p95 jumps to 31s, p99 to 90s, 14.9% failures** — knee passed
- Root cause: **Postgres connection pool exhaustion** (asyncpg default = 5+10 overflow)
- The system did not self-recover; required a `fly machine restart`

*Headline: the throughput bottleneck is **not the LLM**. It's the DB pool. A trivial config change (raise pool size or move sessions to Redis) likely doubles capacity.*

---

## Slide 4 — Steady-state SSE distribution + cache (≈45s)

![latency_cdf](charts/latency_cdf.png) ![cache_hit_over_time](charts/cache_hit_over_time.png)

- 5u × 5 min (119 chats, 0 % fail): p50 **4 500** ms, p95 **6 900** ms, p99 **8 200** ms
- Prompt cache ratio: **median 82 %, token-weighted 84 %** — system prompt served from OpenRouter cache, ~10× cheaper
- Cache breakpoint sits on `tool_instructions` block (last static); reorder kills caching

*Streaming makes perceived latency ≈ time-to-first-token, not time-to-done. Phase 2 only does collect-then-emit so this gap is tiny right now; Phase 3 progressive streaming will widen it.*

---

## Slide 5 — Quality, cold start, cost (≈45s)

![quality_variance](charts/quality_variance.png) ![cost_per_convo](charts/cost_per_convo.png)

- Quality (1–5 rubric × 9 cases × 2 nocache runs): **14 / 18 pass (78 %)**
- Best: A1 5.05, C1 4.66, E2 (code-switch) 4.50 — **mostly stable** (CV ≤ 13 % on 8/9)
- Worst: E3 4KB wall 0.50, C3 vague 2.0, D1 halal 2.33 — failure modes, not noise
- **Outlier: E1 Chinese-only swung 0.75 → 4.0 across runs (CV 97 %) — bilingual is the noisy surface**
- Cold start (Fly stop+resume): session-create **8.1 s**, TTFE 4.8 s, TTD 4.8 s
- Cost / conversation: mean **$0.0034**, median **$0.0031**, total quality-eval spend **$0.054**

---

## Slide 6 — What this teaches & next steps (≈45s)

**Three saturation regimes, in order of severity:**
1. ≤10u: LLM-bound, latency stable, RPS scales
2. ~15–18u: Postgres-pool-bound, latency p95 climbs
3. ≥20u: pool exhausted, machine doesn't self-heal — operational failure

**Next steps:**
- Increase pool size, add timeouts, autoscale before pool exhausts
- Phase 3: progressive SSE streaming → cuts perceived latency further
- Vector recipe search + Haiku/Sonnet routing → halves cost on simple queries
- Re-enable auth + rate-limit before any non-demo traffic

---

## Backup slide — Reproducibility

```bash
# Cold-start probe
loadtest/.venv/bin/python evals/presentation/scripts/cold_start_probe.py

# Locust + promptfoo (~40 min, ~$8)
bash evals/presentation/scripts/run_phase3.sh

# Charts
loadtest/.venv/bin/python evals/presentation/scripts/generate_charts.py

# Aggregated numbers
loadtest/.venv/bin/python evals/presentation/scripts/aggregate_stats.py
```

All artifacts in `evals/presentation/`.
