#!/usr/bin/env bash
# Verify the built Tailwind CSS bundle is not missing numeric spacing utilities.
#
# Regression guard for issue #146: on some bun versions (1.3.12 seen),
# Tailwind v4's implicit source detection failed to discover our TSX files,
# and the emitted CSS was missing every .p-*, .px-*, .py-*, .gap-*, .m-*
# utility. The site rendered with zero padding everywhere.
#
# Expected baseline (local, bun 1.3.11): ~48 KB with all spacing utilities.
# A broken bundle is ~36 KB with only .p-auto / .m-auto variants.
#
# This script finds the latest CSS asset under dist/assets/ and asserts:
#   1. size >= MIN_SIZE_BYTES (default 46000)
#   2. a set of representative numeric spacing classes are present
#
# Usage: run from src/frontend/ after `bun run build`, or pass a path:
#   ./scripts/verify-css-bundle.sh              # auto-find in dist/assets/
#   ./scripts/verify-css-bundle.sh /path/to.css # explicit file

set -euo pipefail

MIN_SIZE_BYTES="${MIN_SIZE_BYTES:-46000}"
REQUIRED_CLASSES=(
  ".px-6"
  ".py-4"
  ".gap-3"
  ".p-4"
  ".mb-2"
)

if [[ $# -gt 0 ]]; then
  CSS_FILE="$1"
else
  CSS_FILE="$(ls -1 dist/assets/index-*.css 2>/dev/null | head -n1 || true)"
fi

if [[ -z "${CSS_FILE}" || ! -f "${CSS_FILE}" ]]; then
  echo "ERROR: no CSS bundle found at ${CSS_FILE:-dist/assets/index-*.css}" >&2
  echo "       run \`bun run build\` first, or pass the path explicitly." >&2
  exit 2
fi

SIZE_BYTES="$(wc -c < "${CSS_FILE}" | tr -d ' ')"

echo "Verifying CSS bundle: ${CSS_FILE}"
echo "  size: ${SIZE_BYTES} bytes (min ${MIN_SIZE_BYTES})"

FAIL=0

if (( SIZE_BYTES < MIN_SIZE_BYTES )); then
  echo "  FAIL: bundle is smaller than ${MIN_SIZE_BYTES} bytes — tailwind likely dropped utilities" >&2
  FAIL=1
fi

MISSING=()
for cls in "${REQUIRED_CLASSES[@]}"; do
  # escape the leading dot for grep's fixed-string mode
  if ! grep -F -q -- "${cls}" "${CSS_FILE}"; then
    MISSING+=("${cls}")
  fi
done

if (( ${#MISSING[@]} > 0 )); then
  echo "  FAIL: missing required utility classes: ${MISSING[*]}" >&2
  FAIL=1
fi

if (( FAIL == 0 )); then
  echo "  OK: all ${#REQUIRED_CLASSES[@]} required classes present"
fi

exit "${FAIL}"
