# Fly.io deploy runbook — SGA V2 demo

Issue #133 · tracker #131 · Fly app `sga-v2` · region `sjc` (closest active Fly region to the Vancouver user base; `yvr` was retired by Fly in 2026).

The repo-root `Dockerfile` produces a single image that serves both the Vite/React SPA and the FastAPI backend from the same origin. `fly.toml` sets `SERVE_FRONTEND=true` so the backend mounts `/app/static` at `/`; CORS middleware is off.

## One-time setup

These commands bootstrap the app, Postgres, Redis (Upstash), and secrets. Run them once; repeated deploys only need step 4.

```bash
# 1. Auth (per shell)
fly auth login

# 2. App + Postgres
fly apps create sga-v2 --org personal
fly postgres create --name sga-v2-db --region sjc --vm-size shared-cpu-1x --volume-size 1
fly postgres attach sga-v2-db --app sga-v2          # sets DATABASE_URL automatically

# 3. Redis (DEFERRED) — Upstash free plan retired 2026; only PAYG remains. The
# agent cache at src/ai/cache/client.py falls through cleanly when REDIS_URL is
# unset, so Redis is optional for the demo. To wire later:
#   fly redis create --name sga-v2-cache --org personal --region sjc
# then set REDIS_URL with the returned connection string and redeploy.

# 4. Secrets — paste from local .env (OPENROUTER_API_KEY required; JWT_SECRET >= 32 bytes)
fly secrets set \
  OPENROUTER_API_KEY="sk-or-..." \
  JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \
  --app sga-v2
```

## Deploy

```bash
# 5. Deploy (re-run on every PR merge to main that touches Dockerfile-tracked paths)
# --remote-only uses Fly's builder, so local Docker is not required.
fly deploy --app sga-v2 --remote-only
```

## Verify

```bash
# 6. Smoke
curl -i https://sga-v2.fly.dev/health         # → 200 {"status":"ok"}
curl -I https://sga-v2.fly.dev/               # → 200, serves SPA shell
fly logs --app sga-v2 | head -100              # confirm alembic INFO lines + startup log

# One-shot eval smoke (PR 5 adds scripts/verify-chat-flow.py --base-url; until then:)
SGA_EVAL_BASE_URL=https://sga-v2.fly.dev \
  cd evals/phase2 && uv run python provider.py smoke
```

## Acceptance checks (must hold before declaring PR 4 done)

- [ ] `curl https://sga-v2.fly.dev/health` → 200 `{"status":"ok"}`
- [ ] `curl https://sga-v2.fly.dev/` → 200 with SPA HTML (contains `<div id="root">`)
- [ ] `fly logs` shows `alembic.runtime.migration` INFO lines on first boot
- [ ] `fly logs` shows `cache.hit` lines when replaying a recent `/chat` call (requires Redis — deferred, see step 3)
- [ ] `fly status --app sga-v2` shows healthy machines in region `sjc`

## Halt-on-failure

Per plan §PR 4: **if `fly deploy` fails 3 times, halt and preserve infra.** Do NOT run `fly destroy` — debugging a broken deploy requires the volumes/secrets that were already created. Ask the human before tearing anything down.

## Rollback

```bash
fly releases --app sga-v2            # list releases
fly releases rollback <version> \
  --app sga-v2                        # point traffic at a prior image
```

## Common diagnostics

| Symptom | Likely cause | Command |
|---|---|---|
| Health check failing | Alembic migration error on boot | `fly logs --app sga-v2 \| grep -i "alembic\|error"` |
| 502 on `/` | Uvicorn crashed / config check raised | `fly ssh console --app sga-v2` |
| `SGA_AUTH_MODE must be prod` | `fly.toml` env not applied | `fly config show --app sga-v2` |
| `OPENROUTER_API_KEY must be set` | Secret not pushed | `fly secrets list --app sga-v2` |
| Missing `REDIS_URL` | Redis intentionally deferred | Cache falls through; attach later via `fly redis create` |
| `DATABASE_URL` points at wrong DB | Postgres not attached | `fly postgres attach sga-v2-db --app sga-v2` |

## Env / secret matrix

| Var | Source | Required |
|---|---|---|
| `DATABASE_URL` | `fly postgres attach` | yes |
| `REDIS_URL` | `fly redis create` (deferred) | no — cache falls through when unset |
| `OPENROUTER_API_KEY` | `fly secrets set` | yes |
| `JWT_SECRET` | `fly secrets set` | yes (prod mode) |
| `SERVE_FRONTEND=true` | `fly.toml [env]` | yes |
| `SGA_AUTH_MODE=prod` | `fly.toml [env]` | yes |
| `FRONTEND_STATIC_DIR` | default `/app/static` | no (leave default) |
| `PORT` | Fly injects | no |

## Cost posture (baseline)

- 1× shared-cpu-1x × 1024 MB (auto-stop) — free tier when idle.
- `sga-v2-db` (Postgres): shared-cpu-1x + 1 GB volume — ~$1.94/mo.
- `sga-v2-cache` (Upstash, deferred): PAYG only as of 2026 — ~$0.20 per 100 K commands. Skipped for demo; re-add via `fly redis create` when usage justifies it.
- Egress via Fly: negligible at demo scale.

Scale up via `fly scale vm shared-cpu-2x --memory 2048 --app sga-v2` if PR 5 load test exceeds the baseline.
