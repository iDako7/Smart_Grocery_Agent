"""Consistency runner for SGA V2 Phase 2 evaluation.

Runs the same test cases N times against the backend and measures variance
in dish count, ingredient counts, and recipe name overlap. Answers the
question: "Is the agent stable enough to optimize?"

Usage:
    python consistency_runner.py [--runs N] [--base-url URL]

Output:
    JSON report to stdout, human-readable summary to stderr.
"""

import argparse
import json
import math
import os
import re
import sys
from datetime import UTC, datetime
from itertools import combinations
from pathlib import Path

import requests
import yaml

DEFAULT_BASE_URL = "http://localhost:8000"
CHAT_TIMEOUT = 120  # seconds

TEST_CASES_YAML = Path(__file__).parent.parent / "test_cases.yaml"


def load_cases(yaml_path: Path = TEST_CASES_YAML) -> list[dict]:
    """Load dish_count cases from YAML and map to the runner's dict shape.

    Only cases with category == "dish_count" are returned — the variance +
    range gate is dish-count specific (PR #105). Ingredient_noise and
    diverse_inputs cases are out of scope.
    """
    with open(yaml_path, encoding="utf-8") as f:
        raw_cases = yaml.safe_load(f)

    mapped = []
    for entry in raw_cases:
        vars_ = entry.get("vars", {}) or {}
        if vars_.get("category") != "dish_count":
            continue

        # Consistency runner is single-turn only; multi-turn entries (vars.turns)
        # are skipped with a warning. Entries missing both input and turns are
        # likewise skipped to avoid KeyError.
        if "input" not in vars_:
            description = entry.get("description", "")
            if "turns" in vars_:
                print(
                    f"Skipping multi-turn entry ({description!r}); consistency runner supports single-turn only.",
                    file=sys.stderr,
                )
            else:
                print(
                    f"Skipping entry without vars.input ({description!r}).",
                    file=sys.stderr,
                )
            continue

        description = entry.get("description", "")
        # Parse id from description prefix (e.g. "A1: chicken+broccoli..." -> "A1")
        match = re.match(r"^\s*([A-Za-z]\d+)\s*[:\-]", description)
        case_id = match.group(1) if match else description.split(":", 1)[0].strip()

        mapped.append(
            {
                "id": case_id,
                "message": vars_["input"],
                "screen": vars_.get("screen", "home"),
                "party_size": vars_["party_size"],
                "expected_dish_min": vars_["expected_dish_min"],
                "expected_dish_max": vars_["expected_dish_max"],
            }
        )

    return mapped


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def health_check(base_url: str) -> None:
    """Verify backend is reachable. Raises RuntimeError on failure."""
    try:
        resp = requests.get(f"{base_url}/health", timeout=10)
        resp.raise_for_status()
    except requests.ConnectionError as err:
        raise RuntimeError(f"Backend not running. Run: docker compose up  (tried {base_url}/health)") from err
    except requests.HTTPError as exc:
        raise RuntimeError(
            f"Backend health check failed ({exc.response.status_code}). "
            f"Run: docker compose up  (tried {base_url}/health)"
        ) from exc


def create_session(base_url: str) -> str:
    """POST /session -> session_id."""
    resp = requests.post(f"{base_url}/session", json={}, timeout=30)
    resp.raise_for_status()
    return resp.json()["session_id"]


def send_chat(base_url: str, session_id: str, message: str, screen: str) -> str:
    """POST /session/{id}/chat and return the raw SSE body."""
    resp = requests.post(
        f"{base_url}/session/{session_id}/chat",
        json={"message": message, "screen": screen},
        timeout=CHAT_TIMEOUT,
        stream=True,
    )
    resp.raise_for_status()
    return resp.text


# ---------------------------------------------------------------------------
# SSE parsing
# ---------------------------------------------------------------------------


def parse_sse(body: str) -> list[tuple[str, dict]]:
    """Parse an SSE stream body into (event_type, data_dict) tuples."""
    events = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event_type = ""
        data = ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                event_type = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data = line[len("data:") :].strip()
        if event_type and data:
            try:
                events.append((event_type, json.loads(data)))
            except json.JSONDecodeError:
                events.append((event_type, {"raw": data}))
    return events


# ---------------------------------------------------------------------------
# Metric extraction
# ---------------------------------------------------------------------------


def extract_metrics(events: list[tuple[str, dict]]) -> dict:
    """Extract dish_count, ingredient_count_avg, and recipe_names from SSE events."""
    recipe_cards = [d for etype, d in events if etype == "recipe_card"]
    dish_count = len(recipe_cards)

    ingredient_counts = []
    recipe_names = []
    for card in recipe_cards:
        recipe = card.get("recipe")
        if not recipe:
            continue  # skip malformed events
        name = recipe.get("name") or recipe.get("title") or ""
        recipe_names.append(name)
        ingredients = recipe.get("ingredients") or []
        ingredient_counts.append(len(ingredients))

    ingredient_count_avg = sum(ingredient_counts) / len(ingredient_counts) if ingredient_counts else 0.0

    return {
        "dish_count": dish_count,
        "ingredient_count_avg": round(ingredient_count_avg, 1),
        "recipe_names": recipe_names,
    }


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    variance = sum((x - m) ** 2 for x in values) / (len(values) - 1)
    return math.sqrt(variance)


def _cv(mean: float, stddev: float) -> float:
    """Coefficient of variation (0.0 when mean is zero)."""
    return stddev / mean if mean != 0 else 0.0


def jaccard(set_a: set, set_b: set) -> float:
    """Jaccard similarity of two sets."""
    union = set_a | set_b
    if not union:
        return 1.0
    return len(set_a & set_b) / len(union)


def compute_pairwise_jaccard(name_lists: list[list[str]]) -> list[float]:
    """Compute Jaccard similarity for every pair of run results."""
    sets = [set(n.lower() for n in names) for names in name_lists]
    scores = []
    for a, b in combinations(range(len(sets)), 2):
        scores.append(jaccard(sets[a], sets[b]))
    return scores


def compute_stats(runs: list[dict]) -> dict:
    """Compute summary statistics across successful runs."""
    dish_counts = [r["dish_count"] for r in runs]
    ingredient_avgs = [r["ingredient_count_avg"] for r in runs]
    name_lists = [r["recipe_names"] for r in runs]

    dc_mean = _mean(dish_counts)
    dc_std = _stddev(dish_counts)

    ia_mean = _mean(ingredient_avgs)
    ia_std = _stddev(ingredient_avgs)

    jaccard_scores = compute_pairwise_jaccard(name_lists)
    jac_mean = _mean(jaccard_scores) if jaccard_scores else 0.0
    jac_min = min(jaccard_scores) if jaccard_scores else 0.0
    jac_max = max(jaccard_scores) if jaccard_scores else 0.0

    return {
        "dish_count": {
            "mean": round(dc_mean, 1),
            "stddev": round(dc_std, 1),
            "cv": round(_cv(dc_mean, dc_std), 2),
        },
        "ingredient_count_avg": {
            "mean": round(ia_mean, 1),
            "stddev": round(ia_std, 1),
            "cv": round(_cv(ia_mean, ia_std), 2),
        },
        "recipe_name_jaccard": {
            "mean": round(jac_mean, 2),
            "min": round(jac_min, 2),
            "max": round(jac_max, 2),
        },
    }


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def run_single(base_url: str, case: dict) -> dict:
    """Execute one run of a test case. Returns metrics dict or error dict."""
    try:
        session_id = create_session(base_url)
        raw = send_chat(base_url, session_id, case["message"], case["screen"])
        events = parse_sse(raw)
        return extract_metrics(events)
    except requests.Timeout:
        return {"error": "timeout"}
    except requests.HTTPError as exc:
        return {"error": f"http_{exc.response.status_code}"}
    except requests.ConnectionError:
        return {"error": "connection_error"}
    except Exception as exc:
        return {"error": str(exc)}


def run_case(base_url: str, case: dict, num_runs: int) -> dict:
    """Run a test case N times and compute stats."""
    all_runs = []
    successful_runs = []

    for i in range(num_runs):
        print(
            f"  Run {i + 1}/{num_runs} for {case['id']}...",
            file=sys.stderr,
            flush=True,
        )
        result = run_single(base_url, case)
        all_runs.append(result)
        if "error" not in result:
            successful_runs.append(result)

    stats = compute_stats(successful_runs) if len(successful_runs) >= 2 else None

    return {
        "party_size": case["party_size"],
        "expected_dish_min": case.get("expected_dish_min"),
        "expected_dish_max": case.get("expected_dish_max"),
        "runs": all_runs,
        "stats": stats,
    }


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------


def print_summary(report: dict) -> None:
    """Print human-readable summary to stderr."""
    print("\n=== Consistency Analysis ===", file=sys.stderr)
    print(f"Runs per case: {report['runs_per_case']}", file=sys.stderr)

    for case_id, case_data in report["cases"].items():
        ps = case_data["party_size"]
        stats = case_data.get("stats")
        error_count = sum(1 for r in case_data["runs"] if "error" in r)

        print(f"\n{case_id} (party_size={ps}):", file=sys.stderr)

        if error_count > 0:
            print(
                f"  Errors:         {error_count}/{report['runs_per_case']} runs failed",
                file=sys.stderr,
            )

        if stats is None:
            print("  (not enough successful runs for stats)", file=sys.stderr)
            continue

        dc = stats["dish_count"]
        ia = stats["ingredient_count_avg"]
        jac = stats["recipe_name_jaccard"]

        print(
            f"  Dish count:     {dc['mean']} \u00b1 {dc['stddev']} (CV: {round(dc['cv'] * 100)}%)",
            file=sys.stderr,
        )
        print(
            f"  Ingredients:    {ia['mean']} \u00b1 {ia['stddev']} (CV: {round(ia['cv'] * 100)}%)",
            file=sys.stderr,
        )
        print(
            f"  Recipe overlap:  {round(jac['mean'] * 100)}% (Jaccard)",
            file=sys.stderr,
        )

    print("", file=sys.stderr)


# ---------------------------------------------------------------------------
# Gate logic
# ---------------------------------------------------------------------------


def check_gates(report: dict) -> int:
    """Gate merges on dish-count variance AND range-fit.

    For each case in the report:
      - Variance gate: stats.dish_count.stddev == 0.0 across successful runs
      - Range gate: every individual run's dish_count is within
        [expected_dish_min, expected_dish_max]
      - Cases with errors or fewer than 2 successful runs fail the gate
        (can't verify variance).

    Prints any failures to stderr in a clearly-flagged block and returns
    0 if all gates pass, 1 otherwise.
    """
    failures: list[tuple[str, str]] = []
    runs_per_case = report.get("runs_per_case", 0)

    for case_id, case_data in report.get("cases", {}).items():
        all_runs = case_data.get("runs", [])
        successful_runs = [r for r in all_runs if "error" not in r]
        error_count = len(all_runs) - len(successful_runs)
        stats = case_data.get("stats")
        expected_min = case_data.get("expected_dish_min")
        expected_max = case_data.get("expected_dish_max")

        # Cases with errors or <2 successful runs can't verify variance.
        if error_count > 0:
            failures.append(
                (
                    case_id,
                    f"{error_count}/{runs_per_case or len(all_runs)} runs errored — cannot verify variance",
                )
            )
            continue

        if len(successful_runs) < 2:
            failures.append(
                (
                    case_id,
                    f"only {len(successful_runs)} successful run(s) — need >=2 to verify variance",
                )
            )
            continue

        # Variance gate
        if stats is None:
            failures.append((case_id, "no stats computed — cannot verify variance"))
            continue

        stddev = stats.get("dish_count", {}).get("stddev", 0.0)
        if stddev != 0.0:
            dish_counts = [r.get("dish_count") for r in successful_runs]
            failures.append(
                (
                    case_id,
                    f"variance gate: dish_count.stddev={stddev} != 0.0 (counts={dish_counts})",
                )
            )

        # Range gate (checked independently of variance — both can fail)
        if expected_min is not None and expected_max is not None:
            out_of_range = [
                r.get("dish_count")
                for r in successful_runs
                if not (expected_min <= r.get("dish_count", -1) <= expected_max)
            ]
            if out_of_range:
                failures.append(
                    (
                        case_id,
                        f"range gate: {len(out_of_range)}/{len(successful_runs)} runs "
                        f"outside [{expected_min}, {expected_max}] "
                        f"(counts={out_of_range})",
                    )
                )

    if failures:
        print("\n=== GATE FAILURES ===", file=sys.stderr)
        for case_id, reason in failures:
            print(f"  [{case_id}] {reason}", file=sys.stderr)
        print(f"Total failures: {len(failures)}", file=sys.stderr)
        return 1

    print("\n=== GATES PASSED ===", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SGA V2 test cases N times and measure output variance.")
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="Number of runs per test case (default: 3)",
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default=None,
        help=f"Backend URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--no-gate",
        action="store_true",
        help=(
            "Skip the dish-count variance + range gate. Useful for baseline "
            "runs or exploration. Default: gate is enforced and non-zero exit "
            "signals failure."
        ),
    )
    args = parser.parse_args()

    base_url = args.base_url or os.environ.get("SGA_EVAL_BASE_URL") or DEFAULT_BASE_URL

    # Health check
    print(f"Checking backend at {base_url}...", file=sys.stderr, flush=True)
    health_check(base_url)
    print("Backend is healthy.\n", file=sys.stderr, flush=True)

    # Load cases from YAML (dish_count category only)
    cases = load_cases()

    # Run each case
    cases_results = {}
    for case in cases:
        print(f"Running case {case['id']}...", file=sys.stderr, flush=True)
        cases_results[case["id"]] = run_case(base_url, case, args.runs)

    # Build report
    report = {
        "runs_per_case": args.runs,
        "timestamp": datetime.now(UTC).isoformat(),
        "cases": cases_results,
    }

    # Output JSON to stdout
    json.dump(report, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")

    # Human-readable summary to stderr
    print_summary(report)

    # Gate on dish-count variance + range-fit unless explicitly skipped
    if args.no_gate:
        print("(gate skipped via --no-gate)", file=sys.stderr)
        sys.exit(0)
    sys.exit(check_gates(report))


if __name__ == "__main__":
    main()
