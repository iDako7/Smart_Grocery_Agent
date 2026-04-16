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
    screen              — which screen to send (default "home")
    household_size      — profile var (ignored; profile lives in DB)
    dietary_restrictions — profile var (ignored; profile lives in DB)
"""

import json
import os

import requests

DEFAULT_BASE_URL = "http://localhost:8000"
CHAT_TIMEOUT = 120  # seconds — LLM calls can be slow


def _get_base_url(options: dict) -> str:
    """Resolve backend base URL from config, env var, or default."""
    config = options.get("config") or {}
    return (
        config.get("base_url")
        or os.environ.get("SGA_EVAL_BASE_URL")
        or DEFAULT_BASE_URL
    )


def _health_check(base_url: str) -> None:
    """Verify the backend is reachable. Raises on failure."""
    try:
        resp = requests.get(f"{base_url}/health", timeout=10)
        resp.raise_for_status()
    except requests.ConnectionError:
        raise RuntimeError(
            f"Backend not running. Run: docker compose up  (tried {base_url}/health)"
        )
    except requests.HTTPError as exc:
        raise RuntimeError(
            f"Backend health check failed ({exc.response.status_code}). "
            f"Run: docker compose up  (tried {base_url}/health)"
        )


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
                event_type = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data_line = line[len("data:"):].strip()

        if event_type and data_line:
            try:
                data_dict = json.loads(data_line)
            except json.JSONDecodeError:
                data_dict = {"raw": data_line}
            events.append((event_type, data_dict))

    return events


def _build_output(events: list[tuple[str, dict]]) -> dict:
    """Build the structured output dict from parsed SSE events."""
    recipe_cards = [data for etype, data in events if etype == "recipe_card"]
    pcsv = next((data for etype, data in events if etype == "pcsv_update"), None)
    explanation = next(
        (data.get("text", "") for etype, data in events if etype == "explanation"),
        "",
    )
    done = next((data for etype, data in events if etype == "done"), None)

    # Token usage from done event (if the backend ever includes it)
    token_usage = {"total": 0, "prompt": 0, "completion": 0}
    if done and "token_usage" in done:
        tu = done["token_usage"]
        token_usage = {
            "total": tu.get("total", 0),
            "prompt": tu.get("prompt", 0),
            "completion": tu.get("completion", 0),
        }

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
        "tokenUsage": token_usage,
    }


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

    # 1. Health check
    _health_check(base_url)

    # 2. Create session
    try:
        session_id = _create_session(base_url)
    except requests.HTTPError as exc:
        return {"output": json.dumps({"error": f"{exc.response.status_code}: {exc.response.text}"})}

    # 3. Send chat and collect SSE stream
    try:
        resp = _send_chat(base_url, session_id, prompt, screen)
    except requests.Timeout:
        return {"output": json.dumps({"error": "timeout: chat request exceeded 120s"})}
    except requests.ConnectionError:
        return {"output": json.dumps({"error": "connection_error: backend unreachable during chat"})}

    if resp.status_code != 200:
        body = resp.text[:2000]  # truncate to avoid massive error payloads
        return {"output": json.dumps({"error": f"{resp.status_code}: {body}"})}

    # 4. Read the full SSE stream body
    raw_text = resp.text

    # 5. Parse SSE events
    events = _parse_sse(raw_text)

    # 6. Build structured output
    return _build_output(events)
