# AWS Showcase Deploy — Runbook

Parallel deploy track to Fly.io. Target: us-west-2, AWS Academy Learner Lab
(4-hour session credentials). See `docs/01-plans/phase3-aws-deploy-plan.md`
for the full plan and `infra/aws/` for terraform.

**Pattern:** `apply` → demo → `destroy`. Do not leave the stack running.

---

## 1. Prerequisites

Install locally:

```bash
aws --version       # aws cli v2
terraform -version  # >= 1.6
docker --version    # daemon must be running
jq --version
git --version
openssl version     # for JWT auto-gen in bootstrap
```

After writing or pulling new scripts, set the executable bit once:

```bash
chmod +x scripts/aws/*.sh
```

---

## 2. AWS Academy session credentials

Each lab session issues a fresh 3-part credential (access key, secret,
session token) that expires after ~4 hours. Paste into
`~/.aws/credentials` under a dedicated profile:

```ini
[091113170645_myisb_IsbUsersPS]
aws_access_key_id     = ASIA...
aws_secret_access_key = ...
aws_session_token     = FwoGZXIvYXdzE...
```

Then export the profile and region:

```bash
export AWS_PROFILE=091113170645_myisb_IsbUsersPS
export AWS_REGION=us-west-2
aws sts get-caller-identity   # sanity check
```

When creds expire mid-session, repeat this step — no script state is lost.

---

## 3. First-time setup: provision secrets

Prompts for the three user-supplied secrets and writes them to
`infra/aws/terraform.tfvars` (gitignored). `DATABASE_URL` and `REDIS_URL`
are computed by terraform from RDS and ElastiCache endpoints — not
prompted here.

```bash
./scripts/aws/bootstrap-secrets.sh
```

Inputs:

- `db_password` — RDS master password (>=8 chars, no `/ @ " `, no spaces)
- `openrouter_api_key` — `sk-or-v1-...` from <https://openrouter.ai/keys>
- `jwt_secret` — offer to auto-generate via `openssl rand -hex 32`

The script refuses to overwrite an existing `terraform.tfvars` without
an explicit `y` confirmation.

---

## 4. Deploy

```bash
./scripts/aws/deploy.sh
```

What it does:

1. `terraform init -upgrade` in `infra/aws/`.
2. Prompts before `terraform apply` (skip with `DEPLOY_CONFIRM=true`).
3. Builds `linux/amd64` image and pushes to ECR.
4. `aws ecs update-service --force-new-deployment`.
5. Waits for `services-stable`.
6. Prints `terraform output -raw alb_url` and `curl`s `/health`.

**Expected duration:** ~10 min on first apply — RDS creation dominates (~8 min).
Subsequent code-only deploys take ~2–3 min.

---

## 5. Smoke verification

```bash
ALB_URL="$(cd infra/aws && terraform output -raw alb_url)"
curl -fsS "${ALB_URL}/health"
open "${ALB_URL}"   # macOS — loads SPA in default browser
```

### HTTPS via CloudFront

The ALB listener is HTTP-only. For browser-friendly HTTPS (no "Not secure"
warning in the showcase), a CloudFront distribution fronts the ALB and
terminates TLS at the edge using the default `*.cloudfront.net` cert.
This is controlled by the `enable_cloudfront` variable (default `true`).

```bash
CF_URL="$(cd infra/aws && terraform output -raw cloudfront_url)"
echo "${CF_URL}"            # e.g. https://d1a2b3c4d5e6.cloudfront.net
curl -fsS "${CF_URL}/health"
open "${CF_URL}"            # browser loads SPA over HTTPS
```

Notes:

- First apply spends ~5–10 min on the CloudFront deployment; subsequent
  applies are fast unless the distribution config changes.
- The distribution uses `redirect-to-https` for viewers, `http-only` to the
  origin, and the managed `CachingDisabled` + `AllViewer` policies so SSE
  (`/chat`) and JWT `Authorization` headers pass through unbuffered.
- To skip CloudFront and demo over plain HTTP only, set
  `enable_cloudfront = false` in `terraform.tfvars`.

Manual checklist:

- Magic-link signup completes (email delivery or log-captured token).
- Chat endpoint returns an SSE stream on a real question.
- Redis hit on a repeated tool call (look for cache-hit metric or log line).

---

## 6. Logs

```bash
aws logs tail /ecs/sga-v2-demo --follow --region us-west-2
aws logs tail /ecs/sga-v2-demo --since 5m  --region us-west-2
```

---

## 7. Iterate on code (no terraform change)

Most app changes don't touch infra. Rebuild + push + roll the service:

```bash
./scripts/aws/build-push.sh
aws ecs update-service \
  --cluster sga-v2-demo-cluster \
  --service sga-v2-demo-app \
  --force-new-deployment \
  --region us-west-2
aws ecs wait services-stable \
  --cluster sga-v2-demo-cluster \
  --services sga-v2-demo-app \
  --region us-west-2
```

`deploy.sh` remains the safer path — it also runs `terraform apply`, which
is a no-op when infra is unchanged but catches drift.

---

## 8. Teardown

```bash
./scripts/aws/destroy.sh
```

Requires typing `DESTROY` (exact case). Drains ECS tasks first, then runs
`terraform destroy`. **Expected duration:** 8–10 min (RDS dominates).

---

## 9. Troubleshooting

- **Session creds expired.** Re-paste into `~/.aws/credentials` under the
  same profile name; `export AWS_PROFILE=...`; re-run the failed script.
- **Platform mismatch on push** (`exec format error` in ECS task logs).
  `build-push.sh` forces `--platform linux/amd64`; confirm Docker Desktop
  is running and rerun. Rosetta/QEMU must be enabled on Apple Silicon.
- **ECS task failing / crash-looping.**
  `aws logs tail /ecs/sga-v2-demo --since 5m --region us-west-2` — the top
  lines usually point at a missing SSM param or a DATABASE_URL parse error.
- **RDS destroy stuck in `deleting`.** `skip_final_snapshot=true` and
  `deletion_protection=false` in `rds.tf` should prevent this; if it
  reappears, check the RDS console for a pending snapshot job and delete it.
- **Orphan ENI on destroy** (subnet/VPC won't delete). EC2 console →
  Network Interfaces → filter by VPC id → detach and delete, then re-run
  `./scripts/aws/destroy.sh`.
- **ALB /health 5xx after deploy.** Target group health check needs a
  minute; retry for 60s. Persistent failure → check task logs for alembic
  migration errors.

---

## 10. Cost awareness

Full stack left running ≈ **$65/month** (ALB + RDS db.t4g.micro +
ElastiCache cache.t4g.micro + Fargate 0.5vCPU/1GB + ECR storage + log
ingest). For AWS Academy's ~$50 budget, that's less than one month.

**Rule:** `./scripts/aws/destroy.sh` at the end of every session. A full
apply/destroy cycle for a 2-hour showcase costs roughly $1–3.
