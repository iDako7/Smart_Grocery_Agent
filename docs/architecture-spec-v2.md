# Smart Grocery Assistant — Architecture Spec V2

**Date:** 2026-04-05 | **Status:** Active | **Owner:** Dako (@iDako7)

---

## Context

V1 built the AI layer as six separate REST endpoints with isolated prompts. V2 replaces this with a single conversational agent using tool-use, eliminating rigid endpoint routing and enabling cross-step context sharing. This document captures every architectural decision for the V2 system.

---

## 1. System Shape

Three-layer architecture: Frontend → Backend API → External LLM.

```
React SPA (Vite) ──SSE──▶ FastAPI ──tool-use loop──▶ Claude via OpenRouter
                              │
                              ├── SQLite (KB: recipes, PCSV, products, substitutions)
                              └── PostgreSQL (sessions, saved content, users)
```

**Backend:** Single FastAPI service that manages conversation sessions, hosts the knowledge base, implements tool handlers, and proxies LLM conversations via OpenRouter's tool-use API.

**Two databases by access pattern:** PostgreSQL for mutable data (sessions, saved content, user profiles, auth). SQLite for the read-only knowledge base (recipes, PCSV mappings, store products, substitutions) — simpler to seed, version, and ship as a file.

**Not chosen:**
- Serverless functions — tool-use conversations are stateful across multiple round-trips; requires persistent orchestration
- LLM directly from frontend — tools need DB access; can't expose KB or sessions to the browser

---

## 2. Conversation & Session Design

**One continuous conversation per session with screen-aware checkpoints.**

The full Home → Clarify → Recipes → Grocery flow is one LLM conversation thread. Each screen transition is a new user message in that same thread. The backend tags each turn with the current screen for resumability and context management.

**Context compression:** Before each LLM call, a `build_context()` function compresses old turns into a state summary. The LLM always sees: system prompt + compressed prior state + recent messages. This bounds token costs while preserving reasoning continuity.

**Not chosen:**
- Stateless per-screen calls with re-injected context — loses the agent's ability to reference earlier reasoning; becomes a pipeline instead of a thinking partner

**Risk:** Context compression is an engineering challenge. Phase 2 starts with simple truncation (keep last N turns + summary), optimize in Phase 3 with usage data.

---

## 3. Responsibility Split

Each layer does what it's best at.

| Responsibility | Owner | Why |
|---|---|---|
| Understanding intent, reasoning about PCV gaps, choosing recipes, explaining suggestions | **LLM** | Judgment, natural language, flexible reasoning |
| Executing KB queries, enforcing data schemas, managing sessions, validating constraints (dietary = hard filter) | **Backend** | Deterministic, reliable, fast |
| Rendering structured UI, local interactions (check-off, expand/collapse), optimistic updates | **Frontend** | Instant feedback, no round-trip needed |

**Data flow:** LLM produces loosely structured JSON → backend coerces it into strict types via Pydantic → frontend renders validated, typed data. Frontend never parses raw LLM text.

**Schema coercion hierarchy (no re-prompting for formatting issues):**
1. `json.loads()` — handles 95% (lowercase `true/false/null`)
2. Pydantic type coercion — string "3" → int 3
3. Field validators — semantic synonyms ("good" → "ok")
4. Default values — missing optional fields
5. Re-prompt — last resort, only for structurally broken output (<1% with good prompts)

---

## 4. Agent Architecture

**Single session agent** with one system prompt and six tools. No multi-agent orchestration in Phase 2.

**Cross-session knowledge:** The agent reads a structured user profile (dietary restrictions, preferred cuisines, disliked ingredients, preferred stores) injected into every system prompt at assembly time. The agent updates this profile during conversation via the `update_user_profile` tool. This is the Phase 2 approach to cross-session memory — compact, deterministic, and sufficient for the grocery domain.

**Future scope:** A separate memory agent for cross-session *reasoning* over conversation history (e.g., "what did I cook last Thanksgiving?") when saved content accumulates. Different tools, different prompt, different challenge — belongs in Phase 3 at earliest. The structured profile and read path remain unchanged when the memory agent is added.

**System prompt structure:** Three sections maintained as reusable prompt snippets (skill files), concatenated at build time:
- **Persona** — thinking partner framing, suggest don't dictate, tolerate vague input
- **Rules** — hard constraints (dietary restrictions are absolute, PCSV before creativity, prefer KB over generation, flag AI-generated recipes)
- **Tool instructions** — when to call each tool and in what order

**Prompt assembly rebuilds on every `/chat` call.** The user profile may change mid-session (via `update_user_profile`), so prompt assembly reads the latest profile from PostgreSQL each time rather than caching it at session start.

Prompt content is designed and refined during Phase 1 through real conversations. No premature lock-down.

---

## 5. Tool Design

Six tools. The LLM decides *what* to look up, the backend decides *how*.

### 5.1 `search_recipes`
- **Params:** `ingredients[]`, `cuisine?`, `cooking_method?`, `effort_level?`, `flavor_tags[]?`, `serves?`
- **Returns:** List of recipe summaries (id, name, name_zh, cuisine, method, effort_level, flavor_tags, pcsv_roles, ingredients_have, ingredients_need)
- **Executes:** SQL query against SQLite recipe table

### 5.2 `analyze_pcsv`
- **Params:** `ingredients[]`
- **Returns:** `{protein: {status, items[]}, carb: {status, items[]}, veggie: {status, items[]}, sauce: {status, items[]}}`
- **Executes:** Deterministic lookup against PCSV mapping table. Not an LLM task — the lookup table is the source of truth for category assignments

### 5.3 `lookup_store_product`
- **Params:** `item_name`, `store?: "costco" | "community_market"`
- **Returns:** `{product_name, package_size, department, store, alternatives[]}`
- **Executes:** Fuzzy match against store product data

### 5.4 `get_substitutions`
- **Params:** `ingredient`, `reason?: "unavailable" | "dietary" | "preference"`
- **Returns:** List of `{substitute, match_quality, notes}`

### 5.5 `get_recipe_detail`
- **Params:** `recipe_id`
- **Returns:** Full cooking instructions, ratios, tips, source attribution
- **Purpose:** Keeps initial `search_recipes` responses lightweight; fetched when user expands a recipe card

### 5.6 `update_user_profile`
- **Params:** `field` (enum: household_size, dietary_restrictions, preferred_cuisines, disliked_ingredients, preferred_stores, notes), `value`
- **Returns:** `{updated: true, field, new_value}`
- **Executes:** Write to PostgreSQL user profile table
- **Purpose:** Persists preferences and restrictions learned during conversation. The agent calls this when users mention dietary needs, cuisine preferences, or other persistent facts — e.g., "I'm halal" triggers an update to `dietary_restrictions`

### Design notes
- No "generate_recipe" tool — when KB has no match, the LLM falls back to generation in its response text, flagged as "AI-suggested"
- No `get_user_history` tool — fridge recall (OQ-1 in product spec) is deferred. Adding it later is a clean extension: new tool + new table
- If Phase 1 testing shows the LLM struggles with 6 tools, merge `get_substitutions` into `search_recipes` as an optional flag

---

## 6. Knowledge Base

SQLite as a single-file, read-only KB with four logical domains:

- **Recipes** — indexed by ingredients, PCSV categories, cuisine, method, effort_level, flavor_tags. Source attribution field ("Kenji / The Food Lab" vs "AI-suggested"). Compact detail blob for cooking instructions

**Effort levels:** `quick` (~15 min or less, minimal active prep), `medium` (~15–45 min, moderate prep), `long` (45+ min or requires marinating/slow cooking). Qualitative by design — a "30-minute" recipe with 20 minutes of knife work feels harder than a "45-minute" recipe where 30 minutes is unattended oven time.

**Flavor tag schema:** Each recipe carries a `flavor_tags` array drawn from two tiers:
- **Taste** (5 basics): sweet, salty, sour, bitter, umami
- **Sensory descriptors**: spicy, creamy, smoky, fresh, rich, numbing, tangy, herbal, aromatic

A recipe typically has 2–4 tags (e.g., Mapo Tofu: `[umami, spicy, numbing]`; teriyaki chicken: `[sweet, umami, rich]`). The tag vocabulary is a flat list now but designed to expand to full aroma profile dimensions (citrus, floral, woody, etc.) in a future phase. New tags can be added without schema migration.

- **PCSV mappings** — ingredient → category lookup. Multi-role supported (beans → protein + carb)
- **Store products** — item, package size, department, store. Starting with Costco Vancouver + local community markets. No price data
- **Substitutions** — ingredient pairs with match quality and context tags (dietary, cultural, availability)

**Vector search:** sqlite-vss extension allows adding embedding columns alongside regular tables for future semantic search. Start with attribute-based filtering (SQL `WHERE` clauses), add vector reranking when usage data shows where keyword matching falls short. Fallback option: DuckDB if sqlite-vss proves limiting.

**Schema design deferred** until recipe source data (Kenji's books, store product lists) is in hand.

---

## 7. User Profile

**Structured profile document** stored in PostgreSQL, read at prompt assembly time. The agent sees the full profile in every system prompt (~500 tokens).

**Schema:**

| Field | Type | Example |
|---|---|---|
| `household_size` | int | 4 |
| `dietary_restrictions` | string[] | ["halal"] |
| `preferred_cuisines` | string[] | ["Chinese", "Korean", "Mexican"] |
| `disliked_ingredients` | string[] | ["cilantro", "blue cheese"] |
| `preferred_stores` | string[] | ["costco", "t&t"] |
| `notes` | string | "Husband doesn't eat spicy. Kids prefer mild flavors." |

**Write path (Phase 2):** The agent calls `update_user_profile` during conversation when users mention persistent facts. Example: "I'm halal" → agent updates `dietary_restrictions` and acknowledges the change.

**Read path:** `build_prompt()` reads the profile from PostgreSQL on every `/chat` call. The profile is injected as a dedicated section in the system prompt, after persona/rules and before tool instructions.

**Phase 3 evolution:** Add an automated writer — a background process or session-end hook that extracts new facts from completed conversations and merges them into the profile. The profile schema and read path remain unchanged.

**Risk:** The `notes` field could grow unbounded if the agent appends without curation. Mitigate with a size cap and periodic summarization.

---

## 8. Response Streaming (SSE)

The `/chat` endpoint returns a Server-Sent Events stream. Each event is a typed JSON payload representing an incremental UI update.

### Event types

```
event: thinking       → status message ("Analyzing your ingredients...")
event: pcsv_update    → PCSV category indicators
event: recipe_card    → one recipe card (emitted per card as available)
event: explanation    → agent's reasoning text
event: grocery_list   → store-grouped shopping list
event: error          → error with context
event: done           → completion signal with status ("complete" | "partial")
```

### Stream flow (Phase 2: collect-then-emit)

```
User msg → Backend sends to LLM
  ├─ emit thinking ("Analyzing your ingredients...")
  ├─ LLM calls analyze_pcsv → backend runs it → emit thinking ("Searching recipes...") → return result to LLM
  ├─ LLM calls search_recipes → backend runs it → emit thinking ("Building your plan...") → return result to LLM
  └─ LLM produces final response → emit pcsv_update, recipe_card (×N), explanation, done
```

The orchestration loop runs to completion, then emits all typed events in rapid sequence. During the loop, only `thinking` status strings are streamed — enough to show progress without interleaving orchestration with event emission.

**Phase 3 upgrade: progressive streaming.** Emit `pcsv_update` and `recipe_card` events inside the loop as each tool completes, so users see results populating before the agent finishes reasoning. This shares identical SSE event types and tool handlers — the change is moving `emit_sse()` calls from after the loop to inside it.

**Not chosen:**
- WebSocket — bidirectional is overkill; client sends via POST, server streams back
- Polling — latency spikes, wasted requests during 5-15 second tool-use loops
- Wait for complete response — 10-second blank screen kills the experience

**Partial failure:** The `done` event carries a status field. On "partial", frontend shows what it has plus a retry prompt for missing parts.

---

## 9. API Contract

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /session` | Create | Starts a new session, returns `session_id` |
| `POST /session/{id}/chat` | SSE stream | Sends user message + screen context, streams back typed events |
| `GET /session/{id}` | Read | Returns current session state (for page refresh / resume) |
| `POST /auth/send-code` | Auth | Sends magic link or 6-digit code to email |
| `POST /auth/verify` | Auth | Validates code, returns JWT |

Saved content (meal plans, recipes, grocery lists) gets standard CRUD endpoints — no LLM involvement. Saving writes current session state to PostgreSQL.

The `/chat` endpoint is the core. All LLM interactions flow through it: screen transitions, chat corrections, swap requests. The `screen` field in the request body tells the backend what event types to emit.

---

## 10. Authentication

**Magic link (passwordless email) + JWT tokens.**

1. User enters email → backend sends a 6-digit code
2. User enters code → backend issues a JWT
3. JWT sent as `Authorization: Bearer` header on all requests
4. Backend validates JWT via middleware on all endpoints except `/auth/*`

**Why magic link:** No password storage, no hashing, no "forgot password" flow. Lower friction for a grocery app. One fewer attack surface.

**Why JWT over server-side sessions:** Stateless — no session lookup per request. Works naturally with SSE (token sent on connection start). Frontend stores token in memory (not localStorage — XSS risk).

**Future:** OAuth (Google/Apple) is a clean addition — same JWT flow, different issuer. Not needed for Phase 2 validation with a small user group.

---

## 11. Frontend Architecture (Suggested — Not Confirmed)

React SPA with SSE client and screen-based state machine.

```
App
├── SSEClient          → singleton, manages stream connection
├── SessionState       → accumulated events → typed state (useReducer + Context)
├── Screens
│   ├── Home           → local only, no SSE
│   ├── Clarify        → renders pcsv_update, thinking events
│   ├── Recipes        → renders recipe_card events, swap interactions
│   └── Grocery        → renders grocery_list event, local check-offs
├── Sidebar            → saved content (CRUD, no LLM)
├── ChatInput          → shared component on Clarify/Recipes/Saved views
└── SavedViews         → meal plan, recipe, grocery list (CRUD)
```

**State pattern:** Each SSE event type maps to a state slot. Components render whatever state exists — no "wait for all data" gate. Screen state machine: `IDLE → LOADING → STREAMING → COMPLETE`.

**Tech:** React + TypeScript, Vite, `useReducer` + Context (not Redux). No meta-framework — single-page app with four screens doesn't need SSR.

---

## 12. Deployment

**Single VPS, containerized. Simple now, no decisions that block scaling later.**

```
VPS (DigitalOcean / similar)
├── Docker Compose
│   ├── fastapi-app (backend + SQLite KB bundled)
│   ├── postgres (sessions, saved content, users)
│   └── caddy (reverse proxy, auto-HTTPS)
└── Frontend: static files served by Caddy
```

**Scale-ready by design:**
- SQLite for KB (read-only, copied per container when scaling)
- PostgreSQL for sessions (shared across instances)
- Stateless JWT auth (no server-side session affinity)
- No hardcoded localhost references

**Not chosen:**
- Serverless (Lambda/Cloud Run) — SSE requires long-lived connections; timeout management is awkward
- Kubernetes — premature for validation phase

**Future exploration:** Load testing with k6 will identify bottlenecks before scaling investment. Expected bottleneck: OpenRouter API latency, not backend.

---

## Phase Alignment

| Component | Phase 1 (Prove) | Phase 2 (Ship) | Phase 3 (Optimize) |
|---|---|---|---|
| Orchestration loop | Claude artifact, manual testing | FastAPI, explicit while-loop | Parallel tool dispatch |
| Prompt assembly | Inline system prompt | Skill file concatenation | A/B testing prompts |
| Context manager | Not needed (single-turn) | Simple truncation (last N turns + summary) | LLM-generated compression |
| Tool handlers | Mock data in tool responses | SQLite queries | Vector reranking |
| Schema coercion | Manual JSON inspection | Pydantic pipeline | Monitoring + prompt fixes |
| SSE emitter | Not needed | Collect-then-emit with status strings | Progressive streaming |
| User profile | Not needed | Agent self-write via tool | Automated extraction pipeline |
| KB | Mock data in tool responses | SQLite with seeded data | Vector search, expanded data |
| Sessions | Not needed | PostgreSQL | Context compression tuning |
| Frontend | Not needed | React SPA | Performance optimization |
| Auth | Not needed | Magic link + JWT | OAuth providers |
| Deployment | Claude artifact | Single VPS + Docker Compose | Multi-instance, monitoring |
| Memory agent | Not in scope | Not in scope | Cross-session reasoning over history |

---

## Open Questions (Carried from Product Spec)

- **OQ-1:** Fridge recall mechanism — deferred to prototyping
- **OQ-2:** KB seed strategy — which recipes and products to index first
- **OQ-3:** Model selection — depends on Phase 1 evaluation
- **OQ-4:** Extremely vague input threshold — deferred to user testing
- **OQ-5:** KB schema design — deferred until source data is available

---

## References

- **Product spec:** `product-spec-v2.md`
- **AI layer architecture:** `ai-layer-architecture-v2.md`
- **Implementation plan:** `Smart_Grocery_Assistant_V2_Implementation_Plan.md`
- **Wireframe:** `wireframe-v2.html`
- **Agent patterns:** [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- **Tool design guide:** [Anthropic — Writing Effective Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
