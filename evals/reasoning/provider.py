"""promptfoo custom provider for SGA V2 agent."""

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv

load_dotenv(REPO_ROOT / ".env")

from prototype.orchestrator import run_agent
from prototype.schema import UserProfile


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Call the SGA agent and return structured output for promptfoo."""
    config = options.get("config", {})
    vars_ = context.get("vars", {})

    # Build UserProfile from vars (profile overrides per test case)
    profile_kwargs = {}
    for field in [
        "dietary_restrictions",
        "preferred_cuisines",
        "disliked_ingredients",
        "preferred_stores",
    ]:
        if field in vars_:
            val = vars_[field]
            if isinstance(val, str):
                profile_kwargs[field] = json.loads(val)
            else:
                profile_kwargs[field] = val
    for field in ["household_size"]:
        if field in vars_:
            profile_kwargs[field] = int(vars_[field])
    if "notes" in vars_:
        profile_kwargs["notes"] = vars_["notes"]

    profile = UserProfile(**profile_kwargs)
    model = config.get("model") or os.environ.get("SGA_MODEL")

    try:
        result = run_agent(prompt, profile=profile, model=model)
        output = result.model_dump()
        # Estimate cost based on model
        model_name = model or ""
        cost_rates = {
            "gpt-5.4-mini": (0.30, 1.25),
            "claude-sonnet-4-6": (3.0, 15.0),
        }
        input_rate, output_rate = next(
            (r for k, r in cost_rates.items() if k in model_name),
            (3.0, 15.0),  # default fallback
        )
        if not any(k in model_name for k in cost_rates):
            print(f"[provider] Warning: unknown model '{model_name}', using default cost rates")
        input_cost = result.input_tokens * input_rate / 1_000_000
        output_cost = result.output_tokens * output_rate / 1_000_000
        total_cost = input_cost + output_cost

        return {
            "output": json.dumps(output, ensure_ascii=False),
            "tokenUsage": {
                "total": result.input_tokens + result.output_tokens,
                "prompt": result.input_tokens,
                "completion": result.output_tokens,
            },
            "cost": total_cost,
        }
    except Exception as e:
        return {"error": str(e)}
