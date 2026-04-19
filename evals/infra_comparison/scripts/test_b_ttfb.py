"""TTFB and download time for SPA root HTML and largest hashed JS chunk.

Measures CloudFront edge vs Fly Anycast edge performance by probing the
frontend assets served from each deployment. No LLM involvement.

Usage:
    python test_b_ttfb.py [--target fly|aws|both] [options]

    python test_b_ttfb.py --target both
    python test_b_ttfb.py --target aws --samples 30 --warmup 5

Env vars required:
    SGA_FLY_URL   Base URL for the Fly.io deployment (e.g. https://sga-v2.fly.dev)
    SGA_AWS_URL   Base URL for the AWS CloudFront deployment (e.g. https://d33hdkvctxckhb.cloudfront.net)

Output:
    evals/infra_comparison/data/test_b_<target>.json  (one file per target)

Sub-tests per target:
    B1 - root HTML: repeated GETs of <base>/ measuring TTFB and total download time.
    B2 - JS chunk:  first /assets/*.js discovered from root HTML, then repeated GETs.

TTFB measurement uses stream=True + raw.read(1) to separate time-to-first-byte
from total download time, rather than relying on response.elapsed which captures
only the server-side processing portion reported in headers.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_S = 30.0

_SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = _SCRIPT_DIR.parent / "data"


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def iso_now() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _percentiles(samples: list[float]) -> dict[str, float]:
    """Compute p50/p95/p99 for a list of float values using stdlib only."""
    if not samples:
        return {"p50": 0.0, "p95": 0.0, "p99": 0.0}
    if len(samples) == 1:
        return {"p50": samples[0], "p95": samples[0], "p99": samples[0]}
    qs = statistics.quantiles(samples, n=100)
    return {
        "p50": round(qs[49], 1),
        "p95": round(qs[94], 1),
        "p99": round(qs[98], 1),
    }


# ---------------------------------------------------------------------------
# TTFB probe
# ---------------------------------------------------------------------------

def _probe_ttfb(url: str) -> dict[str, Any]:
    """GET url with stream=True; read 1 byte to latch TTFB, drain for total time.

    Returns:
        ttfb_ms:   ms from request start to first byte received
        total_ms:  ms from request start to last byte received
        status:    HTTP status code
        bytes:     total content-length in bytes (from header, or bytes read)
        error:     None on success, str on failure
    """
    t0 = time.perf_counter()
    error: str | None = None
    ttfb_ms: float = 0.0
    total_ms: float = 0.0
    status: int = 0
    content_bytes: int = 0

    try:
        with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT_S) as resp:
            status = resp.status_code
            iterator = resp.iter_content(chunk_size=8192, decode_unicode=False)
            first_chunk = next(iterator, b"")
            ttfb_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            content_bytes += len(first_chunk)
            for chunk in iterator:
                content_bytes += len(chunk)
            total_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        total_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        if ttfb_ms == 0.0:
            ttfb_ms = total_ms

    return {
        "ttfb_ms": ttfb_ms,
        "total_ms": total_ms,
        "status": status,
        "bytes": content_bytes,
        "error": error,
    }


# ---------------------------------------------------------------------------
# JS chunk discovery
# ---------------------------------------------------------------------------

def _discover_js_chunk(base_url: str) -> tuple[str | None, str]:
    """Fetch root HTML and extract first /assets/*.js script src.

    Returns (absolute_url_or_None, raw_html).
    """
    root_url = f"{base_url}/"
    try:
        resp = requests.get(root_url, timeout=REQUEST_TIMEOUT_S)
        html = resp.text
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not fetch root HTML for JS discovery: %s", exc)
        return None, ""

    # Match <script src="/assets/xxx.js"> or <script type="module" src="...">
    srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
    for src in srcs:
        if "/assets/" in src and src.endswith(".js"):
            if src.startswith("http"):
                return src, html
            return f"{base_url}{src}", html

    # Fallback: any .js asset link in the HTML
    all_js = re.findall(r'["\'](/assets/[^"\']+\.js)["\']', html)
    if all_js:
        return f"{base_url}{all_js[0]}", html

    logger.warning("No /assets/*.js found in root HTML for %s", base_url)
    return None, html


# ---------------------------------------------------------------------------
# Single-asset benchmark runner
# ---------------------------------------------------------------------------

def _run_asset_samples(
    url: str,
    n_samples: int,
    n_warmup: int,
    label: str,
    asset_name: str,
) -> tuple[list[dict[str, Any]], str | None, str | None]:
    """Run warmup + n_samples probes for a single URL.

    Returns (kept_samples, cache_control_header, x_cache_header).
    Cache headers are latched from the last successful response.
    We can't get headers from _probe_ttfb (uses stream raw), so we do one
    extra HEAD/GET at the end to read headers without distorting timing.
    """
    logger.info("[%s] %s warmup (%d calls, discarded) ...", label, asset_name, n_warmup)
    for _ in range(n_warmup):
        _probe_ttfb(url)

    logger.info("[%s] %s serial phase (%d samples) ...", label, asset_name, n_samples)
    samples: list[dict[str, Any]] = []
    for i in range(n_samples):
        rec = _probe_ttfb(url)
        samples.append(rec)
        logger.debug("[%s] %s %d/%d ttfb=%.1fms total=%.1fms status=%d",
                     label, asset_name, i + 1, n_samples,
                     rec["ttfb_ms"], rec["total_ms"], rec["status"])

    # Read cache headers from a lightweight GET (headers only for assets, full for root)
    cache_control: str | None = None
    x_cache: str | None = None
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT_S,
                         headers={"Accept": "text/html,application/xhtml+xml,*/*"})
        cache_control = r.headers.get("cache-control") or r.headers.get("Cache-Control")
        x_cache = r.headers.get("x-cache") or r.headers.get("X-Cache")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[%s] could not read cache headers for %s: %s", label, url, exc)

    return samples, cache_control, x_cache


def _aggregate_asset(
    url: str,
    samples: list[dict[str, Any]],
    cache_control: str | None,
    x_cache: str | None,
    discovered_from: str | None = None,
) -> dict[str, Any]:
    """Build the per-asset stats dict matching the output schema."""
    ok_samples = [s for s in samples if s["error"] is None]
    ttfbs = [s["ttfb_ms"] for s in ok_samples]
    totals = [s["total_ms"] for s in ok_samples]
    ttfb_p = _percentiles(ttfbs)
    total_p = _percentiles(totals)

    result: dict[str, Any] = {
        "url": url,
        "samples": samples,
        "ttfb_p50_ms": ttfb_p["p50"],
        "ttfb_p95_ms": ttfb_p["p95"],
        "ttfb_p99_ms": ttfb_p["p99"],
        "total_p50_ms": total_p["p50"],
        "total_p95_ms": total_p["p95"],
        "cache_control_header": cache_control,
        "x_cache_header": x_cache,
    }
    if discovered_from is not None:
        result["discovered_from"] = discovered_from

    return result


# ---------------------------------------------------------------------------
# Single-target runner
# ---------------------------------------------------------------------------

def run_target(
    target: str,
    base_url: str,
    samples: int,
    warmup: int,
    out_dir: Path,
) -> dict[str, Any]:
    label = target
    logger.info("=== [%s] Starting TTFB bench -> %s ===", label, base_url)
    run_started_at = iso_now()

    # --- B1: root HTML ---
    root_url = f"{base_url}/"
    root_samples, root_cc, root_xc = _run_asset_samples(
        root_url, samples, warmup, label, "root HTML"
    )
    root_result = _aggregate_asset(root_url, root_samples, root_cc, root_xc)

    # --- B2: JS chunk ---
    logger.info("[%s] Discovering JS chunk from %s ...", label, root_url)
    chunk_url, _html = _discover_js_chunk(base_url)

    if chunk_url:
        logger.info("[%s] Found JS chunk: %s", label, chunk_url)
        chunk_samples, chunk_cc, chunk_xc = _run_asset_samples(
            chunk_url, samples, warmup, label, "JS chunk"
        )
        chunk_result = _aggregate_asset(
            chunk_url, chunk_samples, chunk_cc, chunk_xc, discovered_from="/"
        )
    else:
        logger.warning("[%s] No JS chunk discovered; js_chunk section will be null.", label)
        chunk_result = None

    run_finished_at = iso_now()

    payload: dict[str, Any] = {
        "target": target,
        "base_url": base_url,
        "run_started_at": run_started_at,
        "run_finished_at": run_finished_at,
        "config": {"samples": samples, "warmup": warmup},
        "root": root_result,
        "js_chunk": chunk_result,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"test_b_{target}.json"
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    logger.info("[%s] wrote %s", label, out_path)

    # One-line summary
    root_size_kb = round(
        statistics.mean([s["bytes"] for s in root_samples if s["error"] is None]) / 1024, 1
    ) if any(s["error"] is None for s in root_samples) else 0.0

    chunk_summary = ""
    if chunk_result:
        chunk_size_kb = round(
            statistics.mean(
                [s["bytes"] for s in chunk_result["samples"] if s["error"] is None]
            ) / 1024, 1
        ) if any(s["error"] is None for s in chunk_result["samples"]) else 0.0
        chunk_summary = (
            f"; chunk ttfb p50={chunk_result['ttfb_p50_ms']}ms "
            f"size={chunk_size_kb}KB "
            f"cache-control={chunk_result['cache_control_header']!r}"
        )

    print(
        f"[{label}] root ttfb p50={root_result['ttfb_p50_ms']}ms "
        f"size={root_size_kb}KB "
        f"cache-control={root_result['cache_control_header']!r}"
        f"{chunk_summary}",
        flush=True,
    )

    return payload


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="TTFB and download time for SPA root HTML and JS chunk on Fly vs AWS."
    )
    p.add_argument("--target", choices=["fly", "aws", "both"], default="both",
                   help="Which deployment to test (default: both)")
    p.add_argument("--samples", type=int, default=20,
                   help="Samples per asset per target (default: 20)")
    p.add_argument("--warmup", type=int, default=3,
                   help="Warmup calls per asset, discarded from stats (default: 3)")
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
            samples=args.samples,
            warmup=args.warmup,
            out_dir=out_dir,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
