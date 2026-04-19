#!/usr/bin/env python3
"""Aggregate infra_comparison raw data into a single stats.json for REPORT.md population.

Reads all data/test_*.json files + data/preflight.json; writes data/stats.json.

Output shape:
{
  "generated_at": "ISO8601",
  "preflight": {...},
  "test_a": {
    "fly": {latency fields...},
    "aws": {...},
    "delta": {ratio fields...}
  },
  "test_b": {...},
  "test_d": {...},
  "test_h": {...}
}

Run from repo root:
    python evals/infra_comparison/scripts/aggregate_stats.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median, quantiles

# Resolve paths relative to this script so the script works from any cwd.
_SCRIPTS = Path(__file__).resolve().parent
DATA = _SCRIPTS.parent / "data"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load(path: Path) -> dict | list | None:
    """Load JSON from path; return None on any error."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        print(f"[warn] could not parse {path.name}: {exc}", file=sys.stderr)
        return None


def _pct(samples: list[float], q: float) -> float | None:
    """Return the q-th quantile (0.0–1.0) of samples; None if empty."""
    if not samples:
        return None
    if len(samples) == 1:
        return samples[0]
    # quantiles() requires n>=2; q expressed as a fraction [0,1].
    n_quantiles = 1000
    idx = round(q * n_quantiles)
    idx = max(0, min(n_quantiles, idx))
    qs = quantiles(samples, n=n_quantiles, method="inclusive")
    # quantiles returns n-1 cut points for n intervals (indices 1..n-1).
    # Map q=0 -> samples min, q=1 -> samples max.
    if idx == 0:
        return min(samples)
    if idx >= n_quantiles:
        return max(samples)
    return qs[idx - 1]


def _ratio(a: float | None, b: float | None) -> float | None:
    """Return a/b rounded to 3 dp; None if either is None/zero."""
    if a is None or b is None or b == 0:
        return None
    return round(a / b, 3)


# ---------------------------------------------------------------------------
# Test A
# ---------------------------------------------------------------------------

def _agg_test_a_side(data: dict) -> dict:
    """Flatten a single-target test_a JSON into a flat stats dict."""
    out = {}
    for endpoint in ("health", "session"):
        for mode in ("serial", "concurrent"):
            block = (data.get(endpoint) or {}).get(mode) or {}
            samples = block.get("samples") or []
            prefix = f"{endpoint}_{mode}"
            out[f"{prefix}_p50_ms"] = block.get("p50_ms") or _pct(samples, 0.50)
            out[f"{prefix}_p95_ms"] = block.get("p95_ms") or _pct(samples, 0.95)
            out[f"{prefix}_p99_ms"] = block.get("p99_ms") or _pct(samples, 0.99)
            out[f"{prefix}_mean_ms"] = block.get("mean_ms") or (mean(samples) if samples else None)
            out[f"{prefix}_error_rate"] = block.get("error_rate")
            out[f"{prefix}_n"] = block.get("n") or len(samples)
    return out


def _agg_test_a() -> dict:
    fly_raw = _load(DATA / "test_a_fly.json")
    aws_raw = _load(DATA / "test_a_aws.json")
    missing = []
    if fly_raw is None:
        missing.append("test_a_fly.json")
    if aws_raw is None:
        missing.append("test_a_aws.json")

    fly = _agg_test_a_side(fly_raw) if fly_raw else None
    aws = _agg_test_a_side(aws_raw) if aws_raw else None

    delta: dict = {}
    if fly and aws:
        for key in ("health_serial_p50_ms", "health_concurrent_p50_ms",
                    "session_serial_p50_ms", "session_concurrent_p50_ms"):
            short = key.replace("_ms", "")
            delta[f"{short}_fly_over_aws"] = _ratio(fly.get(key), aws.get(key))

    result: dict = {"fly": fly, "aws": aws, "delta": delta}
    if missing:
        result["missing"] = missing
    return result


# ---------------------------------------------------------------------------
# Test B
# ---------------------------------------------------------------------------

def _agg_test_b_side(data: dict) -> dict:
    out = {}
    for asset in ("root", "js_chunk"):
        block = data.get(asset) or {}
        samples = block.get("samples") or []
        out[f"{asset}_ttfb_p50_ms"] = block.get("ttfb_p50_ms") or _pct(samples, 0.50)
        out[f"{asset}_ttfb_p95_ms"] = block.get("ttfb_p95_ms") or _pct(samples, 0.95)
        out[f"{asset}_total_p50_ms"] = block.get("total_p50_ms")
        out[f"{asset}_total_p95_ms"] = block.get("total_p95_ms")
        if asset == "js_chunk":
            out["js_chunk_size_bytes"] = block.get("size_bytes")
    out["cache_control"] = (data.get("root") or {}).get("cache_control_header")
    out["x_cache"] = (data.get("root") or {}).get("x_cache_header")
    return out


def _agg_test_b() -> dict:
    fly_raw = _load(DATA / "test_b_fly.json")
    aws_raw = _load(DATA / "test_b_aws.json")
    missing = []
    if fly_raw is None:
        missing.append("test_b_fly.json")
    if aws_raw is None:
        missing.append("test_b_aws.json")

    fly = _agg_test_b_side(fly_raw) if fly_raw else None
    aws = _agg_test_b_side(aws_raw) if aws_raw else None

    delta: dict = {}
    if fly and aws:
        for key in ("root_ttfb_p50_ms", "js_chunk_ttfb_p50_ms"):
            short = key.replace("_ms", "")
            delta[f"{short}_fly_over_aws"] = _ratio(fly.get(key), aws.get(key))

    result: dict = {"fly": fly, "aws": aws, "delta": delta}
    if missing:
        result["missing"] = missing
    return result


# ---------------------------------------------------------------------------
# Test D
# ---------------------------------------------------------------------------

def _case_id_from_description(desc: str | None) -> str:
    """'L1: lookup chicken substitute' -> 'L1'."""
    if not desc:
        return "?"
    return desc.split(":", 1)[0].strip()


def _parse_tool_call_count(output_str: str | None) -> int | None:
    """Count 'thinking' events in the response.output JSON string.

    Each tool-call loop iteration emits a 'thinking' event before calling the
    tool, so thinking-event count == tool-call count for this agent.
    """
    if not output_str:
        return None
    try:
        output = json.loads(output_str)
    except Exception:
        return None
    events = output.get("events") or []
    return sum(1 for e in events if e.get("event_type") == "thinking")


def _load_test_d_runs(target: str) -> list[dict]:
    """Load and merge run1 + run2 results for a single target."""
    all_results: list[dict] = []
    for run_n in (1, 2):
        path = DATA / f"test_d_{target}_run{run_n}.json"
        data = _load(path)
        if data is None:
            continue
        # promptfoo output shape: {"results": {"results": [...]}}
        results = (data.get("results") or {}).get("results") or []
        all_results.extend(results)
    return all_results


def _agg_test_d_side(results: list[dict]) -> dict:
    if not results:
        return {}

    # Group by case_id.
    by_case: dict[str, dict] = {}
    latencies_all: list[float] = []
    costs_all: list[float] = []
    n_pass = 0

    for r in results:
        tc = r.get("testCase") or {}
        desc = tc.get("description") or r.get("description")
        case_id = _case_id_from_description(desc)

        latency_ms = (r.get("response") or {}).get("latency_ms")
        cost_usd = r.get("cost") or (r.get("response") or {}).get("cost")
        output_str = (r.get("response") or {}).get("output")
        tool_count = _parse_tool_call_count(output_str)
        success = bool(r.get("success"))

        entry = by_case.setdefault(case_id, {
            "latencies_ms": [],
            "tool_call_counts": [],
            "costs_usd": [],
            "n_pass": 0,
            "n_runs": 0,
        })
        entry["n_runs"] += 1
        if success:
            entry["n_pass"] += 1
            n_pass += 1

        if latency_ms is not None:
            try:
                lms = float(latency_ms)
                entry["latencies_ms"].append(lms)
                latencies_all.append(lms)
            except (TypeError, ValueError):
                pass
        if cost_usd is not None:
            try:
                c = float(cost_usd)
                entry["costs_usd"].append(c)
                costs_all.append(c)
            except (TypeError, ValueError):
                pass
        if tool_count is not None:
            entry["tool_call_counts"].append(tool_count)

    # Summarise per-case.
    per_case: dict[str, dict] = {}
    for case_id, e in sorted(by_case.items()):
        lats = e["latencies_ms"]
        costs = e["costs_usd"]
        tc_counts = e["tool_call_counts"]
        per_case[case_id] = {
            "latency_p50_ms": round(_pct(lats, 0.50), 1) if lats else None,
            "latency_p95_ms": round(_pct(lats, 0.95), 1) if lats else None,
            "latency_mean_ms": round(mean(lats), 1) if lats else None,
            "tool_call_count": round(mean(tc_counts), 2) if tc_counts else None,
            "cost_mean_usd": round(mean(costs), 6) if costs else None,
            "n_runs": e["n_runs"],
            "n_pass": e["n_pass"],
        }

    overall_p50 = _pct(latencies_all, 0.50)
    overall_p95 = _pct(latencies_all, 0.95)
    pass_rate = n_pass / len(results) if results else None

    return {
        "per_case": per_case,
        "overall_p50_ms": round(overall_p50, 1) if overall_p50 is not None else None,
        "overall_p95_ms": round(overall_p95, 1) if overall_p95 is not None else None,
        "overall_mean_cost_usd": round(mean(costs_all), 6) if costs_all else None,
        "pass_rate": round(pass_rate, 4) if pass_rate is not None else None,
        "n_total": len(results),
    }


def _agg_test_d() -> dict:
    fly_results = _load_test_d_runs("fly")
    aws_results = _load_test_d_runs("aws")

    missing = []
    if not fly_results:
        missing.append("test_d_fly_run{1,2}.json")
    if not aws_results:
        missing.append("test_d_aws_run{1,2}.json")

    fly = _agg_test_d_side(fly_results) if fly_results else None
    aws = _agg_test_d_side(aws_results) if aws_results else None

    delta: dict = {}
    if fly and aws:
        delta["overall_p50_fly_over_aws"] = _ratio(
            fly.get("overall_p50_ms"), aws.get("overall_p50_ms")
        )
        delta["overall_p95_fly_over_aws"] = _ratio(
            fly.get("overall_p95_ms"), aws.get("overall_p95_ms")
        )
        delta["pass_rate_fly_minus_aws"] = (
            round(fly["pass_rate"] - aws["pass_rate"], 4)
            if fly.get("pass_rate") is not None and aws.get("pass_rate") is not None
            else None
        )

    result: dict = {"fly": fly, "aws": aws, "delta": delta}
    if missing:
        result["missing"] = missing
    return result


# ---------------------------------------------------------------------------
# Test H (copy-through)
# ---------------------------------------------------------------------------

def _agg_test_h() -> dict | None:
    data = _load(DATA / "test_h_cost.json")
    return data  # already aggregated; pass through as-is


# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

def _print_summary(out: dict) -> None:
    print("\n=== stats.json summary ===")

    ta = out.get("test_a") or {}
    fly_a = ta.get("fly") or {}
    aws_a = ta.get("aws") or {}
    print(f"{'Test A':30s}  {'Fly p50':>10}  {'AWS p50':>10}  {'ratio':>8}")
    for key in ("health_serial_p50_ms", "health_concurrent_p50_ms",
                "session_serial_p50_ms", "session_concurrent_p50_ms"):
        label = key.replace("_p50_ms", "")
        f = fly_a.get(key)
        a = aws_a.get(key)
        r = _ratio(f, a)
        f_str = f"{f:.1f}" if f is not None else "—"
        a_str = f"{a:.1f}" if a is not None else "—"
        r_str = f"{r:.2f}x" if r is not None else "—"
        print(f"  {label:28s}  {f_str:>10}  {a_str:>10}  {r_str:>8}")

    tb = out.get("test_b") or {}
    fly_b = tb.get("fly") or {}
    aws_b = tb.get("aws") or {}
    print(f"\n{'Test B':30s}  {'Fly TTFB':>10}  {'AWS TTFB':>10}  {'ratio':>8}")
    for key in ("root_ttfb_p50_ms", "js_chunk_ttfb_p50_ms"):
        label = key.replace("_ttfb_p50_ms", "")
        f = fly_b.get(key)
        a = aws_b.get(key)
        r = _ratio(f, a)
        f_str = f"{f:.1f}" if f is not None else "—"
        a_str = f"{a:.1f}" if a is not None else "—"
        r_str = f"{r:.2f}x" if r is not None else "—"
        print(f"  {label:28s}  {f_str:>10}  {a_str:>10}  {r_str:>8}")

    td = out.get("test_d") or {}
    fly_d = td.get("fly") or {}
    aws_d = td.get("aws") or {}
    print(f"\n{'Test D':30s}  {'Fly':>10}  {'AWS':>10}")
    for label, key in (("overall p50 ms", "overall_p50_ms"),
                       ("overall p95 ms", "overall_p95_ms"),
                       ("pass rate", "pass_rate")):
        f = fly_d.get(key)
        a = aws_d.get(key)
        f_str = f"{f}" if f is not None else "—"
        a_str = f"{a}" if a is not None else "—"
        print(f"  {label:28s}  {f_str:>10}  {a_str:>10}")

    missing = out.get("missing") or []
    if missing:
        print(f"\n[warn] missing inputs: {missing}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    missing_files: list[str] = []

    test_a = _agg_test_a()
    test_b = _agg_test_b()
    test_d = _agg_test_d()
    test_h = _agg_test_h()

    # Collect missing file names from each sub-aggregation.
    for sub in (test_a, test_b, test_d):
        missing_files.extend(sub.pop("missing", []))

    preflight = _load(DATA / "preflight.json")

    out: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "preflight": preflight,
        "test_a": test_a,
        "test_b": test_b,
        "test_d": test_d,
        "test_h": test_h,
    }
    if missing_files:
        out["missing"] = missing_files

    out_path = DATA / "stats.json"
    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f"wrote {out_path}")

    _print_summary(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
