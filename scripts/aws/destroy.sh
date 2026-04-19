#!/usr/bin/env bash
# destroy.sh — tear down the full AWS stack (terraform destroy). Requires typing
# "DESTROY" to confirm. Drains ECS tasks first so ALB + target group unwind
# cleanly.
#
# Prerequisites: aws cli v2, terraform >=1.6, jq (optional for summary).
# Env vars: AWS_PROFILE (or keys+session token); AWS_REGION (default us-west-2);
#   PREFIX (default sga-v2-demo).

set -euo pipefail
IFS=$'\n\t'

AWS_REGION="${AWS_REGION:-us-west-2}"
PREFIX="${PREFIX:-sga-v2-demo}"
CLUSTER="${PREFIX}-cluster"
SERVICE="${PREFIX}-app"

REPO_ROOT="$(git rev-parse --show-toplevel)"
TF_DIR="${REPO_ROOT}/infra/aws"

printf '==> destroy.sh\n'
printf '==> region=%s prefix=%s\n' "${AWS_REGION}" "${PREFIX}"

# --- pre-flight ---------------------------------------------------------------
for bin in aws terraform; do
  if ! command -v "${bin}" >/dev/null 2>&1; then
    printf '==> ERROR: %s not found on PATH.\n' "${bin}" >&2
    exit 1
  fi
done

if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  printf '==> ERROR: set AWS_PROFILE or AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN.\n' >&2
  exit 1
fi

if ! aws sts get-caller-identity --region "${AWS_REGION}" >/dev/null 2>&1; then
  printf '==> ERROR: aws sts get-caller-identity failed. Creds missing/expired?\n' >&2
  exit 1
fi

if [[ ! -d "${TF_DIR}" ]]; then
  printf '==> ERROR: %s missing — nothing to destroy from here.\n' "${TF_DIR}" >&2
  exit 1
fi

cd "${TF_DIR}"

# --- summary ------------------------------------------------------------------
printf '\n==> [1/4] Resource summary\n'
if command -v jq >/dev/null 2>&1; then
  RESOURCE_COUNT="$(terraform show -json 2>/dev/null \
    | jq '[.values.root_module.resources // [],
           (.values.root_module.child_modules // [] | map(.resources // []) | add // [])] | add | length' \
    2>/dev/null || printf 'unknown')"
  printf '==> terraform state: %s resources\n' "${RESOURCE_COUNT}"
else
  printf '==> (jq not installed; skipping state summary)\n'
fi

cat <<EOF
==> About to destroy (if present):
    - ECS service + cluster (${SERVICE} / ${CLUSTER})
    - ALB + target group + listeners
    - RDS PostgreSQL (skip_final_snapshot=true — data is gone)
    - ElastiCache Redis node
    - ECR repo + images
    - SSM SecureString params (OPENROUTER_API_KEY, JWT_SECRET, DATABASE_URL, REDIS_URL)
    - VPC, subnets, SGs, IGW, route tables
    - CloudWatch log group

==> This is NOT reversible. Estimated duration: 8-10 min (RDS dominates).
EOF

# --- confirmation -------------------------------------------------------------
read -r -p '==> Type DESTROY (uppercase) to proceed: ' confirm
if [[ "${confirm}" != "DESTROY" ]]; then
  printf '==> Confirmation mismatch. Aborted.\n'
  exit 1
fi

# --- drain ecs ----------------------------------------------------------------
printf '\n==> [2/4] Drain ECS service (desired-count=0) for cleaner teardown\n'
if aws ecs describe-services \
      --cluster "${CLUSTER}" \
      --services "${SERVICE}" \
      --region "${AWS_REGION}" \
      --query 'services[0].status' \
      --output text 2>/dev/null | grep -q 'ACTIVE'; then
  aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE}" \
    --desired-count 0 \
    --region "${AWS_REGION}" \
    --no-cli-pager >/dev/null
  printf '==> Waiting for tasks to drain (up to 10 min)...\n'
  aws ecs wait services-stable \
    --cluster "${CLUSTER}" \
    --services "${SERVICE}" \
    --region "${AWS_REGION}" || printf '==> (wait failed; continuing to terraform destroy)\n'
else
  printf '==> Service not active or missing — skipping drain.\n'
fi

# --- terraform destroy --------------------------------------------------------
printf '\n==> [3/4] terraform destroy -auto-approve\n'
if ! terraform destroy -auto-approve; then
  cat >&2 <<EOF

==> terraform destroy returned non-zero. Common culprits:
    - Orphan ENIs blocking subnet/VPC delete: open EC2 console
      → Network Interfaces → filter by VPC tag "${PREFIX}" → detach/delete manually, then re-run.
    - RDS final-snapshot dance: skip_final_snapshot=true in rds.tf should prevent
      this; if it re-appeared, check the RDS console for a pending "deleting-snapshot" state.
    - SSM parameters drifted: if bootstrap-secrets.sh was modified to call
      put-parameter directly, terraform no longer owns those params — delete them
      manually: aws ssm delete-parameter --name /${PREFIX}/<name>.

==> Re-run ./scripts/aws/destroy.sh after resolving the above.
EOF
  exit 1
fi

# --- post --------------------------------------------------------------------
printf '\n==> [4/4] Post-destroy checks\n'
printf '==> Verify no leftover charges:\n'
printf '    aws ec2 describe-network-interfaces --region %s --filters Name=vpc-id,Values=...\n' "${AWS_REGION}"
printf '    aws rds describe-db-instances --region %s\n' "${AWS_REGION}"
printf '    aws elasticache describe-cache-clusters --region %s\n' "${AWS_REGION}"

printf '\n==> Destroy complete.\n'
