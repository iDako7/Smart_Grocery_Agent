"""Journey 1 end-to-end verification harness for SGA V2.

Drives the full Journey 1 flow (Home → Clarify → Recipes → Grocery → Save) via
HTTP against the live local stack and prints PASS/FAIL for each "Must be true"
item from docs/00-specs/product-spec-v2.md §3.

Usage:
    python scripts/verify-chat-flow.py [--verbose] [--cleanup] [--base-url URL]

Prereq: bun run dev (backend on :8000, Postgres on :5432)
Deps: httpx, asyncpg (both are project deps — no new packages needed)
"""

import argparse
import asyncio
import json
import os
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import NamedTuple

import asyncpg
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


def _asyncpg_url() -> str:
    """Return asyncpg-compatible URL from DATABASE_URL env var."""
    raw = os.environ.get("DATABASE_URL", "postgresql+asyncpg://sga:sga_dev@localhost:5432/sga")
    url = raw.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("@db:", "@localhost:")
    return url


# ---------------------------------------------------------------------------
# Check + color helpers
# ---------------------------------------------------------------------------


class Check(NamedTuple):
    name: str
    passed: bool
    detail: str = ""


_VERBOSE = False


def _use_color() -> bool:
    return not os.environ.get("NO_COLOR") and sys.stdout.isatty()


def _green(s: str) -> str:
    return f"\033[32m{s}\033[0m" if _use_color() else s


def _red(s: str) -> str:
    return f"\033[31m{s}\033[0m" if _use_color() else s


def _yellow(s: str) -> str:
    return f"\033[33m{s}\033[0m" if _use_color() else s


def _bold(s: str) -> str:
    return f"\033[1m{s}\033[0m" if _use_color() else s


def _print_check(c: Check) -> None:
    icon = _green("PASS") if c.passed else _red("FAIL")
    if "[EXPECTED FAIL" in c.name:
        icon = _yellow("WARN")
    print(f"  [{icon}] {c.name}")
    if c.detail and (not c.passed or _VERBOSE):
        for line in c.detail.splitlines():
            print(f"         {line}")


def _section(title: str) -> None:
    print()
    print(_bold(f"── {title}"))


# ---------------------------------------------------------------------------
# Shared context
# ---------------------------------------------------------------------------


@dataclass
class Ctx:
    client: httpx.AsyncClient
    pg: asyncpg.Connection
    # populated during the run
    session_id: str = ""
    turn1_events: list[dict] = field(default_factory=list)
    turn2_events: list[dict] = field(default_factory=list)
    recipes: list[dict] = field(default_factory=list)
    grocery_id: str = ""


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


async def _stream_sse(ctx: Ctx, url: str, body: dict) -> list[dict]:
    """POST to url with body, stream SSE, return list of parsed event dicts."""
    events: list[dict] = []
    current_type: str | None = None
    current_data: str | None = None

    async with ctx.client.stream("POST", url, json=body) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if _VERBOSE:
                print(f"         [raw] {line!r}")
            if line.startswith("event:"):
                current_type = line[6:].strip()
            elif line.startswith("data:"):
                current_data = line[5:].strip()
            elif line == "":
                if current_data is not None:
                    try:
                        payload = json.loads(current_data)
                        # SSE `event:` type takes priority over in-payload event_type
                        payload["_type"] = current_type or payload.get("event_type", "")
                        events.append(payload)
                    except json.JSONDecodeError:
                        pass
                current_type = None
                current_data = None

    return events


def _of_type(events: list[dict], event_type: str) -> list[dict]:
    return [e for e in events if e.get("_type") == event_type]


# ---------------------------------------------------------------------------
# Step 0 — Preflight
# ---------------------------------------------------------------------------


async def step0_preflight(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []

    try:
        r = await ctx.client.get("/health")
        checks.append(Check("Backend reachable (GET /health)", r.status_code == 200, f"HTTP {r.status_code}"))
    except httpx.ConnectError as exc:
        checks.append(
            Check(
                "Backend reachable (GET /health)",
                False,
                f"Connection refused — is 'bun run dev' running?\n{exc}",
            )
        )

    try:
        val = await ctx.pg.fetchval("SELECT 1")
        checks.append(Check("PostgreSQL reachable (SELECT 1)", val == 1, ""))
    except Exception as exc:
        checks.append(Check("PostgreSQL reachable (SELECT 1)", False, str(exc)))

    return checks


# ---------------------------------------------------------------------------
# Step 1 — Create session
# ---------------------------------------------------------------------------


async def step1_create_session(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    r = await ctx.client.post("/session", json={"initial_message": None})
    checks.append(Check("POST /session → 201", r.status_code == 201, f"HTTP {r.status_code}"))
    if r.status_code == 201:
        data = r.json()
        sid = data.get("session_id", "")
        try:
            uuid.UUID(sid)
            ctx.session_id = sid
            checks.append(Check("session_id is a valid UUID", True, sid))
        except ValueError:
            checks.append(Check("session_id is a valid UUID", False, f"got {sid!r}"))
    return checks


# ---------------------------------------------------------------------------
# Step 2 — Turn 1: home screen message
# ---------------------------------------------------------------------------


async def step2_turn1_chat(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    if not ctx.session_id:
        return [Check("Turn 1 SSE stream", False, "Skipped — no session_id from step 1")]

    ctx.turn1_events = await _stream_sse(
        ctx,
        f"/session/{ctx.session_id}/chat",
        {"message": "BBQ for 8, I have pork belly and burger patties", "screen": "home"},
    )
    events = ctx.turn1_events

    # Must-be-true #1: AI responses stream via SSE (≥2 events before done)
    non_done = [e for e in events if e.get("_type") != "done"]
    checks.append(
        Check(
            f"#1 SSE streaming: ≥2 events received before done (got {len(non_done)})",
            len(non_done) >= 2,
            f"event types: {[e.get('_type') for e in non_done]}",
        )
    )

    # Must-be-true #2: pcsv_update event with structured gap data
    pcsv_events = _of_type(events, "pcsv_update")
    if pcsv_events:
        pcsv = pcsv_events[0].get("pcsv", {})
        has_all_roles = all(k in pcsv for k in ("protein", "carb", "veggie", "sauce"))
        valid_statuses = all(
            pcsv.get(r, {}).get("status") in ("gap", "low", "ok") for r in ("protein", "carb", "veggie", "sauce")
        )
        checks.append(
            Check(
                "#2 pcsv_update has protein/carb/veggie/sauce with valid status",
                has_all_roles and valid_statuses,
                f"roles_present={has_all_roles}, valid_statuses={valid_statuses}",
            )
        )
        gap_roles = [r for r in ("protein", "carb", "veggie", "sauce") if pcsv.get(r, {}).get("status") == "gap"]
        checks.append(
            Check(
                f"#2 pcsv_update has at least one gap indicator (got: {gap_roles})",
                len(gap_roles) > 0,
                "BBQ-with-only-meat input should show carb/veggie gaps",
            )
        )
    else:
        checks.append(
            Check(
                "#2 pcsv_update event received",
                False,
                f"event types seen: {[e.get('_type') for e in events]}",
            )
        )

    # Expect a response event (clarify_turn on home screen, or explanation)
    ct = _of_type(events, "clarify_turn")
    ex = _of_type(events, "explanation")
    checks.append(
        Check(
            f"Turn 1 emits clarify_turn or explanation (got ct={len(ct)}, ex={len(ex)})",
            bool(ct or ex),
            "If neither present, issue #87 LLM flakiness may be the cause",
        )
    )

    # done event
    done = _of_type(events, "done")
    if done:
        status = done[0].get("status")
        checks.append(Check("Turn 1 ends with done event", True, f"status={status!r}"))
        if status != "complete":
            checks.append(
                Check(
                    "Turn 1 done.status=complete",
                    False,
                    f"status={status!r}, reason={done[0].get('reason')!r} — likely issue #87 LLM flakiness",
                )
            )
    else:
        checks.append(Check("Turn 1 ends with done event", False, f"types seen: {[e.get('_type') for e in events]}"))

    return checks


# ---------------------------------------------------------------------------
# Step 3 — DB: bug #98 regression check
# ---------------------------------------------------------------------------


async def step3_db_regression(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    if not ctx.session_id:
        return [Check("DB: assistant content", False, "Skipped — no session_id")]

    rows = await ctx.pg.fetch(
        "SELECT id, role, content FROM conversation_turns WHERE session_id=$1 ORDER BY id",
        uuid.UUID(ctx.session_id),
    )
    all_rows = [(r["id"], r["role"], r["content"]) for r in rows]

    checks.append(
        Check(
            f"DB: conversation_turns rows found ({len(all_rows)})",
            len(all_rows) > 0,
            f"roles: {[role for _, role, _ in all_rows]}",
        )
    )

    assistant_rows = [(rid, content) for rid, role, content in all_rows if role == "assistant"]
    empty = [rid for rid, content in assistant_rows if not content]
    checks.append(
        Check(
            f"Bug #98: {len(assistant_rows)} assistant rows all have non-empty content",
            len(empty) == 0,
            f"empty assistant row ids: {empty}" if empty else "",
        )
    )

    return checks


# ---------------------------------------------------------------------------
# Step 4 — Turn 2: clarify → recipes
# ---------------------------------------------------------------------------


async def step4_turn2_chat(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    if not ctx.session_id:
        return [Check("Turn 2 SSE stream", False, "Skipped — no session_id")]

    ctx.turn2_events = await _stream_sse(
        ctx,
        f"/session/{ctx.session_id}/chat",
        {"message": "Looks good, show me recipes. Noodles. Garlic soy.", "screen": "clarify"},
    )
    events = ctx.turn2_events

    recipe_events = _of_type(events, "recipe_card")
    n = len(recipe_events)
    checks.append(
        Check(
            f"Turn 2: recipe_card events received (spec 3–5, got {n})",
            n >= 1,
            f"count={n}",
        )
    )

    valid = sum(1 for e in recipe_events if e.get("recipe", {}).get("id") and e.get("recipe", {}).get("name"))
    checks.append(
        Check(
            f"Turn 2: recipe cards have id + name ({valid}/{n} valid)",
            valid == n and n > 0,
            "",
        )
    )

    ctx.recipes = [e.get("recipe", {}) for e in recipe_events]

    done = _of_type(events, "done")
    if done:
        checks.append(Check("Turn 2 ends with done event", True, f"status={done[0].get('status')!r}"))
    else:
        checks.append(Check("Turn 2 ends with done event", False, f"types seen: {[e.get('_type') for e in events]}"))

    return checks


# ---------------------------------------------------------------------------
# Step 5 — Grocery list (deterministic KB + Other section)
# ---------------------------------------------------------------------------


async def step5_grocery_list(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    if not ctx.session_id:
        return [Check("POST /session/{id}/grocery-list", False, "Skipped — no session_id")]

    # Build items from recipes' ingredients_need + one guaranteed-unmatched synthetic item
    items: list[dict] = []
    for recipe in ctx.recipes:
        rname = recipe.get("name", "")
        rid = recipe.get("id", "")
        for ing in recipe.get("ingredients_need", []):
            items.append({"ingredient_name": ing, "amount": "1 unit", "recipe_name": rname, "recipe_id": rid})

    # Synthetic item: deliberately obscure so it never matches product KB → forces an "Other" entry
    items.append(
        {
            "ingredient_name": "xzqw-synthetic-unmatched-ingredient",
            "amount": "1 tsp",
            "recipe_name": "Synthetic Other Test",
            "recipe_id": "test-other",
        }
    )

    r = await ctx.client.post(f"/session/{ctx.session_id}/grocery-list", json={"items": items})
    checks.append(Check("#5 POST grocery-list → 200", r.status_code == 200, f"HTTP {r.status_code}"))
    if r.status_code != 200:
        return checks

    stores = r.json()

    # #5: response is a list (synchronous, deterministic — not an SSE stream)
    checks.append(
        Check(
            f"#5 Response is list[GroceryStore] (deterministic, {len(stores)} stores)",
            isinstance(stores, list),
            f"type={type(stores).__name__}",
        )
    )

    # #5: items carry recipe attribution
    has_attribution = any(
        item.get("recipe_context")
        for store in stores
        for dept in store.get("departments", [])
        for item in dept.get("items", [])
    )
    checks.append(
        Check(
            "#5 Grocery items have recipe attribution (recipe_context field)",
            has_attribution,
            "At least one item should have recipe_context set",
        )
    )

    # #6: "Other" store present (from synthetic unmatched item)
    store_names = [s.get("store_name") for s in stores]
    other = next((s for s in stores if s.get("store_name") == "Other"), None)
    checks.append(
        Check(
            "#6 'Other' store present for unmatched items",
            other is not None,
            f"stores: {store_names}",
        )
    )

    if other:
        other_names = [item.get("name", "") for dept in other.get("departments", []) for item in dept.get("items", [])]
        checks.append(
            Check(
                "#6 Synthetic unmatched item appears in Other store",
                any("xzqw" in name.lower() for name in other_names),
                f"Other store items: {other_names}",
            )
        )

    return checks


# ---------------------------------------------------------------------------
# Step 6 — Save grocery list (spec §3 "linked pair")
# ---------------------------------------------------------------------------


async def step6_save_grocery_list(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    if not ctx.session_id:
        return [Check("POST /saved/grocery-lists", False, "Skipped — no session_id")]

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    r = await ctx.client.post(
        "/saved/grocery-lists",
        json={"name": f"verify-{ts}", "session_id": ctx.session_id},
    )
    checks.append(Check("#7 POST /saved/grocery-lists → 201", r.status_code == 201, f"HTTP {r.status_code}"))
    if r.status_code != 201:
        return checks

    data = r.json()
    gid = data.get("id", "")
    try:
        uuid.UUID(gid)
        ctx.grocery_id = gid
        checks.append(Check("#7 SavedGroceryList.id is valid UUID", True, gid))
    except ValueError:
        checks.append(Check("#7 SavedGroceryList.id is valid UUID", False, f"got {gid!r}"))

    # Check whether a saved_meal_plans row was created in the last 10 seconds.
    # Spec §3 says "grocery list and associated meal plan persisted as linked pair".
    # Implementation at src/backend/api/saved.py:284-305 only inserts into saved_grocery_lists
    # and creates no saved_meal_plans row. The tables.py schema has no FK linking them.
    # This assertion is expected to FAIL — it is deviation D1.
    recent = await ctx.pg.fetchval(
        "SELECT COUNT(*) FROM saved_meal_plans WHERE user_id=$1 AND created_at > NOW() - INTERVAL '10 seconds'",
        uuid.UUID(DEV_USER_ID),
    )
    checks.append(
        Check(
            "#7 [EXPECTED FAIL D1] Linked meal plan row created alongside grocery list",
            int(recent) > 0,
            f"saved_meal_plans created in last 10s: {recent}. "
            f"Spec §3 Journey 1: 'grocery list and meal plan persisted as linked pair'. "
            f"Implementation gap: saved.py:284-305 inserts only into saved_grocery_lists.",
        )
    )

    return checks


# ---------------------------------------------------------------------------
# Step 7 — Cleanup (optional)
# ---------------------------------------------------------------------------


async def step7_cleanup(ctx: Ctx) -> list[Check]:
    checks: list[Check] = []
    if ctx.grocery_id:
        r = await ctx.client.delete(f"/saved/grocery-lists/{ctx.grocery_id}")
        checks.append(
            Check(
                f"Cleanup DELETE /saved/grocery-lists/{ctx.grocery_id}",
                r.status_code in (200, 204, 404),
                f"HTTP {r.status_code}",
            )
        )
    return checks


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


STEPS = [
    ("Preflight", step0_preflight),
    ("Step 1 — Create session", step1_create_session),
    ("Step 2 — Turn 1: home chat (PCSV + clarify)", step2_turn1_chat),
    ("Step 3 — DB regression check (bug #98)", step3_db_regression),
    ("Step 4 — Turn 2: clarify → recipes", step4_turn2_chat),
    ("Step 5 — Grocery list (KB lookup + Other section)", step5_grocery_list),
    ("Step 6 — Save grocery list (linked pair)", step6_save_grocery_list),
]


async def main(verbose: bool, cleanup: bool, base_url: str) -> int:
    global _VERBOSE
    _VERBOSE = verbose

    pg = await asyncpg.connect(_asyncpg_url())
    all_checks: list[tuple[str, Check]] = []

    async with httpx.AsyncClient(base_url=base_url, timeout=120.0) as client:
        ctx = Ctx(client=client, pg=pg)

        for title, step_fn in STEPS:
            _section(title)
            try:
                checks = await step_fn(ctx)
            except Exception as exc:
                checks = [Check(f"Step error: {exc}", False, repr(exc))]
            for c in checks:
                _print_check(c)
                all_checks.append((title, c))

        if cleanup:
            _section("Step 7 — Cleanup")
            for c in await step7_cleanup(ctx):
                _print_check(c)

    await pg.close()

    # Summary
    print()
    print(_bold("── Summary"))
    passed = sum(1 for _, c in all_checks if c.passed)
    total = len(all_checks)
    expected_fail_count = sum(1 for _, c in all_checks if "EXPECTED FAIL" in c.name)
    unexpected_fails = [(s, c) for s, c in all_checks if not c.passed and "EXPECTED FAIL" not in c.name]

    print(f"  Checks passed: {_green(str(passed))} / {total}  (expected failures: {expected_fail_count})")
    if unexpected_fails:
        print(f"  {_red(str(len(unexpected_fails)) + ' UNEXPECTED FAIL(S):')}")
        for section, c in unexpected_fails:
            print(f"    [{section}] {c.name}")
            if c.detail:
                for line in c.detail.splitlines():
                    print(f"      {line}")
    else:
        print(f"  {_green('No unexpected failures.')}")

    if ctx.session_id:
        print()
        print(f"  session_id : {ctx.session_id}")
        sid = ctx.session_id
        print(
            f"  psql query : SELECT id, role, LEFT(content,80) AS content"
            f" FROM conversation_turns WHERE session_id='{sid}' ORDER BY id;"
        )

    return 0 if not unexpected_fails else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Journey 1 end-to-end verification — SGA V2")
    parser.add_argument("--verbose", action="store_true", help="Print raw SSE lines")
    parser.add_argument("--cleanup", action="store_true", help="Delete saved list after run")
    parser.add_argument(
        "--base-url", default="http://localhost:8000", help="Backend base URL (default: http://localhost:8000)"
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.verbose, args.cleanup, args.base_url)))
