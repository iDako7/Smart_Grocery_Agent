#!/usr/bin/env python3
"""Generate 4 infra-comparison charts from stats.json.

Produces PNG files under charts/:
  - latency_microbench.png   (Test A: /health + /session p50 grouped bar)
  - ttfb_comparison.png      (Test B: CloudFront vs Fly Anycast TTFB grouped bar)
  - lookup_latency_boxplot.png (Test D: per-case latency, grouped bar when samples absent)
  - cost_per_1000.png        (Test H: monthly cost stacked bar)

Usage:
    python generate_charts.py [--stats-path ../data/stats.json] [--out-dir ../charts]

Run from repo root or directly from the scripts/ directory.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt

matplotlib.use("Agg")
plt.style.use("seaborn-v0_8-whitegrid")

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
FLY_COLOR = "#7B3FF2"    # purple
AWS_COLOR = "#FF9900"    # AWS orange

FIGSIZE = (10, 6)
DPI = 150

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save(fig: plt.Figure, out_dir: Path, name: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / name
    fig.savefig(path, dpi=DPI, bbox_inches="tight")
    plt.close(fig)
    print(str(path))


def _warn(chart: str, reason: str) -> None:
    print(f"[skip] {chart}: {reason}", file=sys.stderr)


def _load_stats(stats_path: Path) -> dict | None:
    if not stats_path.exists():
        print(f"[error] stats file not found: {stats_path}", file=sys.stderr)
        return None
    try:
        return json.loads(stats_path.read_text())
    except Exception as exc:  # noqa: BLE001
        print(f"[error] could not parse {stats_path}: {exc}", file=sys.stderr)
        return None


def _annotate_bars(ax: plt.Axes, bars, fmt: str = "{:.0f}") -> None:
    """Place a text label above each bar."""
    for bar in bars:
        h = bar.get_height()
        if h is None or h != h:  # NaN guard
            continue
        ax.text(
            bar.get_x() + bar.get_width() / 2.0,
            h + max(h * 0.01, 0.5),
            fmt.format(h),
            ha="center",
            va="bottom",
            fontsize=8,
        )


# ---------------------------------------------------------------------------
# Chart 1 — Test A: /health + /session latency (p50)
# ---------------------------------------------------------------------------

def chart_latency_microbench(stats: dict, out_dir: Path) -> None:
    name = "latency_microbench.png"
    try:
        ta = stats.get("test_a") or {}
        fly = ta.get("fly") or {}
        aws = ta.get("aws") or {}

        groups = [
            ("health\nserial",      "health_serial_p50_ms"),
            ("health\nconcurrent",  "health_concurrent_p50_ms"),
            ("session\nserial",     "session_serial_p50_ms"),
            ("session\nconcurrent", "session_concurrent_p50_ms"),
        ]

        # Check at least some data present
        fly_vals = [fly.get(k) for _, k in groups]
        aws_vals = [aws.get(k) for _, k in groups]
        if all(v is None for v in fly_vals) and all(v is None for v in aws_vals):
            return _warn(name, "no test_a data in stats.json")

        labels = [g[0] for g in groups]
        fly_vals = [v if v is not None else 0.0 for v in fly_vals]
        aws_vals = [v if v is not None else 0.0 for v in aws_vals]

        import numpy as np
        x = np.arange(len(labels))
        width = 0.35

        fig, ax = plt.subplots(figsize=FIGSIZE)
        bars_fly = ax.bar(x - width / 2, fly_vals, width, label="Fly.io", color=FLY_COLOR)
        bars_aws = ax.bar(x + width / 2, aws_vals, width, label="AWS",    color=AWS_COLOR)

        _annotate_bars(ax, bars_fly)
        _annotate_bars(ax, bars_aws)

        ax.set_xlabel("Endpoint / concurrency mode")
        ax.set_ylabel("p50 latency (ms)")
        ax.set_title("Test A — /health + /session latency (p50, lower is better, no LLM)")
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.legend()
        ax.grid(True, alpha=0.3, axis="y")
        plt.tight_layout()
        _save(fig, out_dir, name)
    except Exception as exc:  # noqa: BLE001
        _warn(name, f"unexpected error: {exc}")


# ---------------------------------------------------------------------------
# Chart 2 — Test B: Edge TTFB
# ---------------------------------------------------------------------------

def chart_ttfb_comparison(stats: dict, out_dir: Path) -> None:
    name = "ttfb_comparison.png"
    try:
        tb = stats.get("test_b") or {}
        fly = tb.get("fly") or {}
        aws = tb.get("aws") or {}

        groups = [
            ("Root HTML", "root_ttfb_p50_ms"),
            ("JS chunk",  "js_chunk_ttfb_p50_ms"),
        ]

        fly_vals = [fly.get(k) for _, k in groups]
        aws_vals = [aws.get(k) for _, k in groups]
        if all(v is None for v in fly_vals) and all(v is None for v in aws_vals):
            return _warn(name, "no test_b data in stats.json")

        labels = [g[0] for g in groups]
        fly_vals = [v if v is not None else 0.0 for v in fly_vals]
        aws_vals = [v if v is not None else 0.0 for v in aws_vals]

        import numpy as np
        x = np.arange(len(labels))
        width = 0.35

        fig, ax = plt.subplots(figsize=FIGSIZE)
        # Leave room below for the metadata text box
        fig.subplots_adjust(bottom=0.28)

        bars_fly = ax.bar(x - width / 2, fly_vals, width, label="Fly.io (Anycast)", color=FLY_COLOR)
        bars_aws = ax.bar(x + width / 2, aws_vals, width, label="AWS (CloudFront)",  color=AWS_COLOR)

        _annotate_bars(ax, bars_fly)
        _annotate_bars(ax, bars_aws)

        ax.set_xlabel("Asset")
        ax.set_ylabel("TTFB p50 (ms)")
        ax.set_title("Test B — Edge TTFB: CloudFront vs Fly Anycast")
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.legend()
        ax.grid(True, alpha=0.3, axis="y")

        # --- metadata text box ------------------------------------------------
        # JS chunk size (bytes → KB) and cache-control headers
        fly_chunk_kb: str = "—"
        aws_chunk_kb: str = "—"
        fly_cc: str = fly.get("cache_control") or "—"
        aws_cc: str = aws.get("cache_control") or "—"

        fly_bytes = fly.get("js_chunk_size_bytes")
        aws_bytes = aws.get("js_chunk_size_bytes")
        if fly_bytes is not None:
            fly_chunk_kb = f"{fly_bytes / 1024:.1f} KB"
        if aws_bytes is not None:
            aws_chunk_kb = f"{aws_bytes / 1024:.1f} KB"

        meta_lines = [
            f"Fly.io  — JS chunk: {fly_chunk_kb}  |  cache-control: {fly_cc}",
            f"AWS     — JS chunk: {aws_chunk_kb}  |  cache-control: {aws_cc}",
        ]
        meta_text = "\n".join(meta_lines)
        fig.text(
            0.5, 0.04, meta_text,
            ha="center", va="bottom",
            fontsize=8, family="monospace",
            bbox=dict(boxstyle="round,pad=0.4", fc="lightyellow", ec="gray", alpha=0.8),
        )

        _save(fig, out_dir, name)
    except Exception as exc:  # noqa: BLE001
        _warn(name, f"unexpected error: {exc}")


# ---------------------------------------------------------------------------
# Chart 3 — Test D: Lookup-heavy agent latency per case
# ---------------------------------------------------------------------------

def chart_lookup_latency_boxplot(stats: dict, out_dir: Path) -> None:
    name = "lookup_latency_boxplot.png"
    try:
        td = stats.get("test_d") or {}
        fly_d = td.get("fly") or {}
        aws_d = td.get("aws") or {}

        fly_cases: dict = fly_d.get("per_case") or {}
        aws_cases: dict = aws_d.get("per_case") or {}

        if not fly_cases and not aws_cases:
            return _warn(name, "no test_d per_case data in stats.json")

        # Collect all case IDs preserving sorted order (L1..L8 sort naturally)
        all_ids = sorted(set(list(fly_cases.keys()) + list(aws_cases.keys())))
        if not all_ids:
            return _warn(name, "per_case dicts present but empty")

        # Use p50 latency as the representative value (box plot requires raw samples
        # which are not preserved in stats.json — fall back to grouped bar from p50).
        fly_p50 = [fly_cases.get(cid, {}).get("latency_p50_ms") for cid in all_ids]
        aws_p50 = [aws_cases.get(cid, {}).get("latency_p50_ms") for cid in all_ids]

        import numpy as np
        x = np.arange(len(all_ids))
        width = 0.35

        fig, ax = plt.subplots(figsize=FIGSIZE)

        bars_fly = ax.bar(
            x - width / 2,
            [v if v is not None else 0.0 for v in fly_p50],
            width, label="Fly.io", color=FLY_COLOR,
        )
        bars_aws = ax.bar(
            x + width / 2,
            [v if v is not None else 0.0 for v in aws_p50],
            width, label="AWS", color=AWS_COLOR,
        )

        _annotate_bars(ax, bars_fly)
        _annotate_bars(ax, bars_aws)

        ax.set_xlabel("Test case")
        ax.set_ylabel("End-to-end latency p50 (ms)")
        ax.set_title(
            "Test D — Lookup-heavy agent latency (LLM held constant)\n"
            "p50 per case (raw samples not retained in stats.json)"
        )
        ax.set_xticks(x)
        ax.set_xticklabels(all_ids, rotation=0)
        ax.legend()
        ax.grid(True, alpha=0.3, axis="y")
        plt.tight_layout()
        _save(fig, out_dir, name)
    except Exception as exc:  # noqa: BLE001
        _warn(name, f"unexpected error: {exc}")


# ---------------------------------------------------------------------------
# Chart 4 — Test H: Monthly infra cost
# ---------------------------------------------------------------------------

def chart_cost_per_1000(stats: dict, out_dir: Path) -> None:
    name = "cost_per_1000.png"
    try:
        th = stats.get("test_h")
        if not th:
            return _warn(name, "no test_h data in stats.json")

        fly_h = th.get("fly") or {}
        aws_h = th.get("aws")

        fly_total = fly_h.get("monthly_total_usd")
        if fly_total is None:
            return _warn(name, "test_h.fly.monthly_total_usd missing")

        fig, ax = plt.subplots(figsize=FIGSIZE)

        # --- Fly bar (single "monthly infra" segment) -------------------------
        fly_bar = ax.bar(
            ["Fly.io"],
            [fly_total],
            color=FLY_COLOR,
            label="Fly monthly infra",
        )
        ax.text(
            fly_bar[0].get_x() + fly_bar[0].get_width() / 2.0,
            fly_total + fly_total * 0.02,
            f"${fly_total:.2f}",
            ha="center", va="bottom", fontsize=9,
        )

        # --- AWS stacked bar (per-component breakdown) -----------------------
        if aws_h is not None:
            breakdown: dict = aws_h.get("breakdown") or {}
            aws_total = aws_h.get("monthly_total_usd") or 0.0

            # Define component order and colours
            component_order = [
                ("fargate",    "#146EB4"),   # AWS blue shades
                ("rds",        "#1A91DA"),
                ("alb",        "#2EB872"),
                ("cloudfront", "#FF6B00"),
                ("ecr",        "#8C4FFF"),
                ("cloudwatch", "#D9534F"),
            ]

            bottom = 0.0
            for comp, color in component_order:
                val = breakdown.get(comp, 0.0) or 0.0
                if val <= 0:
                    continue
                bar = ax.bar(
                    ["AWS"],
                    [val],
                    bottom=bottom,
                    color=color,
                    label=f"AWS {comp}",
                )
                # Label segments that are large enough to be readable
                if val / aws_total > 0.05:
                    ax.text(
                        bar[0].get_x() + bar[0].get_width() / 2.0,
                        bottom + val / 2.0,
                        f"{comp}\n${val:.2f}",
                        ha="center", va="center",
                        fontsize=7, color="white", fontweight="bold",
                    )
                bottom += val

            # Total annotation above AWS bar
            ax.text(
                0.75, aws_total + aws_total * 0.02,
                f"${aws_total:.2f}",
                ha="center", va="bottom", fontsize=9,
            )

            comparison = th.get("comparison") or {}
            multiplier = comparison.get("aws_premium_multiplier")
            if multiplier is not None:
                ax.set_title(
                    f"Test H — Monthly infra cost (AWS breakdown vs Fly fixed)\n"
                    f"AWS is {multiplier:.1f}x Fly  |  LLM cost (OpenRouter) identical, excluded"
                )
            else:
                ax.set_title("Test H — Monthly infra cost (AWS breakdown vs Fly fixed)")
        else:
            ax.set_title(
                "Test H — Monthly infra cost (Fly only — AWS billing data not provided)"
            )

        ax.set_ylabel("USD / month")
        ax.legend(loc="upper right", fontsize=8)
        ax.grid(True, alpha=0.3, axis="y")
        plt.tight_layout()
        _save(fig, out_dir, name)
    except Exception as exc:  # noqa: BLE001
        _warn(name, f"unexpected error: {exc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    _SCRIPTS = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description="Generate infra-comparison charts from stats.json."
    )
    parser.add_argument(
        "--stats-path",
        default=str(_SCRIPTS.parent / "data" / "stats.json"),
        help="Path to stats.json produced by aggregate_stats.py "
             "(default: ../data/stats.json relative to this script)",
    )
    parser.add_argument(
        "--out-dir",
        default=str(_SCRIPTS.parent / "charts"),
        help="Output directory for PNG files "
             "(default: ../charts relative to this script)",
    )
    args = parser.parse_args(argv)

    stats_path = Path(args.stats_path)
    out_dir = Path(args.out_dir)

    stats = _load_stats(stats_path)
    if stats is None:
        return 1

    chart_latency_microbench(stats, out_dir)
    chart_ttfb_comparison(stats, out_dir)
    chart_lookup_latency_boxplot(stats, out_dir)
    chart_cost_per_1000(stats, out_dir)

    return 0


if __name__ == "__main__":
    sys.exit(main())
