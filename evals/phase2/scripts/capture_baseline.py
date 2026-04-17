"""Capture a telemetry baseline for SGA V2 Phase 2 evals.

Runs every test case in test_cases.yaml N times against the running backend
and records per-case medians plus aggregate totals for:
    - total_tokens, prompt_tokens, completion_tokens, cached_tokens
    - cost (USD, from OpenRouter)
    - latency_ms (wall clock)
    - cache_hit_ratio

Output: evals/phase2/baselines/main-YYYY-MM-DD.json

This is a recording script — no gates, no pass/fail. Use before a change
you expect to move the cost/latency dial (e.g., prompt caching) so the
after-run has something to compare against.

Usage:
    python capture_baseline.py [--runs N] [--base-url URL] [--tag NAME]

Prerequisite: docker compose up
"""

import argparse
import json
import logging
import os
import statistics
import subprocess
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests
import yaml

logger = logging.getLogger("capture_baseline")

DEFAULT_BASE_URL = "http://localhost:8000"
CHAT_TIMEOUT = 120
DEFAULT_RUNS = 3

TEST_CASES_YAML = Path(__file__).parent.parent / "test_cases.yaml"
BASELINES_DIR = Path(__file__).parent.parent / "baselines"


def git_ref() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=Path(__file__).parent,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return out or "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def load_cases(yaml_path: Path = TEST_CASES_YAML) -> list[dict]:
    """Load every test case. Each entry becomes a baseline row.

    Returns a list of {id, category, screen, turns: list[str]}.
    Single-turn entries (vars.input) are wrapped as turns=[input].
    Multi-turn entries (vars.turns) pass through.
    """
    with open(yaml_path, "r", encoding="utf-8") as f:
        raw_cases = yaml.safe_load(f) or []

    cases = []
    for entry in raw_cases:
        vars_ = entry.get("vars", {}) or {}
        description = entry.get("description", "")
        case_id = description.split(":", 1)[0].strip() or description[:16]

        turns = vars_.get("turns")
        if turns is None:
            single = vars_.get("input")
            if not single:
                continue
            turns = [single]

        cases.append({
            "id": case_id,
            "category": vars_.get("category", "unknown"),
            "screen": vars_.get("screen", "home"),
            "turns": list(turns),
        })

    return cases


def health_check(base_url: str) -> None:
    try:
        resp = requests.get(f"{base_url}/health", timeout=10)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            f"Backend not reachable at {base_url}/health — run `docker compose up`. "
            f"({exc})"
        )


def create_session(base_url: str) -> str:
    resp = requests.post(f"{base_url}/session", json={}, timeout=30)
    resp.raise_for_status()
    return resp.json()["session_id"]


def send_chat(base_url: str, session_id: str, message: str, screen: str) -> str:
    resp = requests.post(
        f"{base_url}/session/{session_id}/chat",
        json={"message": message, "screen": screen},
        timeout=CHAT_TIMEOUT,
        stream=True,
    )
    resp.raise_for_status()
    return resp.text


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event_type = ""
        data = ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                event_type = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data = line[len("data:"):].strip()
        if event_type and data:
            try:
                events.append((event_type, json.loads(data)))
            except json.JSONDecodeError:
                events.append((event_type, {"raw": data}))
    return events


def extract_done_usage(events: list[tuple[str, dict]]) -> dict:
    """Pull token_usage from the terminal `done` event. Returns zeros if missing."""
    for etype, data in reversed(events):
        if etype == "done":
            tu = data.get("token_usage") or {}
            prompt = int(tu.get("prompt_tokens", 0) or 0)
            cached = int(tu.get("cached_tokens", 0) or 0)
            return {
                "prompt_tokens": prompt,
                "completion_tokens": int(tu.get("completion_tokens", 0) or 0),
                "total_tokens": int(tu.get("total_tokens", 0) or 0),
                "cached_tokens": cached,
                "cache_write_tokens": int(tu.get("cache_write_tokens", 0) or 0),
                "cost": float(tu.get("cost", 0.0) or 0.0),
                "cache_hit_ratio": (cached / prompt) if prompt > 0 else 0.0,
                "model": tu.get("model"),
            }
    return {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cached_tokens": 0,
        "cache_write_tokens": 0,
        "cost": 0.0,
        "cache_hit_ratio": 0.0,
        "model": None,
    }


def run_case_once(base_url: str, case: dict) -> dict:
    """Run a single iteration — N turns on one session. Sums usage across turns."""
    session_id = create_session(base_url)
    summed = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cached_tokens": 0,
        "cache_write_tokens": 0,
        "cost": 0.0,
    }
    model = None
    start = time.perf_counter()
    for turn in case["turns"]:
        raw = send_chat(base_url, session_id, turn, case["screen"])
        events = parse_sse(raw)
        turn_usage = extract_done_usage(events)
        for key in ["prompt_tokens", "completion_tokens", "total_tokens",
                    "cached_tokens", "cache_write_tokens", "cost"]:
            summed[key] += turn_usage[key]
        if turn_usage.get("model"):
            model = turn_usage["model"]
    latency_ms = int((time.perf_counter() - start) * 1000)

    prompt = summed["prompt_tokens"]
    summed["cache_hit_ratio"] = (summed["cached_tokens"] / prompt) if prompt > 0 else 0.0
    summed["latency_ms"] = latency_ms
    summed["model"] = model
    return summed


def _median_field(runs: list[dict], key: str) -> float:
    values = [r[key] for r in runs if key in r]
    if not values:
        return 0.0
    m = statistics.median(values)
    return float(m)


def summarize_case(runs: list[dict]) -> dict:
    """Median over successful runs. Errors are excluded."""
    successful = [r for r in runs if "error" not in r]
    if not successful:
        return {"median": None, "errors": len(runs)}
    return {
        "median": {
            "total_tokens": int(_median_field(successful, "total_tokens")),
            "prompt_tokens": int(_median_field(successful, "prompt_tokens")),
            "completion_tokens": int(_median_field(successful, "completion_tokens")),
            "cached_tokens": int(_median_field(successful, "cached_tokens")),
            "cost": round(_median_field(successful, "cost"), 6),
            "latency_ms": int(_median_field(successful, "latency_ms")),
            "cache_hit_ratio": round(_median_field(successful, "cache_hit_ratio"), 4),
        },
        "model": next((r["model"] for r in successful if r.get("model")), None),
        "errors": len(runs) - len(successful),
    }


def compute_aggregate(cases_report: dict) -> dict:
    """Totals across case medians — coarse but useful for headline comparison."""
    totals = {"total_tokens": 0, "prompt_tokens": 0, "completion_tokens": 0,
              "cached_tokens": 0, "cost": 0.0}
    latencies = []
    cache_ratios = []
    case_count = 0
    for cdata in cases_report.values():
        median = cdata.get("median")
        if not median:
            continue
        case_count += 1
        for key in totals:
            totals[key] += median[key]
        latencies.append(median["latency_ms"])
        cache_ratios.append(median["cache_hit_ratio"])

    totals["cost"] = round(totals["cost"], 6)
    return {
        "cases_counted": case_count,
        "total_tokens": totals["total_tokens"],
        "prompt_tokens": totals["prompt_tokens"],
        "completion_tokens": totals["completion_tokens"],
        "cached_tokens": totals["cached_tokens"],
        "total_cost_usd": totals["cost"],
        "mean_latency_ms": int(statistics.mean(latencies)) if latencies else 0,
        "mean_cache_hit_ratio": round(statistics.mean(cache_ratios), 4) if cache_ratios else 0.0,
    }


def run_baseline(base_url: str, runs: int) -> dict:
    cases = load_cases()
    cases_report: dict = {}

    for case in cases:
        logger.info("Case %s (%s): %d runs", case["id"], case["category"], runs)
        runs_data = []
        for i in range(runs):
            logger.info("  run %d/%d", i + 1, runs)
            try:
                runs_data.append(run_case_once(base_url, case))
            except requests.Timeout:
                runs_data.append({"error": "timeout"})
            except requests.HTTPError as exc:
                runs_data.append({"error": f"http_{exc.response.status_code}"})
            except Exception as exc:
                runs_data.append({"error": str(exc)})

        summary = summarize_case(runs_data)
        cases_report[case["id"]] = {
            "category": case["category"],
            "turns": len(case["turns"]),
            "runs": runs_data,
            **summary,
        }

    report = {
        "git_ref": git_ref(),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "runs_per_case": runs,
        "cases": cases_report,
        "aggregate": compute_aggregate(cases_report),
    }
    return report


def write_baseline(report: dict, tag: str | None) -> Path:
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    ref = tag or report.get("git_ref", "unknown")
    safe_ref = ref.replace("/", "-")
    out_path = BASELINES_DIR / f"{safe_ref}-{today}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture a telemetry baseline.")
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS,
                        help=f"Runs per case (default: {DEFAULT_RUNS})")
    parser.add_argument("--base-url", type=str, default=None,
                        help=f"Backend URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--tag", type=str, default=None,
                        help="Override the ref prefix for the output filename "
                             "(default: git branch).")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(message)s",
        stream=sys.stderr,
    )

    base_url = (
        args.base_url
        or os.environ.get("SGA_EVAL_BASE_URL")
        or DEFAULT_BASE_URL
    )

    logger.info("Checking backend at %s ...", base_url)
    health_check(base_url)
    logger.info("Backend healthy.\n")

    report = run_baseline(base_url, args.runs)
    out_path = write_baseline(report, args.tag)

    logger.info("\n=== Baseline written ===")
    logger.info("File: %s", out_path)
    agg = report["aggregate"]
    logger.info("Cases: %d | total_tokens: %d | cost: $%.4f | mean_latency: %dms | cache_hit: %.2f%%",
                agg["cases_counted"], agg["total_tokens"], agg["total_cost_usd"],
                agg["mean_latency_ms"], agg["mean_cache_hit_ratio"] * 100)
    return 0


if __name__ == "__main__":
    sys.exit(main())
