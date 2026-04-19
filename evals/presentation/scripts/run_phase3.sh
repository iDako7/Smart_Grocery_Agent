#!/usr/bin/env bash
# Run all Phase 3 measurements EXCEPT the cold-start probe (run that first, separately).
# Sequential by design: parallel runs would distort each other's latency numbers.
# Run from worktree root: `bash evals/presentation/scripts/run_phase3.sh`

set -euo pipefail

HOST="https://sga-v2.fly.dev"
DATA="evals/presentation/data"
LOCUST="loadtest/.venv/bin/locust"

# OPENROUTER_API_KEY needs to be in env for promptfoo's grader.
if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "OPENROUTER_API_KEY not set — sourcing from .env"
    set -a; source ../SGA_V2/.env 2>/dev/null || source ./.env; set +a
fi

mkdir -p "$DATA"
log() { echo "[$(date +%H:%M:%S)] $*"; }

# ---- Locust ramp (1, 5, 10, 20 users × 3 min) ----------------------------
for n in 1 5 10 20; do
    rate=$(( n < 2 ? 1 : 2 ))
    log "ramp $n users / 3min (spawn-rate $rate)"
    "$LOCUST" -f loadtest/locustfile.py --host "$HOST" \
        --users "$n" --spawn-rate "$rate" --run-time 3m \
        --headless --csv "$DATA/locust_ramp_${n}u" \
        --only-summary 2>&1 | tail -40
done

# ---- Locust steady-state (10 users × 5 min) ------------------------------
log "steady 10 users / 5min"
"$LOCUST" -f loadtest/locustfile.py --host "$HOST" \
    --users 10 --spawn-rate 2 --run-time 5m \
    --headless --csv "$DATA/locust_steady" \
    --only-summary 2>&1 | tail -40

# ---- Promptfoo phase2 × 3 runs -------------------------------------------
export SGA_EVAL_BASE_URL="$HOST"
for i in 1 2 3; do
    log "promptfoo phase2 run $i/3"
    npx promptfoo eval -c evals/phase2/promptfooconfig.yaml \
        --output "$DATA/promptfoo_phase2_run${i}.json" 2>&1 | tail -20
done

# ---- Promptfoo expansion × 2 runs ----------------------------------------
for i in 1 2; do
    log "promptfoo expansion run $i/2"
    npx promptfoo eval -c evals/presentation/promptfooconfig.yaml \
        --output "$DATA/promptfoo_expansion_run${i}.json" 2>&1 | tail -20
done

log "Phase 3 (post-cold-probe) complete. Data in $DATA/"
ls -la "$DATA/"
