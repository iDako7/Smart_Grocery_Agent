#!/usr/bin/env bash
# Recovery + finish: poll Fly until healthy, then steady-state @ 5u, promptfoo x3+x2, charts.
# Run from worktree root.
set -uo pipefail

cd "$(dirname "$0")/../../.."   # → worktree root
HOST="https://sga-v2.fly.dev"
DATA="evals/presentation/data"
LOCUST="loadtest/.venv/bin/locust"

# Source OPENROUTER_API_KEY for promptfoo grader
if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    set -a; source ../SGA_V2/.env 2>/dev/null || true; set +a
fi

log() { echo "[$(date +%H:%M:%S)] $*"; }

# ---- 1. Poll until Fly recovers (HTTP 201 on POST /session) --------------
log "polling for Fly recovery..."
attempts=0
while true; do
    code=$(curl -sS -o /dev/null -m 10 -w "%{http_code}" \
           -X POST -H "Content-Type: application/json" \
           -d '{"initial_message":null}' "$HOST/session" 2>/dev/null || echo "000")
    if [[ "$code" == "201" ]]; then
        log "Fly recovered after $attempts polls"
        break
    fi
    attempts=$((attempts + 1))
    if [[ $attempts -gt 40 ]]; then
        log "ERROR: Fly did not recover after 10 minutes — aborting"
        exit 1
    fi
    sleep 15
done

# Brief warm-up so the steady run starts on a healthy machine
log "warm-up: sending 3 single requests to confirm health"
for i in 1 2 3; do
    code=$(curl -sS -o /dev/null -m 30 -w "%{http_code}" \
           -X POST -H "Content-Type: application/json" \
           -d '{"initial_message":null}' "$HOST/session" 2>/dev/null || echo "000")
    log "  warmup $i: HTTP $code"
    sleep 2
done

# ---- 2. Steady-state at 5u × 5min (safer than 10u given pool issue) -----
log "steady 5 users / 5 min"
"$LOCUST" -f loadtest/locustfile.py --host "$HOST" \
    --users 5 --spawn-rate 1 --run-time 5m \
    --headless --csv "$DATA/locust_steady" \
    --only-summary 2>&1 | tail -30

# Brief recovery pause before promptfoo
log "post-steady cool-down 30s"
sleep 30

# ---- 3. promptfoo phase2 × 3 runs ---------------------------------------
export SGA_EVAL_BASE_URL="$HOST"
for i in 1 2 3; do
    log "promptfoo phase2 run $i/3"
    npx --yes promptfoo eval -c evals/phase2/promptfooconfig.yaml \
        --output "$DATA/promptfoo_phase2_run${i}.json" 2>&1 | tail -15
    sleep 10
done

# ---- 4. promptfoo expansion × 2 runs ------------------------------------
for i in 1 2; do
    log "promptfoo expansion run $i/2"
    npx --yes promptfoo eval -c evals/presentation/promptfooconfig.yaml \
        --output "$DATA/promptfoo_expansion_run${i}.json" 2>&1 | tail -15
    sleep 10
done

# ---- 5. Generate charts -------------------------------------------------
log "generating charts"
loadtest/.venv/bin/python evals/presentation/scripts/generate_charts.py 2>&1

log "ALL DONE — data in $DATA/, charts in evals/presentation/charts/"
ls -la "$DATA/" | head -25
ls -la evals/presentation/charts/ 2>/dev/null
