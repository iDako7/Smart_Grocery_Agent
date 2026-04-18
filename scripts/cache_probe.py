import json
import os
import time

import requests


def make_call(prompt_text, cache_control=None):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY env var not set")

    url = "https://openrouter.ai/api/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/iDako7/SGA_V2",
        "X-Title": "SGA_V2 Cache Probe",
    }

    # Using explicit breakpoints on the system prompt block
    payload = {
        "model": "anthropic/claude-sonnet-4.6",
        "messages": [
            {
                "role": "system",
                "content": [
                    {
                        "type": "text",
                        "text": prompt_text,
                    }
                ],
            },
            {"role": "user", "content": "Hello, can you see this?"},
        ],
        "provider": {"order": ["Anthropic"]},  # Force Anthropic to ensure caching support
    }

    if cache_control:
        payload["messages"][0]["content"][0]["cache_control"] = cache_control

    start_time = time.time()
    response = requests.post(url, headers=headers, json=payload)
    latency = time.time() - start_time

    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None, latency

    return response.json(), latency


def run_probe():
    # Generate ~1500 tokens. Anthropic's token limit for caching is 1024.
    # Using a repetitive block to easily exceed the limit.
    block = (
        "This is a long system prompt block that contains static information about the "
        "SGA_V2 project, its architecture, its goals, and its tool definitions. "
    )
    long_prompt = block * 100
    print(f"Prompt length: {len(long_prompt)} characters.")

    cache_control = {"type": "ephemeral"}

    print("--- CALL 1 (Cold) ---")
    res1, lat1 = make_call(long_prompt, cache_control)
    if res1:
        usage1 = res1.get("usage", {})
        print(f"Latency: {lat1:.2f}s")
        print(f"Usage: {json.dumps(usage1, indent=2)}")
    else:
        print("Call 1 failed.")
        return

    # Wait a few seconds to let the cache settle
    print("\nWaiting 5 seconds for cache to stabilize...")
    time.sleep(5)

    print("\n--- CALL 2 (Warm) ---")
    res2, lat2 = make_call(long_prompt, cache_control)
    if res2:
        usage2 = res2.get("usage", {})
        print(f"Latency: {lat2:.2f}s")
        print(f"Usage: {json.dumps(usage2, indent=2)}")

        # Check for cache hit
        # OpenRouter normalized fields: prompt_tokens_details.cached_tokens, prompt_tokens_details.cache_write_tokens
        prompt_details = usage2.get("prompt_tokens_details", {})
        cache_read = prompt_details.get("cached_tokens", 0)
        cache_create = prompt_details.get("cache_write_tokens", 0)

        if cache_read > 0:
            print(f"\nSUCCESS: Cache hit detected! Read {cache_read} tokens from cache.")
        elif cache_create > 0:
            print("\nPENDING: Cache was created but not read (likely first warm call or cache missed).")
        else:
            # Fallback for native Anthropic fields if not normalized
            cache_read_native = usage2.get("cache_read_input_tokens", 0)
            if cache_read_native > 0:
                print(f"\nSUCCESS: Cache hit detected (native field)! Read {cache_read_native} tokens from cache.")
            else:
                print("\nFAILURE: No cache activity detected.")

    # Save results to markdown for documentation
    os.makedirs("docs/02-notes", exist_ok=True)
    with open("docs/02-notes/cache-probe-results.md", "w") as f:
        f.write("# Cache Probe Results\n\n")
        f.write(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("## Call 1 (Cold)\n")
        f.write(f"Latency: {lat1:.2f}s\n")
        f.write("```json\n")
        f.write(json.dumps(res1, indent=2))
        f.write("\n```\n\n")
        f.write("## Call 2 (Warm)\n")
        f.write(f"Latency: {lat2:.2f}s\n")
        f.write("```json\n")
        f.write(json.dumps(res2, indent=2))
        f.write("\n```\n")


if __name__ == "__main__":
    run_probe()
