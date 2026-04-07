# SGA V2 Prototype — Code Walkthrough

This document explains the concepts, architecture, and code flow of the `prototype/` directory. It's intended for team members who may be new to tool use and agent orchestration patterns.

---

## Part 1: Core Concepts

### What is Tool Use?

LLMs can only generate text. They can't look up databases, do math reliably, or call APIs. **Tool use** solves this by letting the LLM say "I need to call a function" instead of guessing an answer.

It's a conversation protocol between your code and the LLM:

```
You → LLM:  "Here are tools you can call: [definitions]. User says: 'I have chicken and rice'"

LLM → You:  "I want to call analyze_pcsv(ingredients=['chicken', 'rice'])"
             (this is NOT text for the user — it's a structured request)

You → LLM:  "Here's the result: {protein: {status: 'ok'}, carb: {status: 'ok'}, veggie: {status: 'gap'}}"

LLM → You:  "You have protein and carbs covered, but you're missing vegetables.
             Let me search for recipes..."
             → calls search_recipes(ingredients=['chicken', 'rice'])

You → LLM:  "Here are 3 matching recipes: [...]"

LLM → You:  "Here are some suggestions for your chicken and rice..."  ← final text for user
```

The LLM never actually executes anything. It outputs JSON saying "call this function with these args." **Your code** runs the function and feeds the result back.

### What is an Orchestrator?

The orchestrator is the **loop that manages this back-and-forth**. In pseudocode:

```python
while True:
    response = ask_llm(messages, available_tools)

    if response has tool_calls:
        for each tool_call:
            result = run_the_function(tool_call.name, tool_call.args)
            append result to messages
        continue  # loop back, let LLM see the results

    else:
        return response.text  # LLM is done, show user the answer
```

The orchestrator is just: **call LLM → if it wants tools, run them and loop → if it's done, stop.**

### Why Tool Definitions Matter

You give the LLM a schema (like an API spec) so it knows what tools exist and what arguments they accept. Each tool has:

- **name** — what the LLM uses to invoke it
- **description** — tells the LLM *when* to use it
- **parameters** — the JSON schema of accepted arguments

The LLM reads these descriptions to decide which tool to call. It's like giving someone a toolbox with labels on each tool.

### How This Differs from Traditional Prompt Engineering


|                       | Traditional prompt engineering | Orchestration + tool use                              |
| --------------------- | ------------------------------ | ----------------------------------------------------- |
| **Control**           | Developer hardcodes step order | LLM chooses step order at runtime                     |
| **Developer defines** | "Step 1: do X. Step 2: do Y."  | "Here are tools X, Y, Z. Here's when each is useful." |
| **Flexibility**       | Same flow every time           | Adapts per conversation                               |


In both cases, the developer still sets boundaries — the tool schemas, the system prompt rules, the max iterations. The difference is **who sequences the steps**. You go from writing a script to writing a job description.

### Why This Pattern Works Now

Two model capabilities made this viable:

1. **Instruction following** — Older models couldn't reliably output structured JSON tool calls or follow multi-step reasoning. They'd hallucinate function names, pass wrong argument types, or forget to use the tool results. Current models (Claude, GPT-4+) do this reliably enough to trust in a loop.
2. **Context window** — The orchestrator appends every tool call and result into the message history. A 5-iteration loop with tool results can easily hit 10k+ tokens of context. Older models with 4k windows couldn't hold that conversation.

### Soft vs Hard Constraints

In practice, you still steer the LLM through the prompt:

> "Call analyze_pcsv FIRST before searching recipes" (from `prompt.py`)

That's a **soft constraint** — the LLM usually obeys it, but it's not enforced in code. If you needed a **hard constraint** (e.g., "never call search_recipes without calling analyze_pcsv first"), you'd add that check in the orchestrator's dispatch logic. Knowing when to use soft (prompt) vs hard (code) constraints is a key design skill in this pattern.

---

## Part 2: High-Level Architecture

### Directory Structure

```
prototype/
├── pyproject.toml          # Package config (deps: openai, pydantic, thefuzz, dotenv)
├── __init__.py             # Package marker
├── run.py                  # CLI entry point — accepts user message, runs agent, prints results
├── orchestrator.py         # Core agent loop — LLM call → tool dispatch → repeat
├── prompt.py               # System prompt assembly (persona + rules + profile + tool instructions)
├── schema.py               # Pydantic models for all data shapes
└── tools/
    ├── definitions.py          # OpenAI function-calling schemas (6 tools)
    ├── analyze_pcsv.py         # Categorize ingredients → Protein/Carb/Veggie/Sauce
    ├── search_recipes.py       # Filter & rank KB recipes by ingredient overlap
    ├── lookup_store_product.py # Fuzzy-match items against Costco product data
    ├── get_substitutions.py    # Find ingredient alternatives
    ├── get_recipe_detail.py    # Fetch full recipe by ID
    └── update_user_profile.py  # Mutate in-memory user profile
```

### Data Flow

```
User message (CLI)
       │
       ▼
   run.py          ← loads .env, creates default UserProfile, calls run_agent()
       │
       ▼
 orchestrator.py   ← explicit while-loop (max 10 iterations)
       │
       ├─► prompt.py          assembles system prompt with user profile injected
       │
       ├─► OpenRouter API      sends messages + tool definitions to Claude Sonnet
       │       │
       │       ▼
       │   Claude responds with either:
       │     (a) tool_calls → dispatched to tools/ handlers → results appended → loop
       │     (b) final text → loop exits → AgentResult returned
       │
       ▼
   run.py          ← prints summary + writes last_result.json
```

### Key Design Points

1. **Explicit orchestration loop** (`orchestrator.py:82-141`) — No framework (no LangChain, no LangGraph). A simple `for` loop calls the LLM, checks if it wants tools, dispatches them, appends results to the message history, and loops. ~60 lines total.
2. **Tool dispatch is a plain if/elif** (`orchestrator.py:27-54`) — Maps tool name strings to Python functions. The LLM decides which tools to call and in what order.
3. **System prompt is rebuilt per call** (`prompt.py:6-12`) — Concatenates 4 sections: persona, rules, user profile (dynamic), and tool usage instructions. The profile section is generated from the Pydantic model so it reflects any in-session updates.
4. **All KB data lives in `data/`** (outside prototype) — Tools read from JSON files: `pcsv_mappings.json`, `recipes.json`, `substitutions.json`, and `costco_raw/*.json`. The tools are pure functions that load and search this data.
5. **Fuzzy matching for store products** (`lookup_store_product.py`) — Uses `thefuzz` (Levenshtein distance) to match user queries like "chicken thighs" against Costco product names. Results are scored and ranked.
6. **Schema layer** (`schema.py`) — Pydantic models for everything: `PCSVResult`, `RecipeSummary`, `RecipeDetail`, `StoreProduct`, `Substitution`, `UserProfile`, `ToolCall`, `AgentResult`. These define the data contract.
7. **Token tracking** — The orchestrator accumulates `input_tokens` and `output_tokens` across iterations for cost visibility.

This is a **Phase 1a validation harness** — it proves the agent reasoning loop works with real KB data and tool-calling, before building the full FastAPI + React app in Phase 2. No persistence, no auth, no streaming — just the core conversational agent logic.

---

## Part 3: Code Walkthrough

We trace a realistic user message through the entire system: **"I have chicken wings and rice, what should I cook?"**

### Step 1: Entry — `run.py`

```python
# run.py:32-53
def main():
    load_dotenv()                          # loads OPENROUTER_API_KEY from .env

    message = "I have chicken wings and rice, what should I cook?"

    profile = UserProfile(                 # default prototype user
        household_size=2,
        preferred_cuisines=["Chinese", "Korean", "Japanese"],
        preferred_stores=["costco"],
    )

    result = run_agent(message, profile=profile)
```

Nothing fancy — builds a default profile and hands off to the orchestrator.

### Step 2: Prompt Assembly — `prompt.py`

Inside `run_agent`, the first thing that happens:

```python
# orchestrator.py:70
system = build_system_prompt(profile)
```

Which assembles this string from four sections:

```
# Smart Grocery Assistant
You are a thinking partner that helps people cook delicious food...

## Rules
1. PCSV analysis first...
2. Real recipes over generation...
...

## User Profile
- Household size: 2
- Dietary restrictions: none stated
- Preferred cuisines: Chinese, Korean, Japanese
- Preferred stores: costco

## Tool Usage
You have 6 tools available...
```

The profile section is dynamic (`prompt.py:15-30`) — it reads from the `UserProfile` object, so if the LLM updates the profile mid-conversation, the next call would reflect that.

### Step 3: The Loop Begins — `orchestrator.py`

```python
# orchestrator.py:71-88
messages = [
    {"role": "system", "content": system},
    {"role": "user", "content": "I have chicken wings and rice, what should I cook?"},
]
all_tool_calls: list[ToolCall] = []

for iteration in range(MAX_ITERATIONS):       # max 10 loops
    response = client.chat.completions.create(
        model="anthropic/claude-sonnet-4",
        messages=messages,
        tools=TOOLS,                           # 6 tool definitions from definitions.py
        max_tokens=4096,
    )
```

The message history at this point has just 2 entries: the system prompt and the user message.

### Step 4: Iteration 1 — LLM calls `analyze_pcsv`

The LLM reads the system prompt rule *"PCSV analysis first"* and decides to call `analyze_pcsv`. The response comes back as:

```python
choice.finish_reason = "tool_calls"
message.tool_calls = [
    ToolCall(name="analyze_pcsv", arguments='{"ingredients": ["chicken wings", "rice"]}')
]
```

The orchestrator sees `tool_calls`, so it enters the dispatch:

```python
# orchestrator.py:113-125
for tc in message.tool_calls:
    name = tc.function.name                    # "analyze_pcsv"
    params = json.loads(tc.function.arguments) # {"ingredients": ["chicken wings", "rice"]}
    result = _dispatch_tool(name, params, profile)
```

Which routes to:

```python
# orchestrator.py:29-30
if name == "analyze_pcsv":
    return analyze_pcsv(params["ingredients"])
```

**What `analyze_pcsv` does** — loads `data/pcsv_mappings.json`, looks up each ingredient's role (protein/carb/veggie/sauce), tries partial string matching if exact lookup misses, then counts items per category:

```python
# tools/analyze_pcsv.py:22-47
def analyze_pcsv(ingredients: list[str]) -> dict:
    mappings = _load_mappings()     # loads data/pcsv_mappings.json
    categories = {"protein": [], "carb": [], "veggie": [], "sauce": []}

    for ingredient in ingredients:  # ["chicken wings", "rice"]
        key = ingredient.lower()
        roles = mappings.get(key, [])       # "chicken wings" → ["protein"]
        if not roles:                       # try partial match if exact miss
            for mapped_name, mapped_roles in mappings.items():
                if key in mapped_name or mapped_name in key:
                    roles = mapped_roles
                    break
        for role in roles:
            categories[role].append(ingredient)

    return {
        cat: {"status": _status(len(items)), "items": items}
        for cat, items in categories.items()
    }
```

Returns:

```json
{
  "protein": { "status": "low", "items": ["chicken wings"] },
  "carb":    { "status": "low", "items": ["rice"] },
  "veggie":  { "status": "gap", "items": [] },
  "sauce":   { "status": "gap", "items": [] }
}
```

This result gets appended to the message history:

```python
# orchestrator.py:127-129
messages.append(message.model_dump())     # assistant msg with tool_calls
messages.extend(tool_messages)            # tool result
```

The message history now has 4 entries:

```
[0] system    → <full system prompt>
[1] user      → "I have chicken wings and rice, what should I cook?"
[2] assistant → (tool_calls: analyze_pcsv)
[3] tool      → '{"protein":{"status":"low"}, "veggie":{"status":"gap"}, ...}'
```

**Loop continues** — back to the top of the `for` loop, calling the LLM again with this extended history.

### Step 5: Iteration 2 — LLM calls `search_recipes`

The LLM now sees the PCSV result (veggie is a gap, sauce is a gap) and decides to search for recipes that use the user's ingredients:

```python
message.tool_calls = [
    ToolCall(name="search_recipes", arguments='{"ingredients": ["chicken wings", "rice"]}')
]
```

**What `search_recipes` does** — loads `data/recipes.json`, applies optional filters (cuisine, cooking method, max time), then scores each recipe by how many of the user's ingredients it uses:

```python
# tools/search_recipes.py:18-76
def search_recipes(ingredients, cuisine=None, ...):
    recipes = _load_recipes()          # loads data/recipes.json
    user_ingredients = {"chicken wings", "rice"}

    for recipe in recipes:
        have = []   # ingredients the user already has
        need = []   # ingredients the user needs to buy
        for ing in recipe["ingredients"]:
            # partial string matching: "chicken" in "chicken wings" → match
            ...
        match_score = len(have) / len(recipe["ingredients"])

    results.sort(key=lambda r: r["match_score"], reverse=True)
    return results[:10]    # top 10 by match score
```

Returns something like:

```json
[
  {
    "id": "r003",
    "name": "Korean Fried Chicken Wings",
    "name_zh": "韩式炸鸡翅",
    "match_score": 0.67,
    "ingredients_have": ["chicken wings"],
    "ingredients_need": ["gochujang", "garlic", "sesame oil"]
  }
]
```

Result appended to messages (now 6 entries). **Loop continues.**

### Step 6: Iteration 3 — LLM calls `lookup_store_product`

The LLM sees the user needs to buy gochujang. It grounds this in real store data:

```python
message.tool_calls = [
    ToolCall(name="lookup_store_product", arguments='{"item_name": "gochujang"}')
]
```

**What `lookup_store_product` does** — loads all `data/costco_raw/*.json` files, fuzzy-matches the query against product names using Levenshtein distance (`thefuzz` library), and returns the best match with alternatives:

```python
# tools/lookup_store_product.py:36-83
def lookup_store_product(item_name, store=None):
    products = _load_all_products()    # loads all data/costco_raw/*.json
    query = "gochujang"

    for product in products:
        name_score = fuzz.token_sort_ratio(query, product["name"].lower())
        ...
    # returns best match with package size, department, alternatives
```

Result appended to messages (now 8 entries). **Loop continues.**

### Step 7: Iteration 4 — LLM generates final response

The LLM now has everything it needs: PCSV analysis, recipe matches, and store product data. It **does not call any tools** — it returns a final text response:

```python
# orchestrator.py:99-109
if choice.finish_reason != "tool_calls" and not message.tool_calls:
    return AgentResult(
        status="complete",
        response_text=message.content,     # the actual text for the user
        tool_calls=all_tool_calls,         # all 3 tool calls recorded
        total_iterations=4,
    )
```

The loop exits. The final message history had 9 entries:

```
[0] system    → <prompt>
[1] user      → "I have chicken wings and rice..."
[2] assistant → (tool_calls: analyze_pcsv)
[3] tool      → PCSV result
[4] assistant → (tool_calls: search_recipes)
[5] tool      → recipe results
[6] assistant → (tool_calls: lookup_store_product)
[7] tool      → store product result
[8] assistant → final text to user
```

### Summary of the Full Flow

```
Iteration 1:  LLM → analyze_pcsv(["chicken wings", "rice"])
              Result: veggie=gap, sauce=gap

Iteration 2:  LLM → search_recipes(["chicken wings", "rice"])
              Result: Korean Fried Chicken Wings, etc.

Iteration 3:  LLM → lookup_store_product("gochujang")
              Result: Costco product details

Iteration 4:  LLM → final text to user
              "Your list is protein-heavy but missing vegetables.
               Here are some recipes... You can pick up gochujang
               at Costco (500g tub, Asian foods aisle)..."
```

The LLM decided this entire sequence on its own. A different user message might produce a completely different tool sequence — that's the power of the orchestration pattern.