"""Cache spike analysis — compute prompt-bloat numbers from message dumps.

Consumes the env-gated dumps written by orchestrator.py (when
`SGA_EVAL_DUMP_MESSAGES=1` is set) in `evals/phase2/.spike_dumps/`. Reports:

    (a) system prompt tokens
    (b) tool-result bloat (total, per-tool, largest single)
    (c) stable vs volatile token split across iterations of ONE case
    (d) projected additional savings from explicit cache_control

Token counting uses tiktoken cl100k_base. Run with:

    uv run --with tiktoken python evals/phase2/scripts/cache_spike_analysis.py

The orchestrator instrumentation is reverted after dumps are captured; this
script operates purely on the dump files on disk.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import tiktoken

DUMP_DIR = Path(__file__).parent.parent / ".spike_dumps"

# From existing baseline main-2026-04-17.json (captured at same git ref).
BASELINE = {
    "prompt_tokens": 110853,
    "completion_tokens": 3606,
    "cached_tokens": 88064,
    "total_cost_usd": 0.039,
    # 11 cases, so per-run figures are these divided by 11.
    "cases": 11,
}

ENC = tiktoken.get_encoding("cl100k_base")


def tcount(s: str) -> int:
    """Token count for a string. Empty string → 0."""
    if not s:
        return 0
    return len(ENC.encode(s))


def message_token_count(msg: dict) -> int:
    """Count tokens in all textual payloads of a single message dict.

    Covers: role, content, name, tool_call_id, assistant tool_calls
    (function name + arguments), plus a small fixed per-message overhead
    (4 tokens) matching OpenAI's tokens-per-message convention.
    """
    n = 4  # per-message overhead (role framing)
    role = msg.get("role", "")
    n += tcount(role)
    content = msg.get("content")
    if isinstance(content, str):
        n += tcount(content)
    elif isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                n += tcount(json.dumps(part, ensure_ascii=False))
            else:
                n += tcount(str(part))
    if msg.get("name"):
        n += tcount(msg["name"])
    if msg.get("tool_call_id"):
        n += tcount(msg["tool_call_id"])
    for tc in msg.get("tool_calls") or []:
        fn = tc.get("function", {}) or {}
        n += tcount(fn.get("name", ""))
        n += tcount(fn.get("arguments", ""))
        n += tcount(tc.get("id", ""))
        n += 4
    return n


def classify(msg: dict) -> str:
    """Return role + sub-kind: system, user, assistant_text, assistant_tool_calls, tool."""
    role = msg.get("role", "unknown")
    if role == "assistant":
        if msg.get("tool_calls"):
            return "assistant_tool_calls"
        return "assistant_text"
    return role  # system | user | tool


def load_dumps(dump_dir: Path = DUMP_DIR) -> list[dict]:
    """Load every *.json dump, sorted by filename (case + iter + ts lex sort)."""
    files = sorted(dump_dir.glob("*.json"))
    out = []
    for f in files:
        with open(f, "r", encoding="utf-8") as fh:
            d = json.load(fh)
        d["_file"] = f.name
        # parse case+iter out of filename if `case` key isn't accurate
        # filename: {case}_iter{NN}_{ts}.json
        m = re.match(r"^(?P<case>.+?)_iter(?P<iter>\d+)_\d+\.json$", f.name)
        if m:
            d["_case"] = m.group("case")
            d["_iter"] = int(m.group("iter"))
        else:
            d["_case"] = d.get("case", "?")
            d["_iter"] = int(d.get("iteration", 0))
        out.append(d)
    return out


# --------- (a) system prompt tokens ----------
def analyze_system_prompt(dumps: list[dict]) -> dict:
    """Return token count of the system prompt (first message, role=system)."""
    # All dumps share the same system prompt — take the first.
    if not dumps:
        return {"tokens": 0, "preview": ""}
    sys_msg = dumps[0]["messages"][0]
    assert sys_msg.get("role") == "system", f"expected system, got {sys_msg.get('role')}"
    content = sys_msg.get("content", "")
    tokens = tcount(content)
    # Rough section breakdown: split on blank lines and token-count each section >200 tokens.
    sections = []
    running = []
    for para in content.split("\n\n"):
        running.append(para)
    # simpler: top-level split on H2 markdown or similar
    header_re = re.compile(r"^#+\s", re.MULTILINE)
    hdr_positions = [m.start() for m in header_re.finditer(content)]
    if hdr_positions:
        hdr_positions.append(len(content))
        for i in range(len(hdr_positions) - 1):
            chunk = content[hdr_positions[i]:hdr_positions[i + 1]]
            first_line = chunk.splitlines()[0] if chunk.splitlines() else ""
            sections.append({"header": first_line.strip(), "tokens": tcount(chunk)})
    return {
        "tokens": tokens,
        "length_chars": len(content),
        "sections": sections[:20],  # top-level only
    }


# --------- (b) tool-result bloat ----------
def analyze_tool_results(dumps: list[dict]) -> dict:
    """Total / per-tool / largest tool-result tokens across all dumps.

    Iterate all dumps (and therefore see each tool result multiple times as
    iterations grow the list); to avoid double-counting, we look at the LAST
    iteration of each case — that one contains every tool result that ran.
    """
    # pick last-iter dump for each case
    by_case: dict[str, dict] = {}
    for d in dumps:
        c = d["_case"]
        if c not in by_case or d["_iter"] > by_case[c]["_iter"]:
            by_case[c] = d

    per_tool_totals: dict[str, int] = defaultdict(int)
    per_tool_counts: dict[str, int] = defaultdict(int)
    largest = {"tokens": 0, "tool": None, "case": None, "preview": ""}
    grand_total = 0

    for case, d in by_case.items():
        msgs = d["messages"]
        # map tool_call_id -> function name by scanning assistant tool_calls
        id_to_name: dict[str, str] = {}
        for m in msgs:
            if m.get("role") == "assistant":
                for tc in m.get("tool_calls") or []:
                    id_to_name[tc.get("id", "")] = (tc.get("function") or {}).get("name", "unknown")

        for m in msgs:
            if m.get("role") != "tool":
                continue
            name = m.get("name") or id_to_name.get(m.get("tool_call_id", ""), "unknown")
            content = m.get("content", "") or ""
            tks = tcount(content) if isinstance(content, str) else tcount(json.dumps(content, ensure_ascii=False))
            per_tool_totals[name] += tks
            per_tool_counts[name] += 1
            grand_total += tks
            if tks > largest["tokens"]:
                preview = content[:160] if isinstance(content, str) else str(content)[:160]
                largest = {"tokens": tks, "tool": name, "case": case, "preview": preview}

    return {
        "total_tool_result_tokens": grand_total,
        "per_tool": [
            {"tool": t, "count": per_tool_counts[t], "tokens": per_tool_totals[t]}
            for t in sorted(per_tool_totals, key=lambda k: -per_tool_totals[k])
        ],
        "largest": largest,
        "cases_analyzed": list(by_case.keys()),
    }


# --------- (c) stable vs volatile ----------
def analyze_stable_volatile(dumps: list[dict], case: str = "A1") -> dict:
    """For ONE case, compare messages across iterations.

    'Stable' = prefix that is byte-identical across every iteration up to and
    including the last. 'Volatile' = everything after the stable prefix in the
    last iteration (plus by implication any intermediate churn, but by
    definition of a stable prefix that must equal volatile-in-last if the
    prefix is maximal).
    """
    case_dumps = sorted(
        [d for d in dumps if d["_case"] == case], key=lambda d: d["_iter"]
    )
    if len(case_dumps) < 2:
        return {"error": f"Need >=2 iterations for case {case}, have {len(case_dumps)}"}

    # Serialize each iteration's messages as list of bytes-per-message so we can
    # compare message-by-message (messages are either identical or divergent;
    # they don't mutate in place).
    def msg_blob(m: dict) -> str:
        return json.dumps(m, ensure_ascii=False, sort_keys=True, default=str)

    per_iter_blobs = [[msg_blob(m) for m in d["messages"]] for d in case_dumps]
    last = per_iter_blobs[-1]

    # Find the max prefix length P such that for every earlier iter i,
    # per_iter_blobs[i][:min(P, len(per_iter_blobs[i]))] matches last[:...].
    # The idea: a message is stable iff it appears identically in EVERY
    # iteration that had an index that deep. (Later iterations have strictly
    # more messages, so we only need to check that each earlier iter's entry
    # matches last's entry.)
    P = 0
    for idx in range(len(last)):
        ok = True
        for earlier in per_iter_blobs[:-1]:
            if idx < len(earlier) and earlier[idx] != last[idx]:
                ok = False
                break
        if ok:
            P += 1
        else:
            break

    stable_msgs = case_dumps[-1]["messages"][:P]
    volatile_msgs = case_dumps[-1]["messages"][P:]

    stable_tokens = sum(message_token_count(m) for m in stable_msgs)
    volatile_tokens = sum(message_token_count(m) for m in volatile_msgs)
    total = stable_tokens + volatile_tokens

    stable_roles = defaultdict(int)
    for m in stable_msgs:
        stable_roles[classify(m)] += message_token_count(m)
    volatile_roles = defaultdict(int)
    for m in volatile_msgs:
        volatile_roles[classify(m)] += message_token_count(m)

    return {
        "case": case,
        "iterations_compared": len(case_dumps),
        "iter_message_counts": [len(b) for b in per_iter_blobs],
        "stable_prefix_msgs": P,
        "total_msgs_last_iter": len(last),
        "stable_tokens": stable_tokens,
        "volatile_tokens": volatile_tokens,
        "total_tokens_last_iter": total,
        "stable_pct": (stable_tokens / total * 100) if total else 0.0,
        "volatile_pct": (volatile_tokens / total * 100) if total else 0.0,
        "stable_by_role": dict(stable_roles),
        "volatile_by_role": dict(volatile_roles),
    }


# --------- (d) projected cache_control savings ----------
def analyze_projected_savings(stable_vs_volatile: dict) -> dict:
    """Compute projected $/run savings from explicit cache_control on top of the
    existing ~79.4% auto-cache hit rate.

    Formula (per issue):
        auto_cache_pct = 88064 / 110853 ≈ 79.4%
        uncached_tokens_per_run = 110853/11 * (1 - 0.794) ≈ 2076 per run
        uncached_cost_share ≈ 20.6% × $0.039/run total ≈ $0.008/run

    Of those uncached tokens, only the portion that is STABLE across iterations
    can be recovered by explicit cache_control (since volatile content changes
    per iteration, cache_control can't help).

    Inputs from stable_vs_volatile give stable_pct — we assume uncached tokens
    are distributed proportionally (conservative; the actual auto-cache likely
    already hit the most stable stuff first, so this is an upper bound on
    remaining savings).
    """
    prompt_tokens_agg = BASELINE["prompt_tokens"]  # 110853 across 11 cases
    cached_tokens_agg = BASELINE["cached_tokens"]
    cost_agg = BASELINE["total_cost_usd"]
    cases = BASELINE["cases"]

    auto_cache_pct = cached_tokens_agg / prompt_tokens_agg
    uncached_tokens_agg = prompt_tokens_agg - cached_tokens_agg
    per_run_prompt = prompt_tokens_agg / cases
    per_run_uncached = uncached_tokens_agg / cases
    # Cost share of uncached = (1 - auto_cache_pct) × total cost as a first-order proxy.
    # (Exact formula needs the cache-discount ratio; we follow the mission spec.)
    per_run_cost = cost_agg / cases
    per_run_uncached_cost = (1 - auto_cache_pct) * per_run_cost

    stable_pct = stable_vs_volatile.get("stable_pct", 0) / 100.0
    volatile_pct = stable_vs_volatile.get("volatile_pct", 0) / 100.0

    # Upper bound: X% of uncached tokens could be cacheable if they're stable.
    cacheable_tokens_per_run = per_run_uncached * stable_pct
    non_cacheable_tokens_per_run = per_run_uncached * volatile_pct

    projected_savings_per_run = cacheable_tokens_per_run / per_run_uncached * per_run_uncached_cost \
        if per_run_uncached else 0.0
    pct_delta_on_total_cost = (projected_savings_per_run / per_run_cost * 100) if per_run_cost else 0.0

    return {
        "inputs": {
            "auto_cache_pct": auto_cache_pct,
            "uncached_tokens_per_run": round(per_run_uncached, 1),
            "uncached_cost_per_run_usd": round(per_run_uncached_cost, 5),
            "per_run_total_cost_usd": round(per_run_cost, 5),
            "stable_pct_observed": stable_pct,
            "volatile_pct_observed": volatile_pct,
        },
        "cacheable_stable_tokens_per_run": round(cacheable_tokens_per_run, 1),
        "non_cacheable_volatile_tokens_per_run": round(non_cacheable_tokens_per_run, 1),
        "projected_savings_per_run_usd": round(projected_savings_per_run, 5),
        "pct_delta_on_total_cost": round(pct_delta_on_total_cost, 2),
    }


def main() -> int:
    dumps = load_dumps()
    if not dumps:
        print(f"No dumps found in {DUMP_DIR}", file=sys.stderr)
        return 1

    print(f"Loaded {len(dumps)} dumps from {DUMP_DIR}")
    print(f"Cases: {sorted({d['_case'] for d in dumps})}")
    print()

    a = analyze_system_prompt(dumps)
    print("== (a) System prompt ==")
    print(json.dumps({"tokens": a["tokens"], "length_chars": a["length_chars"]}, indent=2))
    print("  sections:")
    for s in a["sections"]:
        print(f"    {s['tokens']:>5} tok  {s['header'][:100]}")
    print()

    b = analyze_tool_results(dumps)
    print("== (b) Tool-result bloat ==")
    print(json.dumps({k: v for k, v in b.items() if k != "per_tool"}, indent=2))
    print("  per tool:")
    for row in b["per_tool"]:
        avg = row["tokens"] // max(row["count"], 1)
        print(f"    {row['tokens']:>6} tok  ({row['count']} calls, avg {avg})  {row['tool']}")
    print()

    c = analyze_stable_volatile(dumps, case="A1")
    print("== (c) Stable vs volatile (A1) ==")
    print(json.dumps(c, indent=2, default=str))
    print()

    d = analyze_projected_savings(c)
    print("== (d) Projected cache_control savings ==")
    print(json.dumps(d, indent=2))
    print()

    # Also emit the raw numbers as JSON so the report can import them.
    out_path = DUMP_DIR / "_analysis_output.json"
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(
            {"system_prompt": a, "tool_results": b, "stable_volatile_A1": c, "projected": d},
            fh,
            indent=2,
            default=str,
        )
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
