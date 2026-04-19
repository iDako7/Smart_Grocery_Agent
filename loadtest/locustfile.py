"""Locust load test for SGA V2 deployed demo (issue #134).

Two User classes:

- SSEUser (weight 3) — POST /session, then POST /session/{id}/chat with SSE
  streaming. Records `sse_time_to_first_event` and `sse_time_to_done` as
  custom Locust request events (ms). These are what the PR-5 acceptance bar
  measures (p95 < 2s first-event, < 30s done).

- RESTUser (weight 1) — exercises GET /session/{id}, plus the saved-items
  CRUD endpoints (POST /saved/recipes, GET /saved/recipes). No LLM calls.
  Represents users browsing saved content during / after a chat.

Run against the deployed Fly app. Auth is bypassed via SGA_AUTH_MODE=dev
(set via `fly secrets set` before the run, unset after):

    locust -f loadtest/locustfile.py --host https://sga-v2.fly.dev \
           --users 10 --spawn-rate 2 --run-time 5m --headless

See loadtest/README.md for the full workflow.
"""

from __future__ import annotations

import json
import random
import time
import uuid
from typing import Any

from locust import HttpUser, between, events, task

CHAT_PROMPTS = [
    "I have chicken, broccoli, and rice. What can I make?",
    "Need a quick dinner with ground beef and pasta.",
    "Got salmon and asparagus in the fridge — dinner ideas?",
    "What can I cook with tofu, bell peppers, and soy sauce?",
    "Shrimp and lemon — something for tonight?",
    "Tell me a dinner using black beans and corn tortillas.",
]


def _fire_sse_metric(name: str, response_ms: float, exception: Exception | None = None) -> None:
    """Emit a Locust custom request event so the stats table shows p50/p95/p99."""
    events.request.fire(
        request_type="SSE",
        name=name,
        response_time=response_ms,
        response_length=0,
        exception=exception,
        context={},
    )


def _parse_sse_stream(body_iter) -> tuple[float, float, dict[str, Any] | None]:
    """Consume an SSE stream, return (time_to_first_event_ms, time_to_done_ms, done_payload).

    `body_iter` is whatever `response.iter_lines()` yields — str or bytes.
    Times are relative to function entry. done_payload is the parsed JSON of
    the `done` event (None if the stream ended without one). `first_event_at`
    is latched at the blank-line flush of the first fully-assembled event
    (not the first raw line), so it reflects "time to first parsed event",
    which is what PR 5 metric 2 asks for. The backend always sends an
    `event:` header before `data:`, so `current_type` is the authoritative
    source for the event type.
    """
    start = time.perf_counter()
    first_event_at: float | None = None
    done_at: float | None = None
    done_payload: dict[str, Any] | None = None

    current_type: str | None = None
    current_data: str | None = None

    for raw in body_iter:
        line = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        if line.startswith("event:"):
            current_type = line[len("event:") :].strip()
        elif line.startswith("data:"):
            current_data = line[len("data:") :].strip()
        elif line == "":
            if current_data is not None:
                if first_event_at is None:
                    first_event_at = time.perf_counter()
                try:
                    payload = json.loads(current_data)
                except json.JSONDecodeError:
                    payload = None
                if current_type == "done" and payload is not None:
                    done_at = time.perf_counter()
                    done_payload = payload
            current_type = None
            current_data = None

    ttfe_ms = ((first_event_at or time.perf_counter()) - start) * 1000.0
    ttd_ms = ((done_at or time.perf_counter()) - start) * 1000.0
    return ttfe_ms, ttd_ms, done_payload


class SSEUser(HttpUser):
    """Drives the LLM-backed chat flow with SSE streaming."""

    weight = 3
    wait_time = between(3, 8)

    session_id: str | None = None

    def on_start(self) -> None:
        with self.client.post(
            "/session",
            json={"initial_message": None},
            catch_response=True,
            name="POST /session",
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create session returned {resp.status_code}")
                self.session_id = None
                return
            try:
                self.session_id = resp.json()["session_id"]
            except (json.JSONDecodeError, KeyError) as exc:
                resp.failure(f"malformed session create response: {exc}")
                self.session_id = None

    @task
    def chat(self) -> None:
        if not self.session_id:
            return
        body = {"message": random.choice(CHAT_PROMPTS), "screen": "home"}
        with self.client.post(
            f"/session/{self.session_id}/chat",
            json=body,
            stream=True,
            catch_response=True,
            name="POST /session/{id}/chat",
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"chat returned {resp.status_code}")
                return
            try:
                ttfe_ms, ttd_ms, done_payload = _parse_sse_stream(resp.iter_lines())
            except Exception as exc:
                resp.failure(f"SSE stream error: {exc}")
                _fire_sse_metric("sse_time_to_first_event", 0.0, exception=exc)
                _fire_sse_metric("sse_time_to_done", 0.0, exception=exc)
                return

            _fire_sse_metric("sse_time_to_first_event", ttfe_ms)
            _fire_sse_metric("sse_time_to_done", ttd_ms)

            if done_payload is None:
                resp.failure("SSE stream ended without a `done` event")
                return
            if done_payload.get("status") not in ("complete", "partial"):
                resp.failure(f"done event with unexpected status: {done_payload.get('status')}")
                return

            # Metric 4 — emit the per-run prompt-cache ratio as a Locust custom
            # metric. Redis is deferred (see README §Metric 4), so this measures
            # OpenRouter prompt-cache hits; the Redis tool cache contributes 0.
            usage = done_payload.get("token_usage") or {}
            prompt = usage.get("prompt_tokens") or 0
            cached = usage.get("cached_tokens") or 0
            if prompt > 0:
                _fire_sse_metric("sse_prompt_cache_ratio_x1000", (cached / prompt) * 1000.0)

            # Tag partials (orchestrator short-circuits) as soft failures so they
            # show up in the Locust report without inflating the 5xx count.
            if done_payload.get("status") == "partial":
                resp.failure(f"partial run: {done_payload.get('reason')}")


class RESTUser(HttpUser):
    """Exercises non-LLM read/write endpoints while chat load is running."""

    weight = 1
    wait_time = between(2, 5)

    session_id: str | None = None

    def on_start(self) -> None:
        with self.client.post(
            "/session",
            json={"initial_message": None},
            catch_response=True,
            name="POST /session",
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"create session returned {resp.status_code}")
                return
            try:
                self.session_id = resp.json()["session_id"]
            except (json.JSONDecodeError, KeyError):
                self.session_id = None

    @task(3)
    def read_session(self) -> None:
        if not self.session_id:
            return
        self.client.get(f"/session/{self.session_id}", name="GET /session/{id}")

    @task(1)
    def save_then_list_recipe(self) -> None:
        synthetic_id = f"loadtest-{uuid.uuid4().hex[:8]}"
        body = {
            "recipe_id": synthetic_id,
            "recipe_snapshot": {
                "id": synthetic_id,
                "name": "Load test filler",
                "cuisine": "none",
                "serves": 1,
                "ingredients": [{"name": "water", "amount": "1 cup"}],
                "instructions": "noop",
            },
        }
        with self.client.post(
            "/saved/recipes",
            json=body,
            catch_response=True,
            name="POST /saved/recipes",
        ) as resp:
            # 201 = created, 409 = dup recipe_id — both acceptable under load.
            if resp.status_code not in (201, 409):
                resp.failure(f"save recipe returned {resp.status_code}")

    @task(2)
    def list_saved(self) -> None:
        self.client.get("/saved/recipes", name="GET /saved/recipes")
