# Phase 3 — AWS Showcase Deployment Plan (parallel to Fly.io)

**Date:** 2026-04-18 | **Status:** Awaiting approval | **Owner:** Dako (@iDako7)

---

## Context

Current deploy is on Fly.io (see `fly.toml`, multi-stage Dockerfile, `SERVE_FRONTEND=true`). Fly does not run managed Redis and constrains future scaling options. This plan adds an AWS deployment track as a **parallel showcase target** while preserving the Fly deploy intact. Reference: `docs/00-specs/architecture-spec-v3.md`.

**Operating mode:** AWS Academy Learner Lab (us-west-2), 4-hour session credentials, resources persist across sessions until budget (~$50) is exhausted. Pattern: `apply → test → destroy → re-apply on showcase day`.

---

## Requirements

- Add `infra/aws/` as a **parallel** deploy track. Leave `fly.toml`, Fly Dockerfile, and Fly workflow **untouched** — both targets buildable from the same repo, Fly stays running, commit history preserved.
- Terraform config committed; state files + tfvars gitignored.
- Follow `architecture-spec-v3.md` **minus**:
  - S3/CloudFront split (keep `SERVE_FRONTEND=true` bundled container — zero backend code delta, no CORS surgery).
  - Token streaming (deferred; stay with current collect-then-emit).
- Keep ALB (HTTPS credibility + clean demo URL).
- AWS creds provided by user via paste at deploy time; never committed.

---

## Architecture (locked)

```
Internet → ALB (public, idle_timeout=300) → Fargate task (public subnet, public IP, no NAT)
                                                 ├─ RDS db.t4g.micro          (private)
                                                 ├─ ElastiCache cache.t4g.micro (private)
                                                 └─ SSM params (OPENROUTER_API_KEY, JWT_SECRET, DATABASE_URL, REDIS_URL)
Image: ECR → Fargate · Logs: CloudWatch (14d retention)
```

One container serves SPA at `/` + API (same as Fly). NAT skipped (Fargate gets public IP → outbound to OpenRouter direct, saves ~$32/mo).

**Network layout:** VPC `10.0.0.0/16`, 2 public `/24` + 2 private `/24`, IGW, no NAT.

**Security groups:**
- ALB-SG: ingress `80/443` from `0.0.0.0/0`, egress all
- ECS-SG: ingress `8000` **from ALB-SG only**, egress all
- RDS-SG: ingress `5432` from ECS-SG only
- Redis-SG: ingress `6379` from ECS-SG only

---

## Phases

### Phase 0 — Preflight *(no AWS creds needed)*
- Create `infra/aws/` skeleton.
- Gitignore: `infra/aws/*.tfstate*`, `infra/aws/.terraform/`, `infra/aws/*.tfvars` (commit `*.example.tfvars`).
- Copy-adapt homework's flat-module pattern (single directory, no nested modules).

### Phase 1 — Terraform authoring *(parallel sub-agent A)*

Files:
- `versions.tf`, `provider.tf` — minimal boilerplate, provider `us-west-2`.
- `variables.tf` — region, project_name, app_image_tag, db_password (sensitive), openrouter_key (sensitive), jwt_secret (sensitive), `use_existing_iam_roles=true`, `existing_task_role_name="LabRole"`, `existing_execution_role_name="LabRole"`.
- `locals.tf` — conditional IAM role ARN selection, image URI fallback.
- `network.tf` — VPC, subnets, IGW, route tables, SGs (as above).
- `alb.tf` — ALB, target group (`/health` check), listener; **`idle_timeout=300`** (critical for SSE).
- `ecr.tf` — repo with lifecycle (keep last 5 images).
- `rds.tf` — `db.t4g.micro`, 20GB gp3, single AZ, private subnet group, `skip_final_snapshot=true`, `deletion_protection=false`.
- `redis.tf` — `cache.t4g.micro`, 1 node, no replication.
- `ssm.tf` — SecureString params for the 4 secrets, values injected at apply time via sensitive vars.
- `ecs.tf` — cluster, task def (0.5 vCPU / 1GB, `assign_public_ip=ENABLED`, `secrets` block wiring SSM params to env vars, env block for non-secret config), service (`desired_count=1`, health-check grace 60s).
- `iam.tf` — conditional data-source pattern from homework (reuse LabRole if `use_existing_iam_roles=true`).
- `outputs.tf` — ALB DNS name, ECR repository URL, RDS endpoint (sensitive).

### Phase 2 — Image + Dockerfile verification *(main thread)*
- Confirm existing Dockerfile works on Fargate: uvicorn on `0.0.0.0:8000`, alembic migrate on startup, `DATABASE_URL` normalization already handles `postgres://` → `postgresql+asyncpg://`. No Fly-specific assumptions found.
- Verify ECR push size (est. ~500MB with SQLite KB + Python deps).
- No Dockerfile changes expected; `.dockerignore` already present.

### Phase 3 — Scripts + runbook *(parallel sub-agent B)*
- `scripts/aws/bootstrap-secrets.sh` — `aws ssm put-parameter --type SecureString` for 4 secrets (one-time).
- `scripts/aws/build-push.sh` — ECR login → `docker build --platform linux/amd64` (Mac → Fargate amd64) → tag → push.
- `scripts/aws/deploy.sh` — `terraform apply` → `aws ecs update-service --force-new-deployment` → `aws ecs wait services-stable`.
- `scripts/aws/destroy.sh` — confirmation prompt → `terraform destroy`.
- `scripts/aws/README.md` — showcase-day runbook (paste creds → bootstrap → deploy → verify → destroy).

### Phase 4 — Dry-run test day *(user pastes creds; Claude drives)*
- User pastes 3-part Learner Lab creds (access key, secret, session token).
- Run sequence: bootstrap-secrets → terraform apply → build-push → ecs update-service.
- Smoke tests: `/health`, auth flow, full chat w/ one chip, Redis hit on repeat tool call, CloudWatch logs present.
- Lightweight load: 5–10 concurrent sessions (NOT 50 — preserve budget for showcase).
- Document Learner Lab surprises in runbook.
- `terraform destroy` — watch for orphan ENIs, RDS snapshot dance.

### Phase 5 — Showcase day *(user pastes fresh creds)*
- Fresh 4-hour lab session → paste creds → run deploy sequence → smoke test → demo → `terraform destroy` after.

---

## Risks

| Sev | Risk | Mitigation |
|---|---|---|
| **HIGH** | Learner Lab IAM may block ElastiCache subnet groups or SSM SecureString writes | Phase 4 dry-run catches this; fallback = swap Redis to sidecar container in same task |
| **HIGH** | Platform mismatch on `docker push` (arm Mac → amd64 Fargate) | Force `--platform linux/amd64` in build script |
| **MED** | Terraform state stale if lab auto-destroys resources overnight | Document behavior in Phase 4; recover via `terraform state rm` + re-apply |
| **MED** | ALB 60s default idle timeout would kill SSE long responses | Set `idle_timeout=300` on listener |
| **MED** | RDS create ~8 min; `destroy` includes final-snapshot dance | `skip_final_snapshot=true` + `deletion_protection=false` for learner account |
| **LOW** | Budget drift | 1-day test + 1-day showcase ≈ $5–10 total, safe within $50 |

---

## Orchestration

- **Parallel after plan approval:**
  - Sub-agent A — terraform files in `infra/aws/`
  - Sub-agent B — scripts + runbook in `scripts/aws/`
  - Main thread — Dockerfile verification, `.gitignore` edits
- **Sequential after Phases 1–3 done:**
  - Main thread: `terraform fmt && terraform validate` locally (no creds needed)
  - Code-review agent pass
- **Phase 4/5:** main thread only — Claude drives apply/verify/destroy, user watches.

---

## Complexity: MEDIUM

| Work | Est. |
|---|---|
| Terraform (Agent A) | 3–4 hrs |
| Scripts + runbook (Agent B) | 1–2 hrs |
| Dockerfile verify + integration | ~1 hr |
| Dry-run day | 2–3 hrs (mostly Learner Lab quirk-hunting) |
| Showcase day | <1 hr |

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | HTTP-only ALB (no ACM) | Learner Lab typically has no owned domain; HTTPS deferrable for showcase demo |
| 2 | `desired_count=1` | Budget + simplicity; brief downtime during deploy acceptable for showcase |
| 3 | Gitignore `*.tfstate*`, `.terraform/`, `*.tfvars`; commit `*.example.tfvars` | Standard terraform hygiene; creds never reach git |
| 4 | Bundled SPA (`SERVE_FRONTEND=true`) not S3/CloudFront | Zero backend delta, no CORS surgery, trivial Fly ↔ AWS parity |
| 5 | Token streaming deferred | Scope guard; current collect-then-emit works |
| 6 | Showcase scale target: ≤10 concurrent | Fly load-test (#143) shows Postgres pool saturates at 20u (p99=90s, 14.9% fail); `desired_count=1` + `db.t4g.micro` is demo-appropriate, not a production ceiling |

---

## Modification History

| Date | Version | Changes |
|---|---|---|
| 2026-04-18 | v1 | Initial plan: parallel AWS track (us-west-2, Learner Lab), bundled SPA + ALB + Fargate + RDS + ElastiCache + SSM, HTTP-only demo, apply/destroy showcase cadence |
| 2026-04-19 | v1.1 | Rebased on main; noted asyncpg ssl fix (#142) strengthens RDS connection story; added scale-target decision row citing #143 load-test findings |
