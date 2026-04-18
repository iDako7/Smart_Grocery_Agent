"""Tests for token-usage accumulation + TokenUsage round-trip through DoneEvent.

Covers issue #115 backend telemetry slice:
- _accumulate_usage sums across N mock responses, including OpenRouter-normalized
  fields (cost, cached_tokens, cache_write_tokens) found under model_extra /
  prompt_tokens_details.
- TokenUsage round-trips cleanly through DoneEvent.model_dump()
  and DoneEvent.model_validate().
- run_agent populates AgentResult.token_usage on the normal "no tool calls"
  success path.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest_asyncio
from src.ai.kb import get_kb
from src.ai.orchestrator import _accumulate_usage, run_agent

from contracts.sse_events import DoneEvent, TokenUsage


@pytest_asyncio.fixture()
async def kb():
    async with get_kb() as db:
        yield db


def _mock_usage(
    *,
    prompt=0,
    completion=0,
    total=0,
    cached=0,
    cache_write=0,
    cost=0.0,
    model="test-model",
):
    """Build a mock response whose .usage.model_dump() matches OpenRouter's shape."""
    usage = MagicMock()
    usage.model_dump = MagicMock(
        return_value={
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
            "prompt_tokens_details": {
                "cached_tokens": cached,
                "cache_write_tokens": cache_write,
            },
            "cost": cost,
        }
    )
    response = MagicMock()
    response.usage = usage
    response.model = model
    return response


def test_accumulator_sums_across_multiple_calls():
    """Accumulator must sum token counts, cost, and cache fields across N responses."""
    acc: dict = {}
    _accumulate_usage(acc, _mock_usage(prompt=10, completion=5, total=15, cost=0.001, model="m1"))
    _accumulate_usage(acc, _mock_usage(prompt=20, completion=7, total=27, cost=0.002, model="m1"))
    _accumulate_usage(
        acc,
        _mock_usage(prompt=3, completion=2, total=5, cached=2, cache_write=1, cost=0.0005, model="m1"),
    )

    assert acc["prompt_tokens"] == 33
    assert acc["completion_tokens"] == 14
    assert acc["total_tokens"] == 47
    assert acc["cached_tokens"] == 2
    assert acc["cache_write_tokens"] == 1
    assert acc["cost"] == 0.001 + 0.002 + 0.0005
    assert acc["model"] == "m1"


def test_accumulator_handles_missing_usage():
    """Response without .usage must not crash or mutate acc."""
    acc: dict = {"prompt_tokens": 5}
    response = MagicMock()
    response.usage = None
    _accumulate_usage(acc, response)
    assert acc == {"prompt_tokens": 5}


def test_accumulator_handles_missing_prompt_tokens_details():
    """Providers that omit prompt_tokens_details should still accumulate base counts."""
    acc: dict = {}
    usage = MagicMock()
    usage.model_dump = MagicMock(
        return_value={
            "prompt_tokens": 12,
            "completion_tokens": 4,
            "total_tokens": 16,
        }
    )
    response = MagicMock()
    response.usage = usage
    response.model = "m2"
    _accumulate_usage(acc, response)

    assert acc["prompt_tokens"] == 12
    assert acc["cached_tokens"] == 0
    assert acc["cache_write_tokens"] == 0
    assert acc["cost"] == 0.0


def test_token_usage_round_trips_through_done_event():
    """TokenUsage → DoneEvent.model_dump() → DoneEvent.model_validate() is lossless."""
    tu = TokenUsage(
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        cached_tokens=20,
        cache_write_tokens=10,
        cost=0.0042,
        model="anthropic/claude-sonnet-4.6",
    )
    done = DoneEvent(status="complete", token_usage=tu)
    dumped = done.model_dump()

    assert dumped["token_usage"]["prompt_tokens"] == 100
    assert dumped["token_usage"]["cost"] == 0.0042
    assert dumped["token_usage"]["model"] == "anthropic/claude-sonnet-4.6"

    # JSON round-trip (what actually hits the SSE wire)
    rehydrated = DoneEvent.model_validate(json.loads(json.dumps(dumped)))
    assert rehydrated.token_usage == tu


def test_done_event_token_usage_defaults_to_none():
    """Backward compat: omitting token_usage must still produce a valid DoneEvent."""
    done = DoneEvent(status="complete")
    assert done.token_usage is None
    assert "token_usage" in done.model_dump()
    assert done.model_dump()["token_usage"] is None


# ---------------------------------------------------------------------------
# Integration: run_agent populates AgentResult.token_usage on the simple path.
# ---------------------------------------------------------------------------


def _make_response_with_usage(content=None):
    """Build a mock chat completion response with realistic usage payload."""
    message = MagicMock()
    message.content = content
    message.tool_calls = []
    message.model_dump = MagicMock(return_value={"role": "assistant", "content": content, "tool_calls": None})
    choice = MagicMock()
    choice.message = message
    choice.finish_reason = "stop"

    usage = MagicMock()
    usage.model_dump = MagicMock(
        return_value={
            "prompt_tokens": 42,
            "completion_tokens": 8,
            "total_tokens": 50,
            "prompt_tokens_details": {"cached_tokens": 5, "cache_write_tokens": 0},
            "cost": 0.00017,
        }
    )

    response = MagicMock()
    response.choices = [choice]
    response.usage = usage
    response.model = "anthropic/claude-sonnet-4.6"
    return response


async def test_run_agent_populates_token_usage_on_success(kb, seeded_user, db):
    """AgentResult.token_usage is populated from the accumulator on the simple no-tool path."""
    mock_response = _make_response_with_usage(content="Hi there!")
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        result = await run_agent("Hello", kb, db, seeded_user)

    assert result.status == "complete"
    assert result.token_usage is not None
    assert result.token_usage.prompt_tokens == 42
    assert result.token_usage.completion_tokens == 8
    assert result.token_usage.total_tokens == 50
    assert result.token_usage.cached_tokens == 5
    assert result.token_usage.cost == 0.00017
    assert result.token_usage.model == "anthropic/claude-sonnet-4.6"


async def test_run_agent_passes_extra_body_usage_include(kb, seeded_user, db):
    """_llm_call_with_retry must pass extra_body={'usage': {'include': True}} to SDK."""
    mock_response = _make_response_with_usage(content="ok")
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("src.ai.orchestrator._get_client", return_value=mock_client):
        await run_agent("Hello", kb, db, seeded_user)

    call_kwargs = mock_client.chat.completions.create.call_args.kwargs
    extra_body = call_kwargs.get("extra_body", {})
    assert extra_body.get("usage") == {"include": True}
