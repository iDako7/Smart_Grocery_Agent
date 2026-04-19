# Infra Comparison Eval — Fly.io vs AWS

## Purpose

This suite compares SGA V2 deployed on Fly.io (sjc region) against SGA V2 deployed on AWS (Fargate + CloudFront, us-west-2), with the LLM held constant: both platforms use `openai/gpt-5.4-mini` via OpenRouter. The goal is to isolate infrastructure performance and cost differences from model quality differences, so that any observed latency or TTFB gaps can be attributed to the edge, compute, and DB layers rather than the model.

## Topology (at a glance)

| Dimension     | Fly.io                                 | AWS                                          |
|---------------|----------------------------------------|----------------------------------------------|
| Edge          | Fly Anycast (TLS at nearest PoP)       | CloudFront PriceClass_100 (CachingDisabled)  |
| Compute       | Fly Machine, shared-cpu-1x, 1 GB, amd64 | ECS Fargate, 0.5 vCPU, 1 GB, ARM64 Graviton |
| DB            | Fly Postgres (sjc)                     | RDS PostgreSQL 16.13, db.t4g.micro (us-west-2) |
| Region        | sjc (San Jose, CA)                     | us-west-2 (Oregon)                           |
| Auth mode     | prod                                   | dev (SGA_AUTH_MODE unset; defaults to dev)   |
| Cold start    | ~8 s after idle (auto_stop=true)       | None (desired_count=1, always warm)          |

Full topology details: `data/preflight.json`.

## Test bundle

| Test | What it measures |
|------|-----------------|
| **A** | Pure infra latency: `GET /health` (no DB) and `POST /session` (Postgres write) — serial and concurrent phases, no LLM. |
| **B** | Edge TTFB: root HTML and largest hashed JS chunk served by CloudFront vs Fly Anycast. |
| **D** | End-to-end agent latency with LLM held constant: 8 lookup-heavy cases targeting `translate_term`, `analyze_pcsv`, `get_substitutions`, `lookup_store_product`. Run twice per platform for stability. |
| **H** | Monthly infra cost model: Fly flat rate vs AWS itemised (Fargate, RDS, ALB, CloudFront, ECR, CloudWatch). Pure calculation from public list prices; requires `data/billing_inputs.json`. |

## Why Test C (cold start) was dropped

AWS runs with `desired_count=1`, which means the Fargate task is always warm — there is no cold-start event to measure. Fly's cold-start behaviour (auto_stop_machines=true, ~8 s first-request wake time) is already documented in `evals/presentation/REPORT.md`. The trade-off — Fly costs $0 when idle and pays an 8 s wake penalty vs AWS that costs approximately $5–10/month idle and wakes in 0 ms — is a deliberate design choice between the two platforms, not a controlled experiment. Adding a Test C measurement would require either artificially stopping the Fly machine (non-representative) or measuring only one side, so the test was dropped from the bundle and the trade-off is documented here instead.

## Why Test E (throughput knee) is not in the default bundle

Both Fly and AWS use SQLAlchemy defaults for their connection pool (`pool_size=5`, `max_overflow=10`) and are configured identically per `data/preflight.json`. The presentation eval already demonstrated that Fly reaches its throughput knee at around 10–20 concurrent users due to pool exhaustion. Running 20 users against AWS would risk wedging RDS in the same way for the same reason, making the comparison meaningless and leaving the AWS service degraded. If you want to run Test E, use `locust` capped at 10 users and monitor `POST /session/{id}/chat` for pool-wait errors on both sides.

## Quickstart

```bash
export SGA_FLY_URL=https://sga-v2.fly.dev
export SGA_AWS_URL=https://d33hdkvctxckhb.cloudfront.net
export OPENROUTER_API_KEY=...   # required for Test D (promptfoo eval)
chmod +x evals/infra_comparison/scripts/run_all.sh
bash evals/infra_comparison/scripts/run_all.sh
```

The script runs all steps in order, logs a banner for each step, and continues on individual step failures so aggregation always runs on whatever data was collected.

## File layout

```
evals/infra_comparison/
├── README.md                       # this file
├── lookup_cases.yaml               # Test D: 8 lookup-heavy cases (L1–L8)
├── promptfooconfig.yaml            # Test D: promptfoo config referencing phase2/provider.py
├── data/
│   ├── preflight.json              # resolved topology (URLs, compute, DB, divergences)
│   ├── billing_inputs.json         # (created by test_h_cost.py if absent; fill in manually)
│   ├── test_a_fly.json             # Test A raw results — Fly
│   ├── test_a_aws.json             # Test A raw results — AWS
│   ├── test_b_fly.json             # Test B raw results — Fly
│   ├── test_b_aws.json             # Test B raw results — AWS
│   ├── test_d_fly_run1.json        # Test D promptfoo output — Fly run 1
│   ├── test_d_fly_run2.json        # Test D promptfoo output — Fly run 2
│   ├── test_d_aws_run1.json        # Test D promptfoo output — AWS run 1
│   ├── test_d_aws_run2.json        # Test D promptfoo output — AWS run 2
│   ├── test_h_cost.json            # Test H cost model output
│   └── stats.json                  # aggregated stats (produced by aggregate_stats.py)
├── charts/
│   ├── latency_microbench.png      # Test A grouped bar chart
│   ├── ttfb_comparison.png         # Test B TTFB grouped bar chart
│   ├── lookup_latency_boxplot.png  # Test D per-case latency bar chart
│   └── cost_per_1000.png           # Test H stacked cost bar chart
└── scripts/
    ├── run_all.sh                  # orchestrator (this is the main entry point)
    ├── test_a_microbench.py        # Test A runner
    ├── test_b_ttfb.py              # Test B runner
    ├── test_h_cost.py              # Test H cost model calculator
    ├── aggregate_stats.py          # reads data/test_*.json → data/stats.json
    └── generate_charts.py          # reads data/stats.json → charts/*.png
```

## Reproducing individual tests

```bash
# Test A — microbench (no LLM, ~5 min)
python evals/infra_comparison/scripts/test_a_microbench.py --target both

# Test B — TTFB (~2 min)
python evals/infra_comparison/scripts/test_b_ttfb.py --target both

# Test D — Fly, run 1 (requires OPENROUTER_API_KEY, ~10 min)
SGA_EVAL_RESET_PROFILE=0 SGA_EVAL_BASE_URL=https://sga-v2.fly.dev \
  npx promptfoo eval --no-cache \
  -c evals/infra_comparison/promptfooconfig.yaml \
  --output evals/infra_comparison/data/test_d_fly_run1.json

# Test D — AWS, run 1
SGA_EVAL_RESET_PROFILE=0 SGA_EVAL_BASE_URL=https://d33hdkvctxckhb.cloudfront.net \
  npx promptfoo eval --no-cache \
  -c evals/infra_comparison/promptfooconfig.yaml \
  --output evals/infra_comparison/data/test_d_aws_run1.json

# Test H — cost model (fill in data/billing_inputs.json first)
python evals/infra_comparison/scripts/test_h_cost.py

# Aggregate + chart (after any subset of tests have produced data files)
python evals/infra_comparison/scripts/aggregate_stats.py
python evals/infra_comparison/scripts/generate_charts.py
```

## Known caveats

- **Auth mode divergence.** Fly runs `SGA_AUTH_MODE=prod`; AWS defaults to `dev`. The `/internal/reset-dev-profile` endpoint is not mounted in prod mode. `SGA_EVAL_RESET_PROFILE=0` must be set for Test D on Fly so the eval runner does not attempt the reset call before each case. Profile state does not affect latency measurement.
- **First Fly probe may be cold.** If the Fly machine has been idle, the first request triggers a ~8 s machine wake. `run_all.sh` sends 3 warmup `/health` calls before Test A begins; if you run individual tests, send a manual warmup request first.
- **Measurement client location.** All measurements were taken from a laptop on a residential ISP in Vancouver, BC. Both Fly (sjc) and AWS (us-west-2 / Oregon) are on the US west coast, but AWS Oregon is geographically closer to YVR (~1,200 km) than Fly sjc (~1,300 km). This asymmetry is minor but may account for a few ms of the observed TTFB difference; it does not fully explain the ~3.5× gap seen in baseline probes.
- **CPU architecture divergence.** Fly runs amd64; AWS runs ARM64 Graviton (chosen in PR #147 because the Tailwind v4 oxide amd64 binary produced broken CSS). ARM64 Fargate has the same Fargate list price as amd64, but compute performance characteristics differ and may partly explain any CPU-bound latency differences.
- **LLM cost excluded from Test H.** OpenRouter charges are identical on both platforms (same model, same usage). The cost model covers infra-only charges.
