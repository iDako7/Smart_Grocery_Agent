# Phase 3 Demo Deploy — Implementation Plan

**Tracker:** #131
**Created:** 2026-04-18
**Status:** Approved, ready for execution

## Goal

Ship SGA V2 to `sga-v2.fly.dev` for a one-week demo to recruiters and professors, after closing the integration-test gap from #100.

## Execution model

**Pattern: D (front-loaded plan) + A (structured execution per PR), with C (opportunistic sub-agents) inside.**
This document is the front-loaded plan. Per-PR `/plan` calls are scope-confirmation passes, not from-scratch design.

**Per-PR workflow — conditional, not blind chain:**

| PR | `/plan` (scope confirm) | `/tdd` | Main-thread impl | `/build-fix` | `/code-review` | `/verify` |
|---|---|---|---|---|---|---|
| 1 integration tests | ✅ | ✅ TDD-shaped | ✅ | only if build breaks | ✅ post-commit | ✅ |
| 2 contract tests | ✅ | ✅ TDD-shaped | ✅ | conditional | ✅ | ✅ |
| 3 Dockerfile + main.py | ✅ + Explore for route audit | ❌ infra | ✅ | likely (Docker) | ✅ | ✅ |
| 4 fly.toml + runbook | ✅ | ❌ config | ✅ | n/a | ✅ | manual smoke |
| 5 locust + script | ✅ | partial | ✅ | conditional | ✅ | ✅ load run |

**Sub-agent usage (Pattern C, opportunistic):**
- `Explore` — for codebase unknowns (e.g., PR 3 route prefix audit before changing Dockerfile/main.py).
- `code-reviewer` — after each chunky commit, before opening PR.
- `build-error-resolver` — only when build actually breaks (not preemptively).
- **Reject Pattern B** (Opus orchestrator + parallel sub-agents): scope per PR is narrow and stacked; orchestrator loses fidelity; sub-agents can't see each other's work.

**Pause points (hard stops, await human confirm):**
- Before first `fly deploy` (PR 4 mid-flight).
- Before declaring demo shipped (after PR 5 acceptance).

**Halt rules:**
- code-reviewer CRITICAL → halt, fix, resume.
- Fly deploy fails 3× → halt, preserve infra (no `fly destroy`).
- Load acceptance miss on first run → halt, do NOT auto-tune the bar.
- CI failure → see CI failure protocol below (no retry-loop cap; diagnose-don't-retry).

**CI gate per PR (all green, no `--no-verify`):**
`pytest` · `bun test` · `bun run build` · `tsc --noEmit` · `bun run lint`.

### CI failure protocol (replaces "3 retry attempts" rule)

The retry cap was removed because it created pressure to weaken assertions, skip tests, or broaden exception catches just to "make CI green." Replace with **diagnose-don't-retry**:

1. **Read the failing CI log fully** before touching code.
2. **Diagnose root cause** — why did this actually fail?
3. **Fix the root cause** — never weaken the test/code to pass.
4. **Re-push** and use `Monitor` for CI completion notification (background, no polling).
5. **If root cause unclear after one diagnosis pass → HALT** and report the log + your hypothesis. Do not retry-loop.

**Forbidden CI shortcuts (require explicit user approval to use any of these):**
- `@pytest.mark.skip` or `@pytest.mark.xfail` to bypass a failing test
- broadening `except` clauses to swallow errors
- removing or weakening `assert` statements
- lowering `--cov-fail-under` thresholds
- deleting tests labeled "flaky"
- adding `# type: ignore` or `# noqa` to silence type/lint failures
- `--no-verify` on commit (already forbidden)

**Why the pre-PR hook helps:** commit 42cd663 added a hook that runs the full local CI gate before push. By the time CI fails on the remote, it's usually environmental (different Python version, missing service, race) — worth real diagnosis, not a retry.

## Locked decisions

| | |
|---|---|
| Platform | Fly.io (no AWS, no Terraform) |
| Topology | One app, bundled frontend, Fly Postgres, Upstash Redis |
| Machine | `shared-cpu-1x @ 1GB`, region `yvr`, bump to 2GB if memory > 80% under load |
| Domain | `sga-v2.fly.dev` |
| Secrets | Manual `fly secrets set` from local `.env` |
| Auth in load test | `SGA_AUTH_MODE=dev` for load window, then revert |
| `fly` commands | User runs all `fly` CLI; agent generates copy-pasteable commands |
| promptfoo deploy suite | Reuse `evals/phase2` with `SGA_EVAL_BASE_URL=https://sga-v2.fly.dev` |
| Issues #108/#109 rescope | Comment with rescope delta, do not rewrite bodies |

---

## PR 1 · Integration tests (mock_llm + multi-turn composition)

**Issue:** #108 (rescoped via comment) · **Branch:** `test/mock-llm-integration` · **Base:** `main`

### Scope
- New `tests/integration/` directory.
- `tests/integration/conftest.py` with:
  - `mock_llm` fixture — patches `src.ai.orchestrator._get_client` (SDK boundary), returns hand-authored `chat.completions.create` responses from a queue. Pattern modeled on `tests/test_orchestrator_issue_87.py::test_recipes_surface_even_when_terminal_narrative_omits_them`.
  - `client` fixture — `httpx.AsyncClient` with auth + DB overrides, modeled on `tests/test_chat_e2e.py::client`.
  - `_clean_db` autouse fixture — TRUNCATE between tests (option B; commits between turns are required for multi-turn realism).
- 3 multi-turn integration tests in `tests/integration/test_journey_1_chat.py`:
  1. `test_clarify_then_recipes_preserves_context` — **the #98 regression**: 2 `/chat` POSTs, assert turn 2 receives non-empty assistant context from turn 1; assert recipe_card events emit.
  2. `test_clarify_then_recipes_then_remove` — 3 turns; assert remove operation reflected in conversation history (R7).
  3. `test_dietary_restriction_persists_across_turns` — set halal restriction turn 1, verify pork-free recipes turn 2.

### Cleanup
- **Delete** `tests/test_chat_e2e.py` (mocks `run_agent` wholesale — wrong boundary).
- **Keep** `tests/test_clarify_context_text.py`, `tests/test_orchestrator_issue_87.py`, `tests/test_orchestrator_clarify_turn.py`.

### Target shape (verify before PR)
- `tests/integration/conftest.py` exists, exports `mock_llm`, `client`, `_clean_db`.
- `tests/integration/test_journey_1_chat.py` runs 3 tests.
- Old `tests/test_chat_e2e.py` deleted.
- `pytest tests/integration/` passes in < 30s.

### Success metrics
- #98 regression test fails if PR #101's fix is reverted (manual verify locally).
- `pytest tests/integration/` < 30s, no network, no real LLM calls.
- 80% line+branch coverage on `src/ai/orchestrator.py`, `src/backend/api/sessions.py`, `src/ai/context.py` (use `pytest --cov`; backfill with unit tests if integration alone misses).

### Test strategy
TDD red-green: write each test against current code, confirm RED for expected reasons, GREEN after wiring `mock_llm` queue, refactor.

---

## PR 2 · Contract tests (SSE event sequences + boundary guarantees)

**Issue:** #109 (rescoped via comment) · **Branch:** `test/sse-sequences` · **Base:** `test/mock-llm-integration`

### Scope
- Extend `tests/contracts/` (existing dir; current files: `test_clarify_turn.py`, `test_recipe_swap.py`).
- New `tests/contracts/test_sse_emitter_sequences.py`:
  - `test_clarify_result_emits_thinking_pcsv_clarify_done`
  - `test_recipe_curation_emits_thinking_pcsv_recipe_explanation_done`
  - `test_error_result_emits_error_done`
  - `test_partial_result_emits_explanation_done` (max-iter fallback)
- New `tests/contracts/test_history_round_trip.py`:
  - `test_load_context_non_empty_for_clarify_turn` (the #98 boundary)
  - `test_save_turn_preserves_screen_metadata`
  - `test_conversation_history_survives_round_trip`

### Target shape
- Pure functions only — no DB connection, no LLM client, no HTTP.
- For boundary tests that need DB-shaped data, use in-memory dicts that mimic `save_turn` output rather than real connections.
- `pytest tests/contracts/` < 1s.

### Success metrics
- Tests fail immediately on any SSE event-type rename or `AgentResult` field rename.
- Full contracts suite < 1s.

### Test strategy
TDD: write failing assertion, implement minimal helper to satisfy. For sequence tests, build a `Mock` SSE sink, run `emit_agent_result(result)` against it, snapshot the event-type list.

---

## PR 3 · Backend serves frontend build

**Issue:** #132 · **Branch:** `feat/fastapi-serves-frontend` · **Base:** `test/sse-sequences`

### Scope
- New `Dockerfile` at **repo root** (multi-stage):
  - Stage 1: `oven/bun:1` → `bun install` → `bun run build` in `src/frontend/` → outputs `dist/`.
  - Stage 2: `python:3.13-slim` + uv → install backend deps from `src/backend/pyproject.toml` + `uv.lock` → COPY frontend `dist/` to `/app/static` → CMD runs alembic upgrade then uvicorn.
- Modify `src/backend/main.py`:
  - If `os.getenv("SERVE_FRONTEND") == "true"`: mount `StaticFiles(directory="/app/static", html=True)` at `/`, with SPA fallback (404 → index.html for non-`/api/*` paths).
  - If unset/false: no mount (preserves `bun run dev` HMR flow).
- Move all backend routes under `/api/*` prefix **only if not already** — verify by grep first; if routes are at root (`/session`, `/health`), keep them and adjust SPA fallback to whitelist them. **Investigate before changing route shape** (route prefix change is breaking for the frontend client).

### Target shape
- `Dockerfile` at root.
- `docker build -t sga-v2 . && docker run -p 8000:8000 -e SERVE_FRONTEND=true sga-v2` — `curl localhost:8000/health` returns 200, `curl localhost:8000/` returns SPA HTML.
- `bun run dev` still works locally with HMR (no `SERVE_FRONTEND`).
- No CORS middleware active when `SERVE_FRONTEND=true`.

### Success metrics
- Single Docker image serves SPA + API.
- `bun run dev` HMR unchanged.
- `pytest` still green (no test changes expected; if route shape changed, tests need updates).

### Test strategy
- Unit test for the env-gated mount (FastAPI test client; assert `GET /` returns SPA when flag set, 404 when unset).
- Manual `docker run` smoke before pushing.

---

## PR 4 · Fly.io deploy ⏸ *pause before `fly deploy`*

**Issue:** #133 · **Branch:** `feat/fly-deploy` · **Base:** `feat/fastapi-serves-frontend`

### Scope (commit content)
- New `fly.toml` at repo root:
  ```toml
  app = "sga-v2"
  primary_region = "yvr"
  [build]
    dockerfile = "Dockerfile"
  [env]
    SERVE_FRONTEND = "true"
  [http_service]
    internal_port = 8000
    force_https = true
    auto_stop_machines = true
    auto_start_machines = true
    min_machines_running = 0
  [[vm]]
    cpu_kind = "shared"
    cpus = 1
    memory_mb = 1024
  ```
- New `docs/02-notes/fly-deploy-runbook.md` documenting the manual deploy steps (so future-you can repeat).
- Verify Alembic config runs on container start (already in `Dockerfile.dev` CMD; mirror in prod Dockerfile).

### Pause point — generate these commands for user to run, then **HALT**:
```bash
# 1. Auth (one-time per shell)
fly auth login

# 2. App + Postgres + Redis
fly apps create sga-v2 --org personal
fly postgres create --name sga-v2-db --region yvr --vm-size shared-cpu-1x --volume-size 1
fly postgres attach sga-v2-db --app sga-v2  # sets DATABASE_URL automatically
fly ext redis create --name sga-v2-cache --org personal --region yvr --plan free  # Upstash add-on, sets REDIS_URL

# 3. Secrets (paste from local .env)
fly secrets set OPENROUTER_API_KEY="..." JWT_SECRET="..." --app sga-v2

# 4. Deploy
fly deploy --app sga-v2

# 5. Verify
curl https://sga-v2.fly.dev/health
fly logs --app sga-v2
```

### Target shape
- `fly.toml` committed.
- Runbook committed.
- Deploy succeeds (after user runs commands).
- `https://sga-v2.fly.dev/health` returns 200.
- `python scripts/verify-chat-flow.py --base-url https://sga-v2.fly.dev` passes (this flag added in PR 5; for PR 4 acceptance use `SGA_EVAL_BASE_URL=https://sga-v2.fly.dev` against `evals/phase2/provider.py` for one smoke case).

### Success metrics
- Health endpoint 200.
- Alembic migrations applied on first boot (verify `fly logs` shows alembic INFO lines).
- `fly logs` shows `cache.hit` lines on repeat tool calls (Redis wired via `REDIS_URL`).
- No secrets in Docker image (`docker history sga-v2 | grep -i key` is empty) or git history.

### Halt-on-failure
3 deploy failures → halt, report, preserve infra (do not `fly destroy`).

---

## PR 5 · Load test + post-deploy smoke

**Issue:** #134 · **Branch:** `test/load-and-smoke` · **Base:** `feat/fly-deploy`

### Scope
- New `loadtest/locustfile.py` with two `User` classes:
  - `SSEUser` — POST `/session`, then POST `/session/{id}/chat` with SSE streaming; record time-to-first-event and time-to-`done` as Locust custom metrics. Weight 3.
  - `RESTUser` — exercises `GET /session/{id}`, `POST /saved/*`, `GET /saved`. Weight 1.
- `loadtest/README.md` with run command + how to interpret report.
- New `loadtest/run_promptfoo_deploy.sh` — exports `SGA_EVAL_BASE_URL=https://sga-v2.fly.dev` and runs `evals/phase2/promptfooconfig.yaml`.
- Modify `scripts/verify-chat-flow.py` — add `--base-url` argparse flag (default `http://localhost:8000`).

### Auth bypass for load test
- Before load run: user runs `fly secrets set SGA_AUTH_MODE=dev --app sga-v2` and waits for the rolling restart.
- After load run: `fly secrets unset SGA_AUTH_MODE --app sga-v2` to revert.
- Document this clearly in the runbook — single sentence "SGA_AUTH_MODE=dev disables per-user isolation; this is acceptable for the demo load window only."

### Target shape
- `loadtest/locustfile.py` runnable via `locust -f loadtest/locustfile.py --host https://sga-v2.fly.dev --users 10 --spawn-rate 2 --run-time 5m --headless`.
- `python scripts/verify-chat-flow.py --base-url https://sga-v2.fly.dev` exits 0.
- `bash loadtest/run_promptfoo_deploy.sh` reports ≥ 80% pass on the 5 trimmed cases.

### Success metrics (= demo acceptance bar — all 9 must hold)

| # | Metric | Threshold |
|---|---|---|
| 1 | Locust load run | 10 users × 5 min, zero 5xx |
| 2 | p95 time-to-first-event | < 2s |
| 3 | p95 time-to-`done` | < 30s |
| 4 | Redis cache hit ratio | > 0.5 (read from `done.token_usage.cached_tokens / prompt_tokens`) |
| 5 | Fly machine CPU | < 80% during load (`fly metrics`) |
| 6 | Fly machine memory | < 80% during load |
| 7 | Journey 1 smoke | green via `verify-chat-flow.py --base-url` |
| 8 | promptfoo suite | ≥ 80% pass on deployed URL (4/5 cases) |
| 9 | Browser console | no errors on Journey 1 happy path (manual check) |

### Halt-on-failure
First-run miss on any metric → halt, do NOT auto-tune the bar or weaken thresholds.

---

## Demo shipped definition

All 9 PR-5 metrics pass → agent reports → human confirms → URL shared publicly. Until that confirm, treat the URL as private staging.

---

## Out of scope (this delivery)

Token streaming · Playwright + mock-LLM server (#110) · tool-schema caching (#118) · custom domain / TLS · CI/CD pipeline · architecture spec v3 §3 update · cost alerts · autoscaling · multi-region · analytics · staging environment · sustained / soak load · chaos injection.

---

## File map (what gets created/modified)

```
docs/01-plans/phase3-deploy-plan.md       NEW (this file)
docs/02-notes/fly-deploy-runbook.md       NEW (PR 4)

tests/integration/conftest.py             NEW (PR 1)
tests/integration/test_journey_1_chat.py  NEW (PR 1)
tests/test_chat_e2e.py                    DELETE (PR 1)

tests/contracts/test_sse_emitter_sequences.py  NEW (PR 2)
tests/contracts/test_history_round_trip.py     NEW (PR 2)

Dockerfile                                NEW (PR 3, repo root)
src/backend/main.py                       MODIFY (PR 3, env-gated StaticFiles)

fly.toml                                  NEW (PR 4)

loadtest/locustfile.py                    NEW (PR 5)
loadtest/README.md                        NEW (PR 5)
loadtest/run_promptfoo_deploy.sh          NEW (PR 5)
scripts/verify-chat-flow.py               MODIFY (PR 5, --base-url flag)
```
