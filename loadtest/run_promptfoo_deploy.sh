#!/usr/bin/env bash
# Run the Phase 2 promptfoo suite against the deployed demo.
#
# Sets SGA_EVAL_BASE_URL so evals/phase2/provider.py targets the Fly app
# instead of local docker. Metric 8 of PR 5: the 5 trimmed cases must pass
# at ≥ 80% (4 / 5). OPENROUTER_API_KEY must already be exported (read from
# your local .env — not committed anywhere).

set -euo pipefail

BASE_URL="${SGA_EVAL_BASE_URL:-https://sga-v2.fly.dev}"

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is not set — export it before running." >&2
  echo "  export OPENROUTER_API_KEY=\$(grep ^OPENROUTER_API_KEY= /path/to/.env | cut -d= -f2-)" >&2
  exit 2
fi

echo "Running promptfoo suite against ${BASE_URL} ..."
if ! curl -sS --fail --max-time 10 "${BASE_URL}/health" >/dev/null; then
  echo "Health check failed at ${BASE_URL}/health — aborting." >&2
  exit 3
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}/evals/phase2"
# "$@" is intentional: any flags passed to this script (e.g. --filter, -n N)
# flow straight through to `promptfoo eval`. `exec` replaces the shell, so
# promptfoo's own exit code is what the caller sees.
SGA_EVAL_BASE_URL="${BASE_URL}" exec npx --yes promptfoo@latest eval \
  -c promptfooconfig.yaml "$@"
