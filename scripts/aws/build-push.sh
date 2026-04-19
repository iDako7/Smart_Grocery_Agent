#!/usr/bin/env bash
# build-push.sh — build the multi-stage Docker image for linux/amd64 and push
# it to the ECR repo managed by terraform (infra/aws/ecr.tf).
#
# Prerequisites: docker (running), aws cli v2, git, terraform apply must have
# already created the ECR repo.
# Env vars: AWS_PROFILE or AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY+
#   AWS_SESSION_TOKEN; AWS_REGION (default us-west-2); PREFIX (default
#   sga-v2-demo); IMAGE_TAG (default: short git SHA, fallback "latest").

set -euo pipefail
IFS=$'\n\t'

AWS_REGION="${AWS_REGION:-us-west-2}"
PREFIX="${PREFIX:-sga-v2-demo}"
REPO_NAME="${PREFIX}-app"

# Resolve repo root — Docker build context is always the monorepo root
# so the Dockerfile can reach src/frontend, src/backend, contracts/, etc.
REPO_ROOT="$(git rev-parse --show-toplevel)"

# --- pre-flight ---------------------------------------------------------------
printf '==> build-push.sh\n'
printf '==> region=%s prefix=%s repo=%s\n' "${AWS_REGION}" "${PREFIX}" "${REPO_NAME}"

if ! command -v docker >/dev/null 2>&1; then
  printf '==> ERROR: docker CLI not found.\n' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf '==> ERROR: docker daemon not responding. Start Docker Desktop.\n' >&2
  exit 1
fi
if ! command -v aws >/dev/null 2>&1; then
  printf '==> ERROR: aws CLI not found.\n' >&2
  exit 1
fi

if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  printf '==> ERROR: set AWS_PROFILE or AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN.\n' >&2
  exit 1
fi

# Resolve account id (fails fast if creds are expired/missing).
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "${AWS_REGION}")"
if [[ -z "${AWS_ACCOUNT_ID}" || "${AWS_ACCOUNT_ID}" == "None" ]]; then
  printf '==> ERROR: could not resolve AWS account id (creds expired?).\n' >&2
  exit 1
fi

# Resolve image tag: prefer explicit IMAGE_TAG, else short git SHA, else "latest".
if [[ -z "${IMAGE_TAG:-}" ]]; then
  if IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null)"; then
    :
  else
    IMAGE_TAG="latest"
  fi
fi

ECR_HOST="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_URI="${ECR_HOST}/${REPO_NAME}"

printf '==> account=%s tag=%s\n' "${AWS_ACCOUNT_ID}" "${IMAGE_TAG}"
printf '==> target=%s:%s (and :latest)\n' "${ECR_URI}" "${IMAGE_TAG}"

# --- ecr login ----------------------------------------------------------------
printf '==> [1/4] ECR login\n'
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_HOST}"

# --- build --------------------------------------------------------------------
printf '==> [2/4] docker build --platform linux/amd64 (context=%s)\n' "${REPO_ROOT}"
cd "${REPO_ROOT}"
docker build \
  --platform linux/amd64 \
  -t "${REPO_NAME}:${IMAGE_TAG}" \
  -t "${REPO_NAME}:latest" \
  -f Dockerfile \
  .

# --- tag ----------------------------------------------------------------------
printf '==> [3/4] tag with ECR URI\n'
docker tag "${REPO_NAME}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker tag "${REPO_NAME}:latest"       "${ECR_URI}:latest"

# --- push ---------------------------------------------------------------------
printf '==> [4/4] docker push\n'
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"

printf '\n==> Pushed %s:%s\n' "${ECR_URI}" "${IMAGE_TAG}"
# Machine-readable last line for downstream consumers (deploy.sh, CI).
printf '%s:%s\n' "${ECR_URI}" "${IMAGE_TAG}"
