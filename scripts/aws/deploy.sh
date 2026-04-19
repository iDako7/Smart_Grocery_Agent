#!/usr/bin/env bash
# deploy.sh — full AWS deploy: terraform apply → build/push image → force new
# ECS deployment → wait for steady state → print ALB URL.
#
# Prerequisites: aws cli v2, terraform >=1.6, docker, jq; infra/aws/terraform.tfvars
# present (run scripts/aws/bootstrap-secrets.sh first).
# Env vars: AWS_PROFILE (or AWS_ACCESS_KEY_ID+SECRET+SESSION_TOKEN);
#   AWS_REGION (default us-west-2); PREFIX (default sga-v2-demo);
#   DEPLOY_CONFIRM=true to skip the terraform-apply prompt.

set -euo pipefail
IFS=$'\n\t'

AWS_REGION="${AWS_REGION:-us-west-2}"
PREFIX="${PREFIX:-sga-v2-demo}"
CLUSTER="${PREFIX}-cluster"
SERVICE="${PREFIX}-app"

REPO_ROOT="$(git rev-parse --show-toplevel)"
TF_DIR="${REPO_ROOT}/infra/aws"
TFVARS="${TF_DIR}/terraform.tfvars"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf '==> deploy.sh\n'
printf '==> region=%s prefix=%s cluster=%s service=%s\n' \
  "${AWS_REGION}" "${PREFIX}" "${CLUSTER}" "${SERVICE}"

# --- pre-flight ---------------------------------------------------------------
for bin in aws terraform docker jq; do
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

if [[ ! -f "${TFVARS}" ]]; then
  printf '==> ERROR: %s not found. Run scripts/aws/bootstrap-secrets.sh first.\n' "${TFVARS}" >&2
  exit 1
fi

# --- terraform init -----------------------------------------------------------
printf '\n==> [1/5] terraform init -upgrade (in %s)\n' "${TF_DIR}"
cd "${TF_DIR}"
terraform init -upgrade

# --- terraform apply ----------------------------------------------------------
printf '\n==> [2/5] terraform apply\n'
if [[ "${DEPLOY_CONFIRM:-}" == "true" ]]; then
  printf '==> DEPLOY_CONFIRM=true — skipping interactive prompt.\n'
else
  read -r -p "==> Apply terraform? [y/N] " confirm
  if [[ "${confirm:-}" != "y" && "${confirm:-}" != "Y" ]]; then
    printf '==> Aborted. No changes applied.\n'
    exit 1
  fi
fi
terraform apply -auto-approve

# --- build + push -------------------------------------------------------------
printf '\n==> [3/5] build + push container image\n'
IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || printf 'latest')"
export IMAGE_TAG AWS_REGION PREFIX
"${SCRIPT_DIR}/build-push.sh"

# --- force new deployment -----------------------------------------------------
printf '\n==> [4/5] aws ecs update-service --force-new-deployment\n'
aws ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --force-new-deployment \
  --region "${AWS_REGION}" \
  --no-cli-pager >/dev/null

printf '==> Waiting for service to reach steady state (up to 10 min)...\n'
aws ecs wait services-stable \
  --cluster "${CLUSTER}" \
  --services "${SERVICE}" \
  --region "${AWS_REGION}"

# --- outputs + smoke ----------------------------------------------------------
printf '\n==> [5/5] read outputs + smoke test\n'
ALB_URL="$(terraform output -raw alb_url 2>/dev/null || true)"
if [[ -z "${ALB_URL}" ]]; then
  printf '==> WARNING: terraform output alb_url is empty; check outputs.tf.\n' >&2
else
  printf '==> ALB URL: %s\n' "${ALB_URL}"
  printf '==> curl -fsS %s/health\n' "${ALB_URL}"
  if curl -fsS --max-time 10 "${ALB_URL%/}/health" >/dev/null; then
    printf '==> /health OK\n'
  else
    printf '==> WARNING: /health did not respond OK yet (tasks may still be warming).\n'
    printf '==> Retry: curl -fsS %s/health\n' "${ALB_URL%/}"
  fi
fi

printf '\n==> Deploy complete.\n'
