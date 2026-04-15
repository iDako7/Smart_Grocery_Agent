"""Core orchestration loop: LLM call → tool dispatch → repeat.

Uses OpenRouter (OpenAI-compatible API) to call Claude.
"""

import json
import os
import time

from openai import OpenAI
from prototype.prompt import build_system_prompt
from prototype.schema import AgentResult, ToolCall, UserProfile
from prototype.tools.analyze_pcsv import analyze_pcsv
from prototype.tools.definitions import TOOLS
from prototype.tools.get_recipe_detail import get_recipe_detail
from prototype.tools.get_substitutions import get_substitutions
from prototype.tools.lookup_store_product import lookup_store_product
from prototype.tools.search_recipes import search_recipes
from prototype.tools.translate_term import translate_term
from prototype.tools.update_user_profile import update_user_profile

MAX_ITERATIONS = 10
MODEL = os.environ.get("SGA_MODEL", "anthropic/claude-sonnet-4.6")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _dispatch_tool(name: str, params: dict, profile: UserProfile) -> dict:
    """Route a tool call to the correct handler."""
    if name == "analyze_pcsv":
        return analyze_pcsv(params["ingredients"])
    elif name == "search_recipes":
        return search_recipes(
            ingredients=params["ingredients"],
            cuisine=params.get("cuisine"),
            cooking_method=params.get("cooking_method"),
            max_time=params.get("max_time"),
            serves=params.get("serves"),
        )
    elif name == "lookup_store_product":
        return lookup_store_product(
            item_name=params["item_name"],
            store=params.get("store"),
        )
    elif name == "get_substitutions":
        return get_substitutions(
            ingredient=params["ingredient"],
            reason=params.get("reason"),
        )
    elif name == "get_recipe_detail":
        return get_recipe_detail(params["recipe_id"])
    elif name == "update_user_profile":
        return update_user_profile(profile, params["field"], params["value"])
    elif name == "translate_term":
        return translate_term(params["term"], params.get("direction", "auto"))
    else:
        return {"error": f"Unknown tool: {name}"}


def run_agent(
    user_message: str,
    profile: UserProfile | None = None,
    model: str | None = None,
) -> AgentResult:
    """Run the agent orchestration loop for a single user message."""
    if profile is None:
        profile = UserProfile()

    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    system = build_system_prompt(profile)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_message},
    ]
    all_tool_calls: list[ToolCall] = []
    total_input_tokens = 0
    total_output_tokens = 0

    effective_model = model or MODEL
    start_time = time.time()

    for iteration in range(MAX_ITERATIONS):
        response = client.chat.completions.create(
            model=effective_model,
            messages=messages,
            tools=TOOLS,
            max_tokens=4096,
        )

        usage = response.usage
        if usage:
            total_input_tokens += usage.prompt_tokens or 0
            total_output_tokens += usage.completion_tokens or 0

        choice = response.choices[0]
        message = choice.message

        # Check if the model is done (no tool calls)
        if choice.finish_reason != "tool_calls" and not message.tool_calls:
            elapsed = time.time() - start_time
            print(f"\n  [{iteration + 1} iterations, {elapsed:.1f}s]")
            return AgentResult(
                status="complete",
                response_text=message.content or "",
                tool_calls=all_tool_calls,
                total_iterations=iteration + 1,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
            )

        # Process tool calls
        tool_messages = []
        for tc in message.tool_calls:
            name = tc.function.name
            try:
                params = json.loads(tc.function.arguments)
            except json.JSONDecodeError as e:
                params = {}
                result = {"error": f"Malformed tool arguments: {e}"}
                all_tool_calls.append(ToolCall(name=name, input=params, result=result))
                tool_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
                continue
            print(
                f"  -> calling {name}({json.dumps(params, ensure_ascii=False)[:120]})"
            )
            result = _dispatch_tool(name, params, profile)
            all_tool_calls.append(ToolCall(name=name, input=params, result=result))
            tool_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )

        # Append assistant message (with tool_calls) and tool results
        messages.append(message.model_dump())
        messages.extend(tool_messages)

    # Max iterations reached
    elapsed = time.time() - start_time
    print(f"\n  [MAX {MAX_ITERATIONS} iterations reached, {elapsed:.1f}s]")
    return AgentResult(
        status="partial",
        response_text=message.content or "",
        tool_calls=all_tool_calls,
        total_iterations=MAX_ITERATIONS,
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
    )
