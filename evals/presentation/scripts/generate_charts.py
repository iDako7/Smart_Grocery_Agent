"""Generate 5 presentation charts from load-test + quality-eval data.

Run from repo root: `python evals/presentation/scripts/generate_charts.py`
"""
from __future__ import annotations

import glob
import json
import math
from pathlib import Path
from typing import Iterable

import matplotlib
import matplotlib.pyplot as plt
import pandas as pd

matplotlib.use("Agg")
plt.style.use("seaborn-v0_8-whitegrid")

DATA_DIR = Path("evals/presentation/data")
CHARTS_DIR = Path("evals/presentation/charts")
FIGSIZE = (8, 5)
DPI = 150


def _save(fig: plt.Figure, name: str) -> None:
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)
    out = CHARTS_DIR / name
    fig.savefig(out, dpi=DPI, bbox_inches="tight")
    plt.close(fig)
    print(f"[ok]   {name} -> {out}")


def _skip(chart: str, reason: str) -> None:
    print(f"[skip] {chart}: {reason}")


def _glob(pattern: str) -> list[Path]:
    return sorted(Path(p) for p in glob.glob(str(DATA_DIR / pattern)))


def _load_locust_stats(paths: Iterable[Path]) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for p in paths:
        try:
            df = pd.read_csv(p)
            df["__source__"] = p.name
            frames.append(df)
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] could not read {p.name}: {exc}")
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _percentile(series: pd.Series, q: float) -> float:
    return float(series.quantile(q))


_PERCENTILE_COLS = [("50%", 0.50), ("66%", 0.66), ("75%", 0.75), ("80%", 0.80),
                    ("90%", 0.90), ("95%", 0.95), ("98%", 0.98), ("99%", 0.99),
                    ("99.9%", 0.999), ("100%", 1.0)]


def chart_latency_cdf() -> None:
    """CDF of POST /chat latency built from the percentile columns in _stats.csv.

    Locust's stats_history.csv only contains aggregated rows, so we build a step CDF
    from the per-endpoint percentile points captured in *_stats.csv at run-end.
    Plot ramp 1u, 5u, 10u, 20u together to show distributional shift under load.
    """
    name = "latency_cdf.png"
    try:
        ramp_paths = sorted(p for p in _glob("locust_ramp_*_stats.csv")
                            if not p.name.endswith(("_stats_history.csv", "_failures.csv",
                                                    "_exceptions.csv")))
        steady_paths = [p for p in _glob("locust_steady_stats.csv")
                        if not p.name.endswith(("_stats_history.csv", "_failures.csv",
                                                "_exceptions.csv"))]
        all_paths = ramp_paths + steady_paths
        if not all_paths:
            return _skip(name, "no locust_*_stats.csv found")

        fig, ax = plt.subplots(figsize=FIGSIZE)
        plotted = 0
        for p in all_paths:
            try:
                df = pd.read_csv(p)
            except Exception:
                continue
            chat = df[df.get("Name", pd.Series(dtype=str)).astype(str)
                      .str.contains("/chat", na=False, regex=False)]
            if chat.empty:
                continue
            row = chat.iloc[0]
            label_stem = p.stem.replace("locust_", "").replace("_stats", "")
            xs, ys = [], []
            for col, q in _PERCENTILE_COLS:
                if col in chat.columns:
                    try:
                        v = float(row[col])
                    except (ValueError, TypeError):
                        continue
                    xs.append(v)
                    ys.append(q)
            if not xs:
                continue
            ax.plot(xs, ys, marker="o", linewidth=2, label=label_stem)
            plotted += 1

        if not plotted:
            return _skip(name, "no /chat percentile rows usable")
        ax.set_xlabel("POST /chat latency (ms) — end-to-end SSE time-to-done")
        ax.set_ylabel("Cumulative probability")
        ax.set_title("Chat latency CDF — ramp + steady (5u, 5min)")
        ax.set_ylim(0, 1.02)
        ax.legend(loc="lower right", fontsize=8)
        ax.grid(True, alpha=0.3)
        _save(fig, name)
    except Exception as exc:  # noqa: BLE001
        _skip(name, f"unexpected error: {exc}")


def chart_throughput_knee() -> None:
    name = "throughput_knee.png"
    try:
        ramp_paths = [p for p in _glob("locust_ramp_*_stats.csv")
                      if not p.name.endswith(("_stats_history.csv", "_failures.csv"))]
        if not ramp_paths:
            return _skip(name, "no locust_ramp_*_stats.csv found")
        points: list[tuple[int, float, float]] = []
        for p in ramp_paths:
            stem = p.name
            try:
                concurrency = int(stem.split("ramp_", 1)[1].split("u", 1)[0])
            except (IndexError, ValueError):
                print(f"[warn] cannot parse concurrency from {stem}"); continue
            try:
                df = pd.read_csv(p)
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] cannot read {stem}: {exc}"); continue
            chat_rows = df[df.get("Name", pd.Series(dtype=str)).astype(str)
                           .str.contains("/chat", na=False, regex=False)]
            if chat_rows.empty:
                print(f"[warn] no /chat row in {stem}"); continue
            row = chat_rows.iloc[0]
            try:
                rps = float(row["Requests/s"])
                # Locust _stats.csv uses "50%"; _stats_history.csv uses "Median Response Time".
                median_raw = row.get("Median Response Time")
                if median_raw is None or pd.isna(median_raw):
                    median_raw = row.get("50%")
                median_ms = float(median_raw)
            except (KeyError, ValueError, TypeError) as exc:
                print(f"[warn] missing Requests/s or median in {stem}: {exc}"); continue
            points.append((concurrency, rps, median_ms))
        if not points:
            return _skip(name, "no ramp rows yielded usable RPS/latency")
        points.sort(key=lambda t: t[0])
        fig, ax = plt.subplots(figsize=FIGSIZE)
        xs = [p[1] for p in points]
        ys = [p[2] for p in points]
        ax.plot(xs, ys, marker="o", linewidth=2, markersize=8, color="#2c7fb8")
        for concurrency, rps, median in points:
            ax.annotate(f"{concurrency} users", (rps, median),
                        textcoords="offset points", xytext=(8, 6), fontsize=9)
        ax.set_xlabel("Achieved throughput (requests / second)")
        ax.set_ylabel("Median chat latency (ms)")
        ax.set_title("Throughput vs latency knee - POST /session/{id}/chat")
        _save(fig, name)
    except Exception as exc:  # noqa: BLE001
        _skip(name, f"unexpected error: {exc}")


def chart_cache_hit_over_time() -> None:
    """Cache hit ratio distribution from steady _stats.csv percentiles.

    Locust history CSV only writes Aggregated rows (no per-endpoint), so we plot
    the percentile distribution of sse_prompt_cache_ratio_x1000 across all
    requests in the steady run as a percentile bar chart instead.
    """
    name = "cache_hit_over_time.png"
    try:
        steady_paths = [p for p in _glob("locust_steady_stats.csv")
                        if not p.name.endswith(("_stats_history.csv", "_failures.csv",
                                                "_exceptions.csv"))]
        if not steady_paths:
            return _skip(name, "no locust_steady_stats.csv found")
        df = pd.read_csv(steady_paths[0])
        sub = df[(df.get("Type", pd.Series(dtype=str)) == "SSE")
                 & (df.get("Name", pd.Series(dtype=str)) == "sse_prompt_cache_ratio_x1000")]
        if sub.empty:
            return _skip(name, "no sse_prompt_cache_ratio_x1000 rows in stats")
        row = sub.iloc[0]
        labels, values = [], []
        for col, q in _PERCENTILE_COLS:
            if col in sub.columns:
                try:
                    v = float(row[col]) / 1000.0
                except (ValueError, TypeError):
                    continue
                labels.append(f"p{int(q*100) if q < 1 else 100}")
                values.append(v)
        if not values:
            return _skip(name, "no usable percentile columns")
        try:
            mean_ratio = float(row["Average Response Time"]) / 1000.0
        except (ValueError, TypeError, KeyError):
            mean_ratio = None

        fig, ax = plt.subplots(figsize=FIGSIZE)
        bars = ax.bar(labels, values, color="#41ab5d", edgecolor="white")
        if mean_ratio is not None:
            ax.axhline(mean_ratio, color="#08519c", linestyle="--", linewidth=2,
                       label=f"mean = {mean_ratio:.2%}")
            ax.legend(loc="lower right")
        for bar, v in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width()/2, v + 0.02, f"{v:.0%}",
                    ha="center", fontsize=8)
        ax.set_ylim(0, 1.05)
        ax.set_ylabel("Prompt cache hit ratio (cached / total prompt tokens)")
        ax.set_xlabel("Percentile across requests")
        ax.set_title("OpenRouter prompt cache hit ratio — distribution (5u steady, 5 min)")
        ax.grid(True, alpha=0.3, axis="y")
        _save(fig, name)
    except Exception as exc:  # noqa: BLE001
        _skip(name, f"unexpected error: {exc}")


def _iter_promptfoo_results(paths: Iterable[Path]):
    for p in paths:
        try:
            with p.open() as fh:
                payload = json.load(fh)
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] cannot read {p.name}: {exc}")
            continue
        results = (payload.get("results") or {}).get("results")
        if not isinstance(results, list):
            continue
        for r in results:
            yield p, r


def _promptfoo_paths() -> list[Path]:
    """Prefer *_nocache_* runs (true independent samples). Cached runs duplicate."""
    nocache = _glob("promptfoo_*_nocache_*.json")
    return nocache or _glob("promptfoo_*.json")


def chart_cost_per_convo() -> None:
    name = "cost_per_convo.png"
    try:
        paths = _promptfoo_paths()
        if not paths:
            return _skip(name, "no promptfoo_*.json found")
        costs: list[float] = []
        for _, r in _iter_promptfoo_results(paths):
            try:
                v = float(r.get("cost"))
            except (TypeError, ValueError):
                continue
            if math.isfinite(v) and v > 0:
                costs.append(v)
        if not costs:
            return _skip(name, "no positive cost values in promptfoo results")
        mean = sum(costs) / len(costs)
        median = float(pd.Series(costs).median())
        fig, ax = plt.subplots(figsize=FIGSIZE)
        ax.hist(costs, bins=min(20, max(5, len(costs) // 2)),
                color="#fdae6b", edgecolor="white")
        ax.axvline(mean, color="#d94801", linestyle="--", linewidth=2,
                   label=f"mean = ${mean:.4f}")
        ax.axvline(median, color="#08519c", linestyle=":", linewidth=2,
                   label=f"median = ${median:.4f}")
        ax.set_xlabel("Cost per conversation (USD)")
        ax.set_ylabel("Conversation count")
        ax.set_title(f"Cost per conversation (n={len(costs)})")
        ax.legend(loc="upper right")
        _save(fig, name)
    except Exception as exc:  # noqa: BLE001
        _skip(name, f"unexpected error: {exc}")


_PREFERRED_SCORE_KEYS = (
    "overall_quality",
    "dietary_compliance",
    "recipes_swap_quality",
    "vague_input_handling",
    "dish_count",
)


def _pick_score(named: dict) -> tuple[str | None, float | None]:
    if not isinstance(named, dict):
        return None, None
    for key in _PREFERRED_SCORE_KEYS:
        if key in named:
            try:
                return key, float(named[key])
            except (TypeError, ValueError):
                continue
    for k, v in named.items():
        try:
            return k, float(v)
        except (TypeError, ValueError):
            continue
    return None, None


def _case_id(result: dict) -> str:
    tc = result.get("testCase") or {}
    desc = tc.get("description")
    if desc:
        return str(desc)
    vars_ = result.get("vars") or {}
    cat = vars_.get("category")
    inp = vars_.get("input")
    if cat and inp:
        return f"{cat}: {str(inp)[:40]}"
    if inp:
        return str(inp)[:60]
    idx = result.get("testIdx")
    if idx is not None:
        return f"case #{idx}"
    return "unknown"


def chart_quality_variance() -> None:
    name = "quality_variance.png"
    try:
        paths = _promptfoo_paths()
        if not paths:
            return _skip(name, "no promptfoo_*.json found")
        per_case: dict[str, dict[str, list[float]]] = {}
        chosen_metric: str | None = None
        for _, r in _iter_promptfoo_results(paths):
            named = r.get("namedScores")
            if not isinstance(named, dict) or not named:
                grading = r.get("gradingResult") or {}
                named = grading.get("namedScores") if isinstance(grading, dict) else None
            metric, score = _pick_score(named or {})
            if metric is None or score is None:
                continue
            cid = _case_id(r)
            per_case.setdefault(cid, {}).setdefault(metric, []).append(score)
            if chosen_metric is None and metric in _PREFERRED_SCORE_KEYS:
                chosen_metric = metric
        if not per_case:
            return _skip(name, "no usable namedScores across promptfoo results")
        if chosen_metric is None:
            tally: dict[str, int] = {}
            for metrics in per_case.values():
                for m in metrics:
                    tally[m] = tally.get(m, 0) + 1
            chosen_metric = max(tally, key=tally.get)
        labels, means, stds, runs_per_case = [], [], [], []
        for cid, metrics in per_case.items():
            scores = metrics.get(chosen_metric)
            if not scores:
                continue
            labels.append(cid)
            s = pd.Series(scores)
            means.append(float(s.mean()))
            stds.append(float(s.std(ddof=0)) if len(s) > 1 else 0.0)
            runs_per_case.append(len(scores))
        if not labels:
            return _skip(name, f"no cases have metric '{chosen_metric}'")
        max_runs = max(runs_per_case)
        fig, ax = plt.subplots(figsize=FIGSIZE)
        xs = list(range(len(labels)))
        if max_runs > 1:
            ax.bar(xs, means, yerr=stds, capsize=5, color="#74a9cf", edgecolor="white")
            note = f"{max_runs} runs max"
        else:
            ax.bar(xs, means, color="#74a9cf", edgecolor="white")
            note = "single run - no error bars"
        ax.set_xticks(xs)
        ax.set_xticklabels([l if len(l) <= 28 else l[:25] + "..." for l in labels],
                           rotation=30, ha="right", fontsize=9)
        ax.set_xlabel("Test case")
        ax.set_ylabel(f"Score ({chosen_metric})")
        ax.set_title(f"Quality variance per case - {chosen_metric} ({note})")
        _save(fig, name)
    except Exception as exc:  # noqa: BLE001
        _skip(name, f"unexpected error: {exc}")


def main() -> int:
    print(f"data dir:   {DATA_DIR.resolve()}")
    print(f"charts dir: {CHARTS_DIR.resolve()}")
    chart_latency_cdf()
    chart_throughput_knee()
    chart_cache_hit_over_time()
    chart_cost_per_convo()
    chart_quality_variance()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
