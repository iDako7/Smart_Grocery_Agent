"""promptfoo custom Python provider for SGA V2 Phase 2 end-to-end evaluation.

This provider sends real HTTP requests to a running SGA V2 backend, parses
the SSE response stream, and returns structured output that promptfoo
assertions can inspect.

Requirements:
    - Backend running locally (docker compose up)
    - Only uses `requests` (sync) — no async, no project imports

Usage in promptfooconfig.yaml:
    providers:
      - id: python:provider.py

Environment variables:
    SGA_EVAL_BASE_URL  — override backend URL (default: http://localhost:8000)

Test case vars available via context.vars:
    input               — the user message (also passed as `prompt`)
    turns               — list[str] for multi-turn cases (sent on one session)
    screen              — which screen to send (default "home")
    household_size      — profile var (ignored; profile lives in DB)
    dietary_restrictions — profile var (ignored; profile lives in DB)
"""

import json
import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "http://localhost:8000"
CHAT_TIMEOUT = 120  # seconds — LLM calls can be slow


def _get_base_url(options: dict) -> str:
    """Resolve backend base URL from config, env var, or default."""
    config = options.get("config") or {}
    return config.get("base_url") or os.environ.get("SGA_EVAL_BASE_URL") or DEFAULT_BASE_URL


def _health_check(base_url: str) -> None:
    """Verify the backend is reachable. Raises on failure."""
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


def _create_session(base_url: str) -> str:
    """POST /session → session_id."""
    resp = requests.post(f"{base_url}/session", json={}, timeout=30)
    resp.raise_for_status()
    return resp.json()["session_id"]


def _send_chat(base_url: str, session_id: str, message: str, screen: str) -> requests.Response:
    """POST /session/{id}/chat with SSE streaming response."""
    resp = requests.post(
        f"{base_url}/session/{session_id}/chat",
        json={"message": message, "screen": screen},
        timeout=CHAT_TIMEOUT,
    )
    return resp


def _parse_sse(raw_text: str) -> list[tuple[str, dict]]:
    """Parse an SSE stream body into a list of (event_type, data_dict) tuples.

    SSE format:
        event: <type>
        data: <json>

        event: <type>
        data: <json>

    Blank lines separate events. We split on double-newline boundaries,
    then extract event/data lines from each block.
    """
    events = []
    # Split into blocks on blank lines (handles \r\n and \n)
    blocks = raw_text.replace("\r\n", "\n").split("\n\n")
    for block in blocks:
        block = block.strip()
        if not block:
            continue

        event_type = None
        data_line = None

        for line in block.split("\n"):
            if line.startswith("event:"):
                event_type = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data_line = line[len("data:") :].strip()

        if event_type and data_line:
            try:
                data_dict = json.loads(data_line)
            except json.JSONDecodeError:
                data_dict = {"raw": data_line}
            events.append((event_type, data_dict))

    return events


def _extract_token_usage(done: dict | None) -> dict:
    """Pull token_usage nested fields out of the done event.

    Backend (#115 telemetry slice) ships token_usage inside done.data with
    prompt_tokens/completion_tokens/total_tokens/cached_tokens/cache_write_tokens/cost/model.
    """
    tu = {}
    if done and isinstance(done.get("token_usage"), dict):
        tu = done["token_usage"]
    return {
        "prompt_tokens": int(tu.get("prompt_tokens", 0) or 0),
        "completion_tokens": int(tu.get("completion_tokens", 0) or 0),
        "total_tokens": int(tu.get("total_tokens", 0) or 0),
        "cached_tokens": int(tu.get("cached_tokens", 0) or 0),
        "cache_write_tokens": int(tu.get("cache_write_tokens", 0) or 0),
        "cost": float(tu.get("cost", 0.0) or 0.0),
        "model": tu.get("model", ""),
    }


def _sum_token_usage(accumulated: dict, incoming: dict) -> dict:
    """Sum numeric token_usage fields across turns; keep last non-empty model."""
    return {
        "prompt_tokens": accumulated["prompt_tokens"] + incoming["prompt_tokens"],
        "completion_tokens": accumulated["completion_tokens"] + incoming["completion_tokens"],
        "total_tokens": accumulated["total_tokens"] + incoming["total_tokens"],
        "cached_tokens": accumulated["cached_tokens"] + incoming["cached_tokens"],
        "cache_write_tokens": accumulated["cache_write_tokens"] + incoming["cache_write_tokens"],
        "cost": accumulated["cost"] + incoming["cost"],
        "model": incoming["model"] or accumulated["model"],
    }


def _empty_token_usage() -> dict:
    return {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cached_tokens": 0,
        "cache_write_tokens": 0,
        "cost": 0.0,
        "model": "",
    }


def _build_output(
    events: list[tuple[str, dict]],
    token_usage: dict | None = None,
    latency_ms: int = 0,
) -> dict:
    """Build the structured output dict from parsed SSE events of the final turn.

    When called in multi-turn mode, `token_usage` / `latency_ms` are the
    aggregated totals across all turns; `events` are only from the last turn
    (the "output" seen by assertions).
    """
    recipe_cards = [data for etype, data in events if etype == "recipe_card"]
    pcsv = next((data for etype, data in events if etype == "pcsv_update"), None)
    explanation = next(
        (data.get("text", "") for etype, data in events if etype == "explanation"),
        "",
    )
    done = next((data for etype, data in events if etype == "done"), None)

    if token_usage is None:
        token_usage = _extract_token_usage(done)

    prompt_tokens = token_usage["prompt_tokens"]
    cached_tokens = token_usage["cached_tokens"]
    cache_hit_ratio = (cached_tokens / prompt_tokens) if prompt_tokens > 0 else 0.0

    structured = {
        "events": [{"event_type": etype, "data": data} for etype, data in events],
        "recipe_cards": recipe_cards,
        "pcsv": pcsv,
        "explanation": explanation,
        "done": done,
        "dish_count": len(recipe_cards),
        "status": done.get("status", "unknown") if done else "missing_done",
    }

    return {
        "output": json.dumps(structured, ensure_ascii=False),
        "tokenUsage": {
            "total": token_usage["total_tokens"],
            "prompt": prompt_tokens,
            "completion": token_usage["completion_tokens"],
            "cached": cached_tokens,
        },
        "cost": token_usage["cost"],
        "latency_ms": latency_ms,
        "cache_hit_ratio": cache_hit_ratio,
        "metadata": {
            "model": token_usage["model"],
            "cache_write_tokens": token_usage["cache_write_tokens"],
        },
    }


def _run_single_turn(
    base_url: str, session_id: str, message: str, screen: str
) -> tuple[list[tuple[str, dict]], int, dict | None]:
    """Send one chat turn; return (events, latency_ms, error_output_or_None)."""
    t0 = time.monotonic()
    try:
        resp = _send_chat(base_url, session_id, message, screen)
    except requests.Timeout:
        return (
            [],
            int((time.monotonic() - t0) * 1000),
            {"output": json.dumps({"error": "timeout: chat request exceeded 120s"})},
        )
    except requests.ConnectionError:
        return (
            [],
            int((time.monotonic() - t0) * 1000),
            {"output": json.dumps({"error": "connection_error: backend unreachable during chat"})},
        )

    latency_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code != 200:
        body = resp.text[:2000]
        return [], latency_ms, {"output": json.dumps({"error": f"{resp.status_code}: {body}"})}

    events = _parse_sse(resp.text)
    return events, latency_ms, None


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """promptfoo entry point — called once per test case.

    Args:
        prompt: The user message to send to the backend.
        options: Provider config from promptfooconfig.yaml (options.config).
        context: Test case context including context.vars.
    """
    base_url = _get_base_url(options)
    vars_ = (context or {}).get("vars", {})
    screen = vars_.get("screen", "home")

    # Multi-turn support: vars.turns is a list[str]. If both are provided,
    # prefer turns and log a warning.
    #
    # IMPORTANT: in test_cases.yaml, `turns` is encoded as a JSON string (not
    # a YAML list) to prevent promptfoo from expanding list-valued vars into
    # separate parametric test rows (which would break the multi-turn
    # design — same session_id across turns, output = last turn). We decode
    # it here. We also accept a real list defensively (e.g. for ad-hoc uses).
    turns = vars_.get("turns")
    if isinstance(turns, str):
        try:
            decoded = json.loads(turns)
        except json.JSONDecodeError:
            # Fall back to treating it as a single-turn string.
            decoded = [turns]
        if not isinstance(decoded, list) or not all(isinstance(t, str) for t in decoded):
            logger.warning(
                "vars.turns JSON did not decode to list[str] (got %r); treating as single-turn string.",
                type(decoded).__name__,
            )
            turns = [turns]
        else:
            turns = decoded
    elif isinstance(turns, list):
        logger.warning(
            "vars.turns is a raw YAML list — promptfoo may expand it into "
            "separate parametric rows, breaking multi-turn semantics. "
            "Encode it as a JSON string in test_cases.yaml instead."
        )
        if not all(isinstance(t, str) for t in turns):
            logger.warning("vars.turns list contains non-str elements; treating as single-turn.")
            turns = [str(turns)]
    if turns and vars_.get("input"):
        logger.warning("Both vars.input and vars.turns provided; using vars.turns.")
    if not turns:
        turns = [prompt]

    # 1. Health check
    _health_check(base_url)

    # 2. Create session (shared across all turns)
    try:
        session_id = _create_session(base_url)
    except requests.HTTPError as exc:
        return {"output": json.dumps({"error": f"{exc.response.status_code}: {exc.response.text}"})}

    # 3. Loop over turns on the same session_id
    accumulated_tu = _empty_token_usage()
    accumulated_latency = 0
    final_events: list[tuple[str, dict]] = []

    for turn_message in turns:
        events, latency_ms, error_out = _run_single_turn(base_url, session_id, turn_message, screen)
        accumulated_latency += latency_ms
        if error_out is not None:
            return error_out
        final_events = events  # last turn wins
        done = next((data for etype, data in events if etype == "done"), None)
        accumulated_tu = _sum_token_usage(accumulated_tu, _extract_token_usage(done))

    return _build_output(final_events, token_usage=accumulated_tu, latency_ms=accumulated_latency)
