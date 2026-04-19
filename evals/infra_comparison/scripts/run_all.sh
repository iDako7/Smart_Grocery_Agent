#!/usr/bin/env bash
# run_all.sh — Fly.io vs AWS infra comparison eval orchestrator.
#
# Runs Tests A, B, D, H; aggregates stats; generates charts.
# Each step is run independently: a single-step failure is logged and the
# suite continues so aggregation still runs on whatever data was collected.
#
# Usage:
#   export SGA_FLY_URL=https://sga-v2.fly.dev
#   export SGA_AWS_URL=https://d33hdkvctxckhb.cloudfront.net
#   export OPENROUTER_API_KEY=sk-or-...
#   chmod +x evals/infra_comparison/scripts/run_all.sh
#   bash evals/infra_comparison/scripts/run_all.sh
#
# Optional overrides:
#   PY=/path/to/python   — Python interpreter (default: loadtest venv or python3)

set -euo pipefail

# ---------------------------------------------------------------------------
# 0. Paths
# ---------------------------------------------------------------------------
REPO="$(git rev-parse --show-toplevel)"
EVAL_DIR="$REPO/evals/infra_comparison"

banner() {
    echo "" 1>&2
    echo "=== $* ===" 1>&2
    echo "" 1>&2
}

step_failed() {
    echo "[WARN] step failed — continuing: $*" 1>&2
}

# ---------------------------------------------------------------------------
# 1. Validate required env vars
# ---------------------------------------------------------------------------
banner "Step 0: Validate environment"

missing_vars=()
for var in SGA_FLY_URL SGA_AWS_URL OPENROUTER_API_KEY; do
    if [[ -z "${!var:-}" ]]; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    echo "[ERROR] Missing required environment variables:" 1>&2
    for v in "${missing_vars[@]}"; do
        echo "    $v" 1>&2
    done
    echo "" 1>&2
    echo "Set them before running:" 1>&2
    echo "    export SGA_FLY_URL=https://sga-v2.fly.dev" 1>&2
    echo "    export SGA_AWS_URL=https://d33hdkvctxckhb.cloudfront.net" 1>&2
    echo "    export OPENROUTER_API_KEY=sk-or-..." 1>&2
    exit 1
fi
echo "All required env vars present." 1>&2

# ---------------------------------------------------------------------------
# 2. Pick Python interpreter
# ---------------------------------------------------------------------------
banner "Step 0b: Pick Python interpreter"

VENV_PY="$REPO/loadtest/.venv/bin/python"
if [[ -n "${PY:-}" ]]; then
    echo "Using PY override: $PY" 1>&2
elif [[ -x "$VENV_PY" ]]; then
    PY="$VENV_PY"
    echo "Using venv Python: $PY" 1>&2
elif command -v python3 &>/dev/null; then
    PY="python3"
    echo "Using system python3" 1>&2
else
    echo "[ERROR] No Python found. Set PY=/path/to/python or install python3." 1>&2
    exit 1
fi

# Verify matplotlib is importable (required for generate_charts.py)
if ! "$PY" -c "import matplotlib" 2>/dev/null; then
    echo "[WARN] matplotlib not importable from $PY — chart step will fail." 1>&2
    echo "       Install with: $PY -m pip install matplotlib" 1>&2
fi

# ---------------------------------------------------------------------------
# 3. Warmup — ensure Fly machine is warm before Test A
# ---------------------------------------------------------------------------
banner "Step 1: Warmup (3× /health on each platform)"

echo "Warming up Fly.io..." 1>&2
for i in 1 2 3; do
    curl -s --max-time 30 "${SGA_FLY_URL}/health" > /dev/null || true
    echo "  Fly warmup $i/3 done" 1>&2
done

echo "Warming up AWS..." 1>&2
for i in 1 2 3; do
    curl -s --max-time 30 "${SGA_AWS_URL}/health" > /dev/null || true
    echo "  AWS warmup $i/3 done" 1>&2
done

# ---------------------------------------------------------------------------
# 4. Test A — Microbench (/health + /session, no LLM)
# ---------------------------------------------------------------------------
banner "Step 2: Test A — /health + /session microbench"

"$PY" "$EVAL_DIR/scripts/test_a_microbench.py" --target both \
    || step_failed "Test A"

# ---------------------------------------------------------------------------
# 5. Test B — TTFB (root HTML + JS chunk)
# ---------------------------------------------------------------------------
banner "Step 3: Test B — Edge TTFB (CloudFront vs Fly Anycast)"

"$PY" "$EVAL_DIR/scripts/test_b_ttfb.py" --target both \
    || step_failed "Test B"

# ---------------------------------------------------------------------------
# 6. Test D — Lookup-heavy agent workload (4 runs: Fly ×2, AWS ×2)
# ---------------------------------------------------------------------------
banner "Step 4: Test D — Lookup-heavy agent latency (promptfoo, 2 runs per target)"

# Helper: run one promptfoo eval; continue on failure.
run_test_d() {
    local base_url="$1"
    local out_file="$2"
    echo "  Running: base_url=$base_url output=$out_file" 1>&2
    (
        cd "$REPO"
        SGA_EVAL_RESET_PROFILE=0 \
        SGA_EVAL_BASE_URL="$base_url" \
        npx promptfoo eval \
            --no-cache \
            -c evals/infra_comparison/promptfooconfig.yaml \
            --output "$out_file" \
        || step_failed "Test D: $out_file"
    )
}

run_test_d "$SGA_FLY_URL" "evals/infra_comparison/data/test_d_fly_run1.json"
run_test_d "$SGA_FLY_URL" "evals/infra_comparison/data/test_d_fly_run2.json"
run_test_d "$SGA_AWS_URL" "evals/infra_comparison/data/test_d_aws_run1.json"
run_test_d "$SGA_AWS_URL" "evals/infra_comparison/data/test_d_aws_run2.json"

# ---------------------------------------------------------------------------
# 7. Test H — Infra cost model
# ---------------------------------------------------------------------------
banner "Step 5: Test H — Monthly infra cost model"

# No-op when billing_inputs.json has nulls (test_h_cost.py exits 0 in that case).
"$PY" "$EVAL_DIR/scripts/test_h_cost.py" \
    || step_failed "Test H"

# ---------------------------------------------------------------------------
# 8. Aggregate stats
# ---------------------------------------------------------------------------
banner "Step 6: Aggregate stats -> data/stats.json"

"$PY" "$EVAL_DIR/scripts/aggregate_stats.py" \
    || step_failed "aggregate_stats"

# ---------------------------------------------------------------------------
# 9. Generate charts
# ---------------------------------------------------------------------------
banner "Step 7: Generate charts -> charts/"

"$PY" "$EVAL_DIR/scripts/generate_charts.py" \
    || step_failed "generate_charts"

# ---------------------------------------------------------------------------
# 10. Summary
# ---------------------------------------------------------------------------
banner "Run complete — generated files"

DATA_DIR="$EVAL_DIR/data"
CHARTS_DIR="$EVAL_DIR/charts"

echo "Data files:" 1>&2
for f in \
    "$DATA_DIR/test_a_fly.json" \
    "$DATA_DIR/test_a_aws.json" \
    "$DATA_DIR/test_b_fly.json" \
    "$DATA_DIR/test_b_aws.json" \
    "$DATA_DIR/test_d_fly_run1.json" \
    "$DATA_DIR/test_d_fly_run2.json" \
    "$DATA_DIR/test_d_aws_run1.json" \
    "$DATA_DIR/test_d_aws_run2.json" \
    "$DATA_DIR/test_h_cost.json" \
    "$DATA_DIR/stats.json"; do
    if [[ -f "$f" ]]; then
        echo "  [ok]  $f" 1>&2
    else
        echo "  [--]  $f (missing)" 1>&2
    fi
done

echo "" 1>&2
echo "Charts:" 1>&2
for f in \
    "$CHARTS_DIR/latency_microbench.png" \
    "$CHARTS_DIR/ttfb_comparison.png" \
    "$CHARTS_DIR/lookup_latency_boxplot.png" \
    "$CHARTS_DIR/cost_per_1000.png"; do
    if [[ -f "$f" ]]; then
        echo "  [ok]  $f" 1>&2
    else
        echo "  [--]  $f (missing)" 1>&2
    fi
done

echo "" 1>&2
echo "Done." 1>&2
