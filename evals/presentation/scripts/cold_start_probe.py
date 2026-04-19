"""Cold-vs-warm start probe for the SGA V2 Fly deployment.

Fly auto-suspends idle machines, so the first request after idle pays a
machine-resume penalty (we observed ~7.7s on a cold GET /). This script
forces cold conditions (sleep > Fly grace) between samples to quantify the
delta vs back-to-back warm samples.

Run from repo root:
    loadtest/.venv/bin/python evals/presentation/scripts/cold_start_probe.py [flags]

Per sample: POST /session, then POST /session/{id}/chat with a fixed short
message. Records session_create_ms (TTFB on /session), ttfe_ms (ms from
/chat start to first parsed SSE event), ttd_ms (ms to `event: done`). All
N cold samples run first, then N warm samples back-to-back.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

CHAT_MESSAGE = "chicken broccoli dinner for 2"
SESSION_TIMEOUT_S = 30.0
CHAT_CONNECT_TIMEOUT_S = 30.0
CHAT_READ_TIMEOUT_S = 120.0


def _parse_sse_stream(body_iter, start: float) -> tuple[float | None, float | None]:
    """Line-by-line SSE parse mirroring loadtest/locustfile.py.

    Latches first_event_at on the blank-line flush of the first fully-
    assembled event, latches done_at when the `done` event flushes.
    """
    first_event_at: float | None = None
    done_at: float | None = None
    current_type: str | None = None
    current_data: str | None = None

    for raw in body_iter:
        line = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        if line.startswith("event:"):
            current_type = line[len("event:"):].strip()
        elif line.startswith("data:"):
            current_data = line[len("data:"):].strip()
        elif line == "":
            if current_data is not None:
                if first_event_at is None:
                    first_event_at = time.perf_counter()
                try:
                    payload: Any = json.loads(current_data)
                except json.JSONDecodeError:
                    payload = None
                if current_type == "done" and payload is not None:
                    done_at = time.perf_counter()
            current_type = None
            current_data = None
            if done_at is not None:
                break

    ttfe_ms = (first_event_at - start) * 1000.0 if first_event_at is not None else None
    ttd_ms = (done_at - start) * 1000.0 if done_at is not None else None
    return ttfe_ms, ttd_ms


def _sleep_with_progress(seconds: float, label: str) -> None:
    """Visible countdown so 6-min sleeps don't look hung."""
    end = time.monotonic() + seconds
    while True:
        remaining = end - time.monotonic()
        if remaining <= 0:
            break
        mins, secs = divmod(int(remaining), 60)
        print(f"\r  {label} sleeping {mins:02d}:{secs:02d} ...", end="", flush=True)
        time.sleep(min(1.0, remaining))
    print(f"\r  {label} sleep done.            ")


def _print_summary(kind: str, index: int, total: int, rec: dict[str, Any]) -> None:
    def f(v: float | None) -> str:
        return f"{int(v)}ms" if v is not None else "----"
    line = (f"[{kind} {index + 1}/{total}] session={f(rec['session_create_ms'])} "
            f"ttfe={f(rec['ttfe_ms'])} ttd={f(rec['ttd_ms'])}")
    if not rec["ok"]:
        line += f" ERROR: {rec['error']}"
    print(line, flush=True)


def _run_sample(base_url: str, index: int, kind: str, total: int) -> dict[str, Any]:
    rec: dict[str, Any] = {"index": index, "kind": kind, "session_create_ms": None,
                           "ttfe_ms": None, "ttd_ms": None, "ok": False, "error": None}
    try:
        s_start = time.perf_counter()
        s_resp = requests.post(f"{base_url}/session", json={"initial_message": None},
                               timeout=SESSION_TIMEOUT_S)
        rec["session_create_ms"] = round((time.perf_counter() - s_start) * 1000.0, 1)

        if s_resp.status_code != 201:
            rec["error"] = f"POST /session returned {s_resp.status_code}"
            _print_summary(kind, index, total, rec)
            return rec
        try:
            session_id = s_resp.json()["session_id"]
        except (ValueError, KeyError) as exc:
            rec["error"] = f"malformed /session response: {exc}"
            _print_summary(kind, index, total, rec)
            return rec

        c_start = time.perf_counter()
        with requests.post(
            f"{base_url}/session/{session_id}/chat",
            json={"message": CHAT_MESSAGE, "screen": "home"},
            stream=True,
            timeout=(CHAT_CONNECT_TIMEOUT_S, CHAT_READ_TIMEOUT_S),
        ) as c_resp:
            if c_resp.status_code != 200:
                rec["error"] = f"POST /chat returned {c_resp.status_code}"
                _print_summary(kind, index, total, rec)
                return rec
            ctype = c_resp.headers.get("Content-Type", "")
            if "text/event-stream" not in ctype:
                rec["error"] = f"unexpected Content-Type: {ctype!r}"
                _print_summary(kind, index, total, rec)
                return rec
            ttfe_ms, ttd_ms = _parse_sse_stream(c_resp.iter_lines(), c_start)

        if ttfe_ms is None:
            rec["error"] = "SSE stream had no parseable events"
        elif ttd_ms is None:
            rec["ttfe_ms"] = round(ttfe_ms, 1)
            rec["error"] = "SSE stream ended without a `done` event"
        else:
            rec["ttfe_ms"] = round(ttfe_ms, 1)
            rec["ttd_ms"] = round(ttd_ms, 1)
            rec["ok"] = True

    except requests.RequestException as exc:
        rec["error"] = f"{type(exc).__name__}: {exc}"
    except Exception as exc:  # noqa: BLE001 - keep the loop going on anything
        rec["error"] = f"{type(exc).__name__}: {exc}"

    _print_summary(kind, index, total, rec)
    return rec


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--base-url", default="https://sga-v2.fly.dev")
    p.add_argument("--n-cold", type=int, default=5)
    p.add_argument("--n-warm", type=int, default=5)
    p.add_argument("--cold-gap-s", type=int, default=360,
                   help="Sleep before each cold sample (default 360s = 6 min).")
    p.add_argument("--out", default="evals/presentation/data/cold_start.json")
    args = p.parse_args(argv)

    base_url = args.base_url.rstrip("/")
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Sleeps + estimated execution: ~30s/cold call (resume + chat), ~10s/warm call.
    est_seconds = args.n_cold * (args.cold_gap_s + 30) + args.n_warm * 10
    est_minutes = est_seconds / 60.0
    print(f"cold-start probe -> {base_url}")
    print(f"  cold samples: {args.n_cold} (sleep {args.cold_gap_s}s + ~30s exec each)")
    print(f"  warm samples: {args.n_warm} (~10s exec each)")
    print(f"  estimated runtime: ~{est_minutes:.0f}m total")
    print(f"  output: {out_path}\n")

    started_at = datetime.now(timezone.utc).isoformat()
    calls: list[dict[str, Any]] = []

    for i in range(args.n_cold):
        _sleep_with_progress(args.cold_gap_s, f"cold {i + 1}/{args.n_cold}")
        calls.append(_run_sample(base_url, i, "cold", args.n_cold))

    for i in range(args.n_warm):
        calls.append(_run_sample(base_url, i, "warm", args.n_warm))

    payload = {
        "config": {
            "base_url": base_url,
            "cold_gap_s": args.cold_gap_s,
            "n_cold": args.n_cold,
            "n_warm": args.n_warm,
            "started_at": started_at,
        },
        "calls": calls,
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"\nwrote {len(calls)} samples to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
