#!/usr/bin/env python3
"""Aggregate Phase 3 raw data into a single stats.json for REPORT.md population.

Outputs to evals/presentation/data/stats.json with this shape:
{
  "ramp": [{"users": int, "rps": float, "chat_p50_ms": ..., "chat_p95_ms": ..., "fail_pct": ...}, ...],
  "steady": {"users": 5, "duration_s": 300, "chat_p50_ms": ..., "chat_p95_ms": ..., "chat_p99_ms": ...,
             "ttd_full_p50_ms": ..., "ttd_full_p95_ms": ..., "cache_ratio_median": float, "fail_pct": ...},
  "cold_start": {"n_cold": 1, "session_create_ms": ..., "ttfe_ms": ..., "ttd_ms": ...},
  "quality": [{"case_id": "A1", "scores": [...], "mean": float, "cv_pct": float}, ...],
  "cost": {"total_usd": float, "mean_per_convo_usd": float, "median_per_convo_usd": float,
           "n_convos": int, "cache_hit_pct_avg": float}
}
"""
from __future__ import annotations
import csv
import json
import math
import sys
from pathlib import Path
from statistics import mean, median, stdev

DATA = Path(__file__).resolve().parent.parent / "data"


def _load_stats_csv(path: Path) -> dict[tuple[str, str], dict]:
    rows: dict[tuple[str, str], dict] = {}
    if not path.exists():
        return rows
    with path.open() as f:
        for row in csv.DictReader(f):
            rows[(row["Type"], row["Name"])] = row
    return rows


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _ramp_row(users: int) -> dict | None:
    stats = _load_stats_csv(DATA / f"locust_ramp_{users}u_stats.csv")
    chat = stats.get(("POST", "POST /session/{id}/chat"))
    if not chat:
        return None
    fails = _f(chat["Failure Count"]) or 0
    total = _f(chat["Request Count"]) or 0
    return {
        "users": users,
        "rps": _f(chat["Requests/s"]),
        "chat_count": int(total),
        "chat_p50_ms": _f(chat["50%"]),
        "chat_p95_ms": _f(chat["95%"]),
        "chat_p99_ms": _f(chat["99%"]),
        "chat_avg_ms": _f(chat["Average Response Time"]),
        "fail_pct": (fails / total * 100) if total else 0.0,
    }


def _steady() -> dict | None:
    stats = _load_stats_csv(DATA / "locust_steady_stats.csv")
    chat = stats.get(("POST", "POST /session/{id}/chat"))
    if not chat:
        return None
    cache = stats.get(("SSE", "sse_prompt_cache_ratio_x1000"))
    fails = _f(chat["Failure Count"]) or 0
    total = _f(chat["Request Count"]) or 0
    return {
        "users": 5,  # finish_phase3.sh hard-codes 5
        "chat_count": int(total),
        "rps": _f(chat["Requests/s"]),
        "chat_p50_ms": _f(chat["50%"]),
        "chat_p95_ms": _f(chat["95%"]),
        "chat_p99_ms": _f(chat["99%"]),
        "chat_p999_ms": _f(chat["99.9%"]),
        "chat_avg_ms": _f(chat["Average Response Time"]),
        "chat_max_ms": _f(chat["Max Response Time"]),
        "cache_ratio_median": (_f(cache["50%"]) / 1000) if cache else None,
        "cache_ratio_p95": (_f(cache["95%"]) / 1000) if cache else None,
        "fail_pct": (fails / total * 100) if total else 0.0,
        "note": (
            "TTFE/TTD locust custom metrics are unreliable (timer starts after response "
            "headers, not before request). Treat POST /chat latency as end-to-end SSE latency."
        ),
    }


def _cold() -> dict | None:
    p = DATA / "cold_start.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    cold = [c for c in data["calls"] if c["kind"] == "cold" and c["ok"]]
    warm = [c for c in data["calls"] if c["kind"] == "warm" and c["ok"]]

    def avg(samples, key):
        vals = [s[key] for s in samples if s.get(key) is not None]
        return mean(vals) if vals else None

    return {
        "n_cold": len(cold),
        "n_warm": len(warm),
        "cold_session_create_ms": avg(cold, "session_create_ms"),
        "cold_ttfe_ms": avg(cold, "ttfe_ms"),
        "cold_ttd_ms": avg(cold, "ttd_ms"),
        "warm_session_create_ms": avg(warm, "session_create_ms"),
        "warm_ttfe_ms": avg(warm, "ttfe_ms"),
        "warm_ttd_ms": avg(warm, "ttd_ms"),
        "note": data.get("config", {}).get("note", ""),
    }


def _promptfoo_score(result: dict) -> float | None:
    """Use the overall gradingResult.score (weighted across all assertions)."""
    grading = result.get("gradingResult") or {}
    if grading.get("score") is not None:
        return float(grading["score"])
    return None


def _promptfoo_rubric_only(result: dict) -> float | None:
    """Just the llm-rubric component, for cases where overall is dominated by JS asserts."""
    comps = (result.get("gradingResult") or {}).get("componentResults") or []
    rubric = next(
        (c for c in comps if (c.get("assertion") or {}).get("type") == "llm-rubric"),
        None,
    )
    return float(rubric["score"]) if (rubric and rubric.get("score") is not None) else None


def _promptfoo_cost(result: dict) -> tuple[float | None, dict]:
    """Returns (cost_usd, tokenUsage_dict)."""
    cost = result.get("cost") or (result.get("response") or {}).get("cost")
    tokens = (result.get("response") or {}).get("tokenUsage") or {}
    return (float(cost) if cost is not None else None, tokens)


def _case_id_from_description(desc: str | None) -> str:
    """description = 'A1: chicken+broccoli dinner for 2' -> 'A1'."""
    if not desc:
        return "?"
    return desc.split(":", 1)[0].strip()


def _quality_and_cost() -> tuple[list[dict], dict]:
    """Aggregate scores per case across all promptfoo runs + total cost + cache stats.

    Prefers *_nocache_*.json files (true independent samples, real API calls).
    Falls back to other promptfoo_*.json files only if no nocache runs exist.
    The cached runs return identical scores AND phantom costs (cost field is
    populated even when promptfoo returns a cached result), so they would
    inflate sample size with zero-variance duplicates.
    """
    nocache_runs = sorted(DATA.glob("promptfoo_*_nocache_*.json"))
    runs = nocache_runs or sorted(DATA.glob("promptfoo_*.json"))
    if not runs:
        return [], {}

    scores_by_case: dict[str, list[float]] = {}
    rubrics_by_case: dict[str, list[float]] = {}
    descriptions: dict[str, str] = {}
    costs: list[float] = []
    cached_tokens_total = 0
    prompt_tokens_total = 0
    completion_tokens_total = 0
    n_convos = 0
    n_passed = 0
    n_failed = 0

    for run_path in runs:
        try:
            data = json.loads(run_path.read_text())
        except Exception as e:
            print(f"[warn] could not parse {run_path}: {e}", file=sys.stderr)
            continue
        results = (data.get("results") or {}).get("results") or []
        for r in results:
            n_convos += 1
            if r.get("success"):
                n_passed += 1
            else:
                n_failed += 1
            tc = r.get("testCase") or {}
            desc = tc.get("description") or r.get("description")
            case_id = _case_id_from_description(desc)
            descriptions.setdefault(case_id, desc or "")
            score = _promptfoo_score(r)
            if score is not None:
                scores_by_case.setdefault(case_id, []).append(score)
            rubric = _promptfoo_rubric_only(r)
            if rubric is not None:
                rubrics_by_case.setdefault(case_id, []).append(rubric)
            cost, tokens = _promptfoo_cost(r)
            if cost is not None:
                costs.append(cost)
            cached_tokens_total += tokens.get("cached") or 0
            prompt_tokens_total += tokens.get("prompt") or 0
            completion_tokens_total += tokens.get("completion") or 0

    quality = []
    for case_id, scs in sorted(scores_by_case.items()):
        m = mean(scs) if scs else None
        cv = (stdev(scs) / m * 100) if (m and len(scs) > 1 and m > 0) else 0.0
        rubric_scores = rubrics_by_case.get(case_id, [])
        quality.append(
            {
                "case_id": case_id,
                "description": descriptions.get(case_id, ""),
                "n_runs": len(scs),
                "scores": [round(s, 3) for s in scs],
                "mean": round(m, 3) if m is not None else None,
                "cv_pct": round(cv, 1),
                "rubric_mean": round(mean(rubric_scores), 3) if rubric_scores else None,
            }
        )

    cost_summary = {
        "n_convos": n_convos,
        "n_passed": n_passed,
        "n_failed": n_failed,
        "n_with_cost": len(costs),
        "total_usd": round(sum(costs), 4) if costs else None,
        "mean_per_convo_usd": round(mean(costs), 5) if costs else None,
        "median_per_convo_usd": round(median(costs), 5) if costs else None,
        "prompt_tokens_total": prompt_tokens_total,
        "completion_tokens_total": completion_tokens_total,
        "cached_tokens_total": cached_tokens_total,
        "cache_hit_pct": (
            round(cached_tokens_total / prompt_tokens_total * 100, 1)
            if prompt_tokens_total else None
        ),
    }

    return quality, cost_summary


def main() -> int:
    out = {
        "ramp": [r for r in (_ramp_row(n) for n in (1, 5, 10, 20)) if r],
        "steady": _steady(),
        "cold_start": _cold(),
    }
    quality, cost = _quality_and_cost()
    out["quality"] = quality
    out["cost"] = cost

    out_path = DATA / "stats.json"
    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f"wrote {out_path}")
    print(json.dumps(out, indent=2, default=str)[:2000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
