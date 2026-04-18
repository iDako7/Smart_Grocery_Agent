"""Core orchestration loop: LLM call → tool dispatch → repeat.

Uses AsyncOpenAI SDK with OpenRouter base_url.
"""

import asyncio
import json
import logging
import os
import uuid

import aiosqlite
from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

from src.ai.prompt import build_system_prompt
from src.ai.schema_coercion import coerce_tool_args
from src.ai.tools.analyze_pcsv import analyze_pcsv
from src.ai.tools.emit_clarify_turn import emit_clarify_turn
from src.ai.tools.get_recipe_detail import get_recipe_detail
from src.ai.tools.get_substitutions import get_substitutions
from src.ai.tools.lookup_store_product import lookup_store_product
from src.ai.tools.search_recipes import search_recipes
from src.ai.tools.translate_term import translate_term
from src.ai.tools.update_user_profile import update_user_profile
from src.ai.types import AgentResult, ToolCall
from src.backend.db.crud import get_user_profile

from contracts.api_types import Screen
from contracts.sse_events import TokenUsage
from contracts.tool_schemas import (
    TOOLS,
    AnalyzePcsvInput,
    ClarifyTurnPayload,
    GetRecipeDetailInput,
    GetSubstitutionsInput,
    LookupStoreProductInput,
    PCSVResult,
    RecipeSummary,
    SearchRecipesInput,
    TranslateTermInput,
    UpdateUserProfileInput,
)

MAX_ITERATIONS = 10
MODEL = os.environ.get("SGA_MODEL", "openai/gpt-5.4-mini")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

LLM_MAX_RETRIES = 1
LLM_BACKOFF_BASE = 1.0
_RETRYABLE_ERRORS = (APIConnectionError, APITimeoutError, RateLimitError, InternalServerError)

_openai_client: AsyncOpenAI | None = None


def accumulate_recipe_results(
    existing: list[RecipeSummary],
    new_raw: list,
) -> list[RecipeSummary]:
    """Merge a fresh search_recipes tool result into the accumulator.

    Issue #87 invariant: if any search_recipes call during the loop returns
    non-empty, recipe_results must carry those recipes to the terminal
    AgentResult. A later zero-result call (e.g., model retries with tighter
    filters) must NOT wipe prior valid results.

    Policy:
    - new_raw empty → preserve existing (the landmine fix).
    - new_raw non-empty → replace with new_raw (newest narrowing reflects
      model intent; union-with-dedup would risk duplicate cards).
    """
    if not new_raw:
        return existing
    return [RecipeSummary.model_validate(r) if isinstance(r, dict) else r for r in new_raw]


def _as_int(val) -> int:
    try:
        return int(val) if val is not None else 0
    except (TypeError, ValueError):
        return 0


def _as_float(val) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _accumulate_usage(acc: dict, response) -> dict:
    """Sum per-call usage into `acc`. Safe against partial/missing fields.

    OpenRouter (via `extra_body={"usage": {"include": True}}`) returns cost +
    cached_tokens/cache_write_tokens under `prompt_tokens_details`. The OpenAI
    SDK surfaces `cost` as an extra attribute on CompletionUsage. We read from
    `response.usage.model_dump()` so both typed fields and extras land in one
    dict and sum cleanly.
    """
    usage = getattr(response, "usage", None)
    if usage is None:
        return acc
    try:
        data = usage.model_dump() if hasattr(usage, "model_dump") else dict(usage)
    except Exception:
        return acc
    if not isinstance(data, dict):
        return acc

    acc["prompt_tokens"] = acc.get("prompt_tokens", 0) + _as_int(data.get("prompt_tokens"))
    acc["completion_tokens"] = acc.get("completion_tokens", 0) + _as_int(data.get("completion_tokens"))
    # Derive total from prompt+completion — keeps the invariant even if a
    # provider emits inconsistent total_tokens for a single call.
    acc["total_tokens"] = acc["prompt_tokens"] + acc["completion_tokens"]
    acc["cost"] = acc.get("cost", 0.0) + _as_float(data.get("cost"))

    details = data.get("prompt_tokens_details") or {}
    if isinstance(details, dict):
        acc["cached_tokens"] = acc.get("cached_tokens", 0) + _as_int(details.get("cached_tokens"))
        acc["cache_write_tokens"] = acc.get("cache_write_tokens", 0) + _as_int(details.get("cache_write_tokens"))
    else:
        acc.setdefault("cached_tokens", 0)
        acc.setdefault("cache_write_tokens", 0)

    model_name = getattr(response, "model", None)
    if isinstance(model_name, str) and model_name and acc.get("model") is None:
        acc["model"] = model_name
    return acc


def _get_client() -> AsyncOpenAI:
    """Lazy singleton — reuses connection pool across requests."""
    global _openai_client
    if _openai_client is None:
        api_key = os.environ.get("OPENROUTER_API_KEY", "")
        _openai_client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
    return _openai_client


# Tool name → (Pydantic input model, handler requires kb or pg)
_TOOL_REGISTRY: dict[str, tuple[type, str]] = {
    "analyze_pcsv": (AnalyzePcsvInput, "kb"),
    "search_recipes": (SearchRecipesInput, "kb"),
    "get_recipe_detail": (GetRecipeDetailInput, "kb"),
    "get_substitutions": (GetSubstitutionsInput, "kb"),
    "translate_term": (TranslateTermInput, "kb"),
    "lookup_store_product": (LookupStoreProductInput, "kb"),
    "update_user_profile": (UpdateUserProfileInput, "pg"),
    "emit_clarify_turn": (ClarifyTurnPayload, "none"),
}


async def _llm_call_with_retry(client, *, model, messages, tools, max_tokens, tool_choice=None, temperature=0.3):
    """Call LLM with one retry + exponential backoff on transient errors."""
    last_error = None
    for attempt in range(LLM_MAX_RETRIES + 1):
        try:
            kwargs = dict(
                model=model,
                messages=messages,
                tools=tools,
                max_tokens=max_tokens,
                temperature=temperature,
                extra_body={"usage": {"include": True}},
            )
            if tool_choice is not None:
                kwargs["tool_choice"] = tool_choice
            return await client.chat.completions.create(**kwargs)
        except _RETRYABLE_ERRORS as e:
            last_error = e
            if attempt < LLM_MAX_RETRIES:
                delay = LLM_BACKOFF_BASE * (2**attempt)
                logger.warning(
                    "LLM call failed (attempt %d), retrying in %.1fs: %s",
                    attempt + 1,
                    delay,
                    e,
                )
                await asyncio.sleep(delay)
    raise last_error


async def _dispatch_tool(
    name: str,
    raw_args: str,
    kb: aiosqlite.Connection,
    pg: AsyncConnection,
    user_id: uuid.UUID,
) -> tuple[dict, ToolCall]:
    """Dispatch a tool call. Returns (result_dict, ToolCall record)."""
    registry_entry = _TOOL_REGISTRY.get(name)
    if registry_entry is None:
        error = {"error": f"Unknown tool: {name}"}
        return error, ToolCall(name=name, input={}, result=error)

    model_class, db_type = registry_entry
    parsed = coerce_tool_args(raw_args, model_class)

    if isinstance(parsed, dict):
        # Coercion failed — return error to LLM
        return parsed, ToolCall(name=name, input={}, result=parsed)

    try:
        if name == "analyze_pcsv":
            result = await analyze_pcsv(kb, parsed)
        elif name == "search_recipes":
            result = await search_recipes(kb, parsed)
        elif name == "get_recipe_detail":
            result = await get_recipe_detail(kb, parsed)
        elif name == "get_substitutions":
            result = await get_substitutions(kb, parsed)
        elif name == "translate_term":
            result = await translate_term(kb, parsed)
        elif name == "lookup_store_product":
            result = await lookup_store_product(kb, parsed)
        elif name == "update_user_profile":
            result = await update_user_profile(pg, user_id, parsed)
        elif name == "emit_clarify_turn":
            result = await emit_clarify_turn(parsed)
        else:
            result = {"error": f"Unhandled tool: {name}"}
    except Exception as e:
        error = {"error": f"Tool execution failed: {e}"}
        return error, ToolCall(name=name, input=parsed.model_dump(), result=error)

    if result is None:
        result_dict = {"error": "No result (e.g., recipe not found)"}
    elif hasattr(result, "model_dump"):
        result_dict = result.model_dump()
    elif isinstance(result, list):
        result_dict = [r.model_dump() if hasattr(r, "model_dump") else r for r in result]
    else:
        result_dict = result

    return result_dict, ToolCall(
        name=name,
        input=parsed.model_dump(),
        result=result_dict if isinstance(result_dict, dict) else {"items": result_dict},
    )


async def run_agent(
    user_message: str,
    kb: aiosqlite.Connection,
    pg: AsyncConnection,
    user_id: uuid.UUID,
    history: list[dict] | None = None,
    screen: Screen | None = None,
) -> AgentResult:
    """Run the agent orchestration loop for a single user message."""
    profile = await get_user_profile(pg, user_id)
    system = build_system_prompt(profile, screen=screen)

    messages: list[dict] = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    client = _get_client()

    all_tool_calls: list[ToolCall] = []
    pcsv_result = None
    recipe_results: list = []
    last_content = ""
    usage_acc: dict = {}

    for iteration in range(MAX_ITERATIONS):
        response = await _llm_call_with_retry(
            client,
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            max_tokens=4096,
        )
        _accumulate_usage(usage_acc, response)

        choice = response.choices[0]
        message = choice.message
        last_content = message.content or ""

        # Done — no tool calls
        if choice.finish_reason != "tool_calls" and not message.tool_calls:
            if screen == "clarify":
                forced_tc = {"type": "function", "function": {"name": "emit_clarify_turn"}}
                messages.append(message.model_dump())
                retry_response = await _llm_call_with_retry(
                    client,
                    model=MODEL,
                    messages=messages,
                    tools=TOOLS,
                    max_tokens=4096,
                    tool_choice=forced_tc,
                )
                _accumulate_usage(usage_acc, retry_response)
                retry_choice = retry_response.choices[0]
                retry_message = retry_choice.message
                clarify_payload = None
                if retry_message.tool_calls:
                    for tc in retry_message.tool_calls:
                        if tc.function.name == "emit_clarify_turn":
                            result_dict, tc_record = await _dispatch_tool(
                                tc.function.name, tc.function.arguments, kb, pg, user_id
                            )
                            # Terminal retry — no follow-up LLM call, so we skip the tool_messages
                            # append that the main loop uses to feed results back to the model.
                            all_tool_calls.append(tc_record)
                            if isinstance(result_dict, dict) and "error" not in result_dict:
                                clarify_payload = ClarifyTurnPayload.model_validate(result_dict)
                            break
                if clarify_payload is not None:
                    return AgentResult(
                        status="complete",
                        response_text=clarify_payload.to_context_text(),
                        tool_calls=all_tool_calls,
                        total_iterations=iteration + 1,
                        pcsv=pcsv_result,
                        recipes=recipe_results,
                        clarify_turn=clarify_payload,
                        token_usage=TokenUsage(**usage_acc),
                    )
                return AgentResult(
                    status="partial",
                    response_text="[Clarify turn failed — no questions generated]",
                    tool_calls=all_tool_calls,
                    total_iterations=iteration + 1,
                    pcsv=pcsv_result,
                    recipes=recipe_results,
                    reason="clarify_turn_enforcement_failed",
                    token_usage=TokenUsage(**usage_acc),
                )
            return AgentResult(
                status="complete",
                response_text=message.content or "",
                tool_calls=all_tool_calls,
                total_iterations=iteration + 1,
                pcsv=pcsv_result,
                recipes=recipe_results,
                token_usage=TokenUsage(**usage_acc),
            )

        # Process tool calls
        tool_messages = []
        clarify_turn_payload: ClarifyTurnPayload | None = None
        for tc in message.tool_calls:
            result_dict, tool_call_record = await _dispatch_tool(
                tc.function.name, tc.function.arguments, kb, pg, user_id
            )
            all_tool_calls.append(tool_call_record)

            # Track structured results for SSE
            if tc.function.name == "analyze_pcsv" and isinstance(result_dict, dict) and "error" not in result_dict:
                pcsv_result = PCSVResult.model_validate(result_dict)
            elif tc.function.name == "search_recipes" and isinstance(result_dict, list):
                recipe_results = accumulate_recipe_results(recipe_results, result_dict)
            elif (
                tc.function.name == "emit_clarify_turn" and isinstance(result_dict, dict) and "error" not in result_dict
            ):
                clarify_turn_payload = ClarifyTurnPayload.model_validate(result_dict)

            content = json.dumps(result_dict, ensure_ascii=False, default=str)
            tool_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": content,
                }
            )

        messages.append(message.model_dump())
        messages.extend(tool_messages)

        # Terminal action: emit_clarify_turn stops the loop immediately
        if clarify_turn_payload is not None:
            return AgentResult(
                status="complete",
                response_text=clarify_turn_payload.to_context_text(),
                tool_calls=all_tool_calls,
                total_iterations=iteration + 1,
                pcsv=pcsv_result,
                recipes=recipe_results,
                clarify_turn=clarify_turn_payload,
                token_usage=TokenUsage(**usage_acc),
            )

    # Max iterations reached
    return AgentResult(
        status="partial",
        response_text=last_content,
        tool_calls=all_tool_calls,
        total_iterations=MAX_ITERATIONS,
        pcsv=pcsv_result,
        recipes=recipe_results,
        reason="max_iterations",
        token_usage=TokenUsage(**usage_acc),
    )
