"""Application-level cache probe for issue #116.

Calls ``src.ai.orchestrator.run_agent`` twice with identical inputs and
inspects the raw OpenRouter ``usage`` dict on each LLM iteration to confirm
``cache_control`` breakpoints produce cached-read tokens on the warm call.

Run:
    OPENROUTER_API_KEY=... uv run python scripts/cache_probe_app.py

Pass criterion: warm call's first LLM iteration reports
``prompt_tokens_details.cached_tokens >= 1024`` (Anthropic's min cache size).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")

from contracts.tool_schemas import UserProfile  # noqa: E402
from src.ai import orchestrator  # noqa: E402
from src.ai.kb import get_kb  # noqa: E402

USER_MESSAGE = "Hello, can you see this message?"
SCREEN = None
MIN_CACHED_TOKENS = 1024
INTER_CALL_SLEEP_S = 5


class _UsageCapturingClient:
    """Wraps the real LLM retry helper so we can capture ``response.usage``."""

    def __init__(self):
        self.captured: list[dict] = []
        self._original = orchestrator._llm_call_with_retry

    async def __aenter__(self):
        async def wrapper(client, **kwargs):
            response = await self._original(client, **kwargs)
            usage_obj = getattr(response, "usage", None)
            usage = usage_obj.model_dump() if hasattr(usage_obj, "model_dump") else dict(usage_obj or {})
            self.captured.append(usage)
            return response

        orchestrator._llm_call_with_retry = wrapper
        return self

    async def __aexit__(self, *_):
        orchestrator._llm_call_with_retry = self._original


async def _stub_get_user_profile(_conn, _user_id):
    return UserProfile()


async def run_once(label: str, captured: list[dict]):
    start_idx = len(captured)
    t0 = time.monotonic()
    async with get_kb() as kb:
        result = await orchestrator.run_agent(
            USER_MESSAGE,
            kb,
            pg=None,
            user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            history=None,
            screen=SCREEN,
        )
    elapsed = time.monotonic() - t0
    iterations = captured[start_idx:]
    print(f"\n=== {label} ===")
    print(f"Latency: {elapsed:.2f}s | iterations: {len(iterations)} | status: {result.status}")
    for i, usage in enumerate(iterations, 1):
        pt = usage.get("prompt_tokens", 0)
        ct = usage.get("completion_tokens", 0)
        details = usage.get("prompt_tokens_details") or {}
        cached = details.get("cached_tokens", 0)
        cache_write = details.get("cache_write_tokens", 0)
        cost = usage.get("cost", 0.0)
        print(
            f"  iter {i}: prompt={pt} cached={cached} write={cache_write} completion={ct} cost=${cost:.6f}"
        )
    return iterations


async def main():
    from src.backend.db import crud

    crud.get_user_profile = _stub_get_user_profile
    import src.ai.orchestrator as orch_mod
    orch_mod.get_user_profile = _stub_get_user_profile

    if not os.environ.get("OPENROUTER_API_KEY"):
        print("ERROR: OPENROUTER_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    async with _UsageCapturingClient() as cap:
        cold = await run_once("COLD CALL (expect cache_write)", cap.captured)
        print(f"\nSleeping {INTER_CALL_SLEEP_S}s for cache to stabilize...")
        await asyncio.sleep(INTER_CALL_SLEEP_S)
        warm = await run_once("WARM CALL (expect cached_tokens >= 1024)", cap.captured)

    warm_first = warm[0] if warm else {}
    warm_cached = (warm_first.get("prompt_tokens_details") or {}).get("cached_tokens", 0)

    print("\n" + "=" * 60)
    if warm_cached >= MIN_CACHED_TOKENS:
        print(f"ASSERT PASS: warm cached_tokens={warm_cached} >= {MIN_CACHED_TOKENS}")
        print(json.dumps({"cold_first": cold[0] if cold else {}, "warm_first": warm_first}, indent=2, default=str))
        return 0
    print(f"ASSERT FAIL: warm cached_tokens={warm_cached} < {MIN_CACHED_TOKENS}")
    print(json.dumps({"cold_first": cold[0] if cold else {}, "warm_first": warm_first}, indent=2, default=str))
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
