"""Microbench: pure infra latency for /health and POST /session on Fly.io vs AWS.

Tests /health (trivial async return, pure FastAPI + ALB/edge signal) and
POST /session (FastAPI + PostgreSQL write) on both platforms with zero LLM
involvement. Isolates infrastructure latency from model and agent overhead.

Usage:
    python test_a_microbench.py [--target fly|aws|both] [options]

    python test_a_microbench.py --target both
    python test_a_microbench.py --target aws --health-samples 100 --concurrency 10

Env vars required:
    SGA_FLY_URL   Base URL for the Fly.io deployment (e.g. https://sga-v2.fly.dev)
    SGA_AWS_URL   Base URL for the AWS CloudFront deployment (e.g. https://d33hdkvctxckhb.cloudfront.net)

Output:
    evals/infra_comparison/data/test_a_<target>.json  (one file per target)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_S = 30.0

# Resolve output dir relative to this file so the script is runnable from anywhere.
_SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = _SCRIPT_DIR.parent / "data"


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def iso_now() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _percentiles(samples: list[float]) -> dict[str, float]:
    """Compute p50/p95/p99/mean/stdev for a list of float latency values.

    Uses statistics.quantiles(n=100) which requires len >= 1.
    Returns zeros for an empty list rather than raising.
    """
    if not samples:
        return {"p50_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0,
                "mean_ms": 0.0, "stdev_ms": 0.0}
    mean_v = statistics.mean(samples)
    stdev_v = statistics.stdev(samples) if len(samples) > 1 else 0.0
    if len(samples) == 1:
        # quantiles needs at least 2 data points for n=100
        p50 = p95 = p99 = samples[0]
    else:
        qs = statistics.quantiles(samples, n=100)
        # quantiles(n=100) returns 99 cut-points: index 0 = 1st percentile,
        # index 49 = 50th, index 94 = 95th, index 98 = 99th.
        p50 = qs[49]
        p95 = qs[94]
        p99 = qs[98]
    return {
        "p50_ms": round(p50, 1),
        "p95_ms": round(p95, 1),
        "p99_ms": round(p99, 1),
        "mean_ms": round(mean_v, 1),
        "stdev_ms": round(stdev_v, 1),
    }


def _build_phase_stats(raw_samples: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate raw sample records into phase-level stats dict."""
    latencies = [s["latency_ms"] for s in raw_samples if s["error"] is None]
    errors = sum(1 for s in raw_samples if s["error"] is not None)
    n = len(raw_samples)
    error_rate = round(errors / n, 4) if n else 0.0
    stats = _percentiles(latencies)
    return {
        "samples": raw_samples,
        "n": n,
        "error_rate": error_rate,
        **stats,
    }


# ---------------------------------------------------------------------------
# HTTP probing
# ---------------------------------------------------------------------------

def _probe_health(base_url: str, phase: str) -> dict[str, Any]:
    """Single GET /health sample."""
    url = f"{base_url}/health"
    t0 = time.perf_counter()
    error: str | None = None
    status_code = 0
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT_S)
        status_code = resp.status_code
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    return {"latency_ms": latency_ms, "status_code": status_code,
            "error": error, "phase": phase}


def _probe_session(base_url: str, phase: str) -> dict[str, Any]:
    """Single POST /session sample."""
    url = f"{base_url}/session"
    t0 = time.perf_counter()
    error: str | None = None
    status_code = 0
    try:
        resp = requests.post(url, json={}, timeout=REQUEST_TIMEOUT_S,
                             headers={"Content-Type": "application/json"})
        status_code = resp.status_code
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    return {"latency_ms": latency_ms, "status_code": status_code,
            "error": error, "phase": phase}


# ---------------------------------------------------------------------------
# Warmup + serial/concurrent runners
# ---------------------------------------------------------------------------

def _run_serial(probe_fn, base_url: str, n: int, phase: str,
                label: str) -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    for i in range(n):
        rec = probe_fn(base_url, phase)
        samples.append(rec)
        logger.debug("[%s] %s serial %d/%d latency=%.1fms status=%d",
                     label, phase, i + 1, n, rec["latency_ms"], rec["status_code"])
    return samples


def _run_concurrent(probe_fn, base_url: str, n: int, concurrency: int,
                    phase: str, label: str) -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(probe_fn, base_url, phase) for _ in range(n)]
        for i, fut in enumerate(as_completed(futures)):
            rec = fut.result()
            samples.append(rec)
            logger.debug("[%s] %s concurrent %d/%d latency=%.1fms status=%d",
                         label, phase, i + 1, n, rec["latency_ms"], rec["status_code"])
    return samples


# ---------------------------------------------------------------------------
# Per-endpoint benchmark
# ---------------------------------------------------------------------------

def _bench_endpoint(
    probe_fn,
    base_url: str,
    label: str,
    endpoint_name: str,
    n_samples: int,
    concurrency: int,
    n_warmup: int,
) -> dict[str, Any]:
    """Run warmup, serial phase, and concurrent phase for one endpoint."""
    logger.info("[%s] %s warmup (%d calls, discarded) ...",
                label, endpoint_name, n_warmup)
    _run_serial(probe_fn, base_url, n_warmup, "warmup", label)

    logger.info("[%s] %s serial phase (%d samples) ...",
                label, endpoint_name, n_samples)
    serial_raw = _run_serial(probe_fn, base_url, n_samples, "serial", label)

    logger.info("[%s] %s concurrent phase (%d samples, %d workers) ...",
                label, endpoint_name, n_samples, concurrency)
    concurrent_raw = _run_concurrent(
        probe_fn, base_url, n_samples, concurrency, "concurrent", label)

    return {
        "serial": _build_phase_stats(serial_raw),
        "concurrent": _build_phase_stats(concurrent_raw),
    }


# ---------------------------------------------------------------------------
# Single-target runner
# ---------------------------------------------------------------------------

def run_target(
    target: str,
    base_url: str,
    health_samples: int,
    session_samples: int,
    concurrency: int,
    warmup: int,
    out_dir: Path,
) -> dict[str, Any]:
    label = target
    logger.info("=== [%s] Starting microbench -> %s ===", label, base_url)
    run_started_at = iso_now()

    health_results = _bench_endpoint(
        _probe_health, base_url, label, "health",
        health_samples, concurrency, warmup,
    )
    session_results = _bench_endpoint(
        _probe_session, base_url, label, "session",
        session_samples, concurrency, warmup,
    )

    run_finished_at = iso_now()

    payload: dict[str, Any] = {
        "target": target,
        "base_url": base_url,
        "run_started_at": run_started_at,
        "run_finished_at": run_finished_at,
        "config": {
            "health_samples": health_samples,
            "session_samples": session_samples,
            "concurrency": concurrency,
            "warmup": warmup,
        },
        "health": health_results,
        "session": session_results,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"test_a_{target}.json"
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    logger.info("[%s] wrote %s", label, out_path)

    # One-line summary per phase
    for endpoint, results in [("health", health_results), ("session", session_results)]:
        for phase_name in ("serial", "concurrent"):
            p = results[phase_name]
            print(
                f"[{label}] {endpoint} {phase_name} "
                f"p50={p['p50_ms']} p95={p['p95_ms']} p99={p['p99_ms']} "
                f"n={p['n']} err={p['error_rate'] * 100:.1f}%",
                flush=True,
            )

    return payload


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Microbench /health and POST /session on Fly.io vs AWS."
    )
    p.add_argument("--target", choices=["fly", "aws", "both"], default="both",
                   help="Which deployment to test (default: both)")
    p.add_argument("--health-samples", type=int, default=200,
                   help="GET /health samples per phase (default: 200)")
    p.add_argument("--session-samples", type=int, default=50,
                   help="POST /session samples per phase (default: 50)")
    p.add_argument("--concurrency", type=int, default=5,
                   help="ThreadPoolExecutor workers for concurrent phase (default: 5)")
    p.add_argument("--warmup", type=int, default=10,
                   help="Warmup calls per endpoint, discarded from stats (default: 10)")
    p.add_argument("--out-dir", default=str(DATA_DIR),
                   help="Directory to write output JSON files (default: ../data)")
    p.add_argument("--log-level", default="INFO",
                   choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    args = p.parse_args(argv)

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stderr,
    )

    targets: list[tuple[str, str]] = []
    missing: list[str] = []

    if args.target in ("fly", "both"):
        url = os.environ.get("SGA_FLY_URL", "").rstrip("/")
        if not url:
            missing.append("SGA_FLY_URL")
        else:
            targets.append(("fly", url))

    if args.target in ("aws", "both"):
        url = os.environ.get("SGA_AWS_URL", "").rstrip("/")
        if not url:
            missing.append("SGA_AWS_URL")
        else:
            targets.append(("aws", url))

    if missing:
        print(
            f"ERROR: required environment variable(s) not set: {', '.join(missing)}\n"
            "  export SGA_FLY_URL=https://sga-v2.fly.dev\n"
            "  export SGA_AWS_URL=https://d33hdkvctxckhb.cloudfront.net",
            file=sys.stderr,
        )
        return 1

    out_dir = Path(args.out_dir)

    for target_name, base_url in targets:
        run_target(
            target=target_name,
            base_url=base_url,
            health_samples=args.health_samples,
            session_samples=args.session_samples,
            concurrency=args.concurrency,
            warmup=args.warmup,
            out_dir=out_dir,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
