"""CLI entry point for the SGA prototype."""

import json
import sys

from dotenv import load_dotenv

from prototype.orchestrator import run_agent
from prototype.schema import UserProfile


def print_summary(result):
    """Print a human-readable summary of the agent result."""
    print("\n" + "=" * 60)
    print(f"Status: {result.status}")
    print(f"Tokens: {result.input_tokens} in / {result.output_tokens} out")
    print(f"Iterations: {result.total_iterations}")
    print(f"Tool calls: {len(result.tool_calls)}")

    if result.tool_calls:
        print("\nTool call sequence:")
        for tc in result.tool_calls:
            print(f"  {tc.name}({json.dumps(tc.input, ensure_ascii=False)[:80]})")

    print("\n" + "-" * 60)
    print("AGENT RESPONSE:")
    print("-" * 60)
    print(result.response_text)
    print("=" * 60)


def main():
    load_dotenv()

    # Accept message from CLI args or interactive input
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        print("Smart Grocery Assistant — Phase 1a Prototype")
        print("Enter your message (or 'quit' to exit):\n")
        message = input("> ").strip()
        if message.lower() in ("quit", "exit", "q"):
            return

    # Default prototype profile
    profile = UserProfile(
        household_size=2,
        preferred_cuisines=["Chinese", "Korean", "Japanese"],
        preferred_stores=["costco"],
    )

    print(f"\nRunning agent with: {message[:80]}...")
    result = run_agent(message, profile=profile)
    print_summary(result)

    # Also dump full JSON for inspection
    json_path = "last_result.json"
    with open(json_path, "w") as f:
        json.dump(result.model_dump(), f, indent=2, ensure_ascii=False)
    print(f"\nFull JSON written to {json_path}")


if __name__ == "__main__":
    main()
