# Architecture Decision Records

**Project:** Smart Grocery Assistant V2
**Last updated:** 2026-04-07 | **Owner:** Dako (@iDako7)

---

## Index

| ADR | Decision | Status | Origin |
|-----|----------|--------|--------|
| ADR-1 | Single Orchestration Loop Over Framework Abstraction | Decided | ai-layer-architecture-v2.md |
| ADR-2 | Collect-Then-Emit Over Progressive Streaming (Phase 2) | Decided | ai-layer-architecture-v2.md |
| ADR-3 | Structured User Profile Over RAG-Based Memory | Decided | ai-layer-architecture-v2.md |
| ADR-4 | Two Databases By Access Pattern | Decided | ai-layer-architecture-v2.md |
| ADR-5 | Seven Tools, LLM-Controlled Sequencing | Decided | ai-layer-architecture-v2.md |
| ADR-6 | Schema Coercion Hierarchy Over Re-Prompting | Decided | ai-layer-architecture-v2.md |
| ADR-7 | SSE Over WebSocket and Polling | Decided | ai-layer-architecture-v2.md |
| ADR-8 | PCV Gap Analysis as Deterministic Lookup, Not LLM Judgment | Decided | New |
| ADR-9 | KB-Grounded Content with Transparent AI Fallback | Decided | Extends ADR-5 |
| ADR-10 | Dietary Restrictions as Hard Constraints with Recovery Workflows | Decided | Extends ADR-5 |
| ADR-11 | Modular System Prompt Architecture | Decided | New |
| ADR-12 | Conversation as Continuous Thread with Screen Checkpoints | Decided | New |
| ADR-13 | Magic Link + JWT Authentication | Decided | New |
| ADR-14 | Single VPS + Docker Compose Deployment | Decided | New |
| ADR-15 | Multi-Dimensional Flavor Tags for Variety Matching | Decided | New |
| ADR-16 | Frontend Stack: React + Vite + shadcn/ui + Tailwind + Bun | Decided | New |

---

## ADR-1: Single Orchestration Loop Over Framework Abstraction

**Decision:** Build the tool-use orchestration as an explicit while-loop (~40 lines), not a framework like LangChain or LangGraph.

**Why:** Full control over when status events fire, how many iterations are allowed, and what happens on partial failure. At this scale (one agent, seven tools), framework overhead exceeds problem complexity. OpenRouter compatibility with framework abstractions is unverified.

**Why not alternatives:**

- *LangChain/LangGraph agent executor:* Handles the loop but adds a heavy dependency. Time spent learning its abstractions would exceed time writing the loop.
- *Anthropic tool-use SDK:* Cleaner API, but we go through OpenRouter — SDK compatibility isn't guaranteed.

**Trade-off:** LLM could loop infinitely. Mitigated with `max_iterations = 10` — if hit, return whatever partial results exist with `done: "partial"` status.

---

## ADR-2: Collect-Then-Emit Over Progressive Streaming (Phase 2)

**Decision:** Orchestration loop runs to completion, then emits all SSE events in rapid sequence. During the loop, only simple `thinking` status strings are streamed.

**Why:** Keeps orchestration logic clean — tool execution separated from event emission. Frontend doesn't need to handle partial state (e.g., recipe cards arriving while agent is still reasoning). Status messages ("Analyzing your ingredients…") are sufficient feedback for Phase 2 validation.

**Why not alternatives:**

- *Progressive streaming:* Emits typed events inside the loop as each tool completes. Better UX but interleaves orchestration with streaming logic. Planned as Phase 3 upgrade — same SSE event types and tool handlers, just moving `emit_sse()` calls from after the loop to inside it.

**Trade-off:** 10+ second wait with only status strings may feel slow. Mitigated by emitting a new status on each tool call start, giving users a sense of progress.

---

## ADR-3: Structured User Profile Over RAG-Based Memory

**Decision:** Use a compact structured user profile (Pydantic model, ~500 tokens, stored in PostgreSQL) injected into every system prompt. No vector search, no conversation history retrieval.

**Why:** Relevant user knowledge in the grocery domain is small and slowly-changing. Fits entirely in the system prompt without retrieval overhead. Deterministic — agent always sees the same profile, no retrieval quality variance. Decouples memory schema (what agent reads) from memory writer (what populates it).

**Why not alternatives:**

- *Conversation window (last N turns):* Simple but lossy. Preferences mentioned 20 sessions ago are gone.
- *RAG over history:* Stores all past conversations, embeds and retrieves. Unpredictable retrieval quality, higher cost, returns verbose raw conversation instead of distilled facts.
- *Hybrid (profile + episodic RAG):* Only warranted if usage data shows episodic recall matters (e.g., "what did I cook last Thanksgiving?").

**Trade-off:** Profile `notes` field could grow unbounded. Mitigate with size cap and periodic summarization. Phase 3 adds an automated writer (background extraction from completed conversations).

---

## ADR-4: Two Databases By Access Pattern

**Decision:** SQLite for read-only knowledge base (recipes, PCSV mappings, store products, substitutions). PostgreSQL for mutable data (sessions, saved content, user profiles, auth).

**Why:** Two fundamentally different access patterns. SQLite is simpler to seed, version, and deploy as a single file bundled with the app — no server process, no connection pooling, no migrations for reference updates. PostgreSQL handles concurrent writes from multiple users, transactional integrity for sessions, and relational queries across saved content.

**Why not alternatives:**

- *PostgreSQL for everything:* Simpler operationally but forces KB through connection pooling. Harder to version or ship as a file — KB updates require migrations instead of file replacement.
- *SQLite for everything:* Can't handle concurrent writes from multiple users. Single-writer lock would serialize all session updates.

**Trade-off:** Two databases add operational complexity. Mitigated by keeping SQLite truly read-only at runtime (no writes, no WAL needed) and bundling it in the Docker image.

---

## ADR-5: Seven Tools, LLM-Controlled Sequencing

**Decision:** Seven tools total — six KB/profile tools plus one bilingual glossary tool. The LLM decides which tools to call, in what order, and how many times. No hardcoded call sequence.

**Why:** Different user inputs require different tool sequences. "BBQ for 8" needs `analyze_pcsv` → `search_recipes` → `lookup_store_product`. "What can I substitute for gochujang?" needs only `get_substitutions`. Hardcoding sequences forces every input through the same pipeline; tool-use lets the agent adapt.

**Tools:**

| Tool | Purpose | Data source |
|---|---|---|
| `analyze_pcsv` | Categorize ingredients by Protein/Carb/Veggie/Sauce | SQLite |
| `search_recipes` | Find recipes matching ingredients and constraints | SQLite |
| `lookup_store_product` | Package sizes, departments, store availability | SQLite |
| `get_substitutions` | Ingredient alternatives by reason | SQLite |
| `get_recipe_detail` | Full cooking instructions for a recipe | SQLite |
| `update_user_profile` | Persist learned preferences/restrictions | PostgreSQL |
| `translate_term` | EN↔ZH bilingual glossary lookup | SQLite |

**Why not alternatives:**

- *Hardcoded pipeline (V1 approach):* Forces every input through the same sequence. Can't handle single-tool queries efficiently.
- *Fewer tools (merge substitutions into search):* Fallback option if LLM struggles with 7 tools. Not needed so far.

**Trade-off:** LLM may call tools unnecessarily or in suboptimal order. Mitigated by tool instruction workflows in the system prompt specifying preferred sequences.

> **Update (Phase 1b):** Originally six tools. `translate_term` added after Phase 1a review revealed bilingual support was only implied, not tooled. See commit `53d609e`.

---

## ADR-6: Schema Coercion Hierarchy Over Re-Prompting

**Decision:** Parse LLM output through a multi-step coercion pipeline. Re-prompt only as last resort for structurally broken JSON.

**Coercion hierarchy:**

1. `json.loads()` — handles 95% of cases
2. Pydantic type coercion — string "3" → int 3, "true" → bool True
3. Field validators — semantic synonyms ("good" → "ok" for status fields)
4. Default values — missing optional fields get None
5. Re-prompt — last resort, <1% with good prompts

**Why:** Each step is cheaper than re-prompting. Steps 1–4 add milliseconds; re-prompting adds 2–5 seconds and doubles token cost. The pipeline handles the long tail of LLM formatting inconsistencies without round-trip cost.

**Why not alternatives:**

- *Re-prompt on any parse failure:* Simple logic but expensive. Adds seconds of latency for issues that Pydantic coercion handles in milliseconds.
- *Strict schema enforcement (reject malformed):* Fails too often. LLMs produce valid-but-loose JSON routinely.

**Trade-off:** Over-permissive coercion could mask real output errors. Mitigate by logging coercion actions — if a specific coercion fires frequently, fix the prompt instead.

> **Validated (Phase 1b):** 86% eval pass rate across 3 rounds. Zero failures required schema changes or re-prompting — all resolved by prompt refinement.

---

## ADR-7: SSE Over WebSocket and Polling

**Decision:** Server-Sent Events for the `/chat` endpoint response stream.

**Why:** SSE is unidirectional (server → client), matching the data flow exactly. Client sends via POST, server streams back. No connection upgrade negotiation. Native browser `EventSource` API. Works through most proxies and CDNs without special configuration.

**Why not alternatives:**

- *WebSocket:* Bidirectional, but client only sends via POST. Duplex adds connection management complexity (heartbeat, reconnection) for no benefit.
- *Polling:* Wrong model for a stream of typed events. Too frequent wastes requests during idle; too infrequent misses updates during 5–15s tool-use loops.

**Trade-off:** SSE connections are long-lived. Server must handle drops gracefully — `done` event carries status field (`"complete"` | `"partial"`) so frontend knows whether to show a retry prompt.

---

## ADR-8: PCV Gap Analysis as Deterministic Lookup, Not LLM Judgment

**Decision:** Protein/Carb/Veggie categorization is always a deterministic KB lookup via `analyze_pcsv`, never LLM judgment. Sauce is tracked internally but not surfaced in the analysis UI.

**Why:** PCV gap analysis is the reasoning backbone of the assistant — it drives what recipes to suggest and what's missing from a meal. Making this deterministic means the agent's foundational reasoning is consistent and auditable. The LLM builds on top of PCV results (recipe suggestions, explanations) but never overrides the categorization itself.

**Why not alternatives:**

- *LLM classifies ingredients directly:* Non-deterministic. Same ingredient could be categorized differently across sessions. Debugging becomes guesswork — was the bad suggestion caused by bad categorization or bad reasoning?
- *Hybrid (LLM for unknown ingredients, KB for known):* Introduces two code paths and inconsistent behavior. If an ingredient isn't in the KB, `analyze_pcsv` returns a gap — that's a data problem to fix, not a runtime problem to patch with LLM.

**Trade-off:** KB must have good coverage of common ingredients. Gaps in PCSV mappings degrade the experience silently (ingredient categorized as unknown). Mitigate by monitoring unmatched ingredients and expanding the KB.

---

## ADR-9: KB-Grounded Content with Transparent AI Fallback

> *Extends ADR-5 — operationalizes the "no generate_recipe tool" design note and establishes a trust labeling pattern across features.*

**Decision:** Content is KB-grounded by default. When KB has no match, the agent may generate content but must label it transparently. This pattern applies uniformly:

- **Recipes:** ~80% from curated KB (with `source_attribution`, e.g., "Kenji López-Alt"). ~20% LLM-generated, labeled "AI-suggested (not in recipe database)."
- **Translations:** Glossary lookup first via `translate_term`. On glossary miss, agent provides its own translation labeled "AI-translated (not in glossary)."

**Why:** Builds user trust through sourcing transparency. Users know which content is tested/verified vs. experimental. The labeling pattern is consistent across features — users learn one trust model, not two. Also avoids a `generate_recipe` tool (which would make generation feel first-class rather than fallback).

**Why not alternatives:**

- *KB-only, no AI fallback:* Too rigid. Users hit dead ends when KB doesn't cover their query. "I don't have that" is a poor experience.
- *AI-first, KB as enhancement:* Loses the trust advantage. Users can't distinguish curated from generated. Undermines the value of the curated KB.
- *Separate tools for generation (`generate_recipe`, `translate_ai`):* Elevates generation to first-class operation. LLM would use generation tools even when KB has matches, because it's easier.

**Trade-off:** Maintaining the ~80/20 split depends on KB coverage. If KB is too thin, most responses become "AI-suggested" and the trust model loses meaning. Mitigate by monitoring the KB-hit ratio and expanding KB for high-frequency misses.

---

## ADR-10: Dietary Restrictions as Hard Constraints with Recovery Workflows

> *Extends ADR-5 — adds specific tool workflow patterns for safety-critical constraints. Evolved during Phase 1b eval iteration.*

**Decision:** Dietary restrictions are never violated in any response. When user input conflicts with their dietary profile, the agent follows a structured recovery workflow rather than refusing or silently filtering.

**Recovery workflow:**

1. Acknowledge the conflict explicitly
2. Call `analyze_pcsv` with only compliant ingredients
3. Call `get_substitutions` with `reason="dietary"` for conflicting items
4. Call `search_recipes` with compliant + substituted ingredients
5. If no KB results, suggest AI-generated alternatives (labeled per ADR-9)

**Why:** User safety and trust depend on respecting dietary boundaries (halal, vegetarian, allergies). But "I can't help with that" is a bad experience. The recovery workflow turns a conflict into a useful interaction — the user gets compliant alternatives, not a dead end.

**Why not alternatives:**

- *Silent filtering (remove non-compliant results without comment):* User doesn't understand why results seem limited. Feels like a bug, not a feature.
- *Refusal ("I can't suggest recipes with pork for a halal user"):* Correct but unhelpful. Stops the conversation instead of redirecting it.
- *Soft guidelines (prefer compliant, allow override):* Too risky for allergies and religious restrictions. "The AI suggested pork to my halal household" is a trust-destroying failure.

**Trade-off:** Recovery workflow requires multiple tool calls (3-4 per conflict), increasing latency. Acceptable because dietary conflicts are infrequent and correctness matters more than speed here.

> **Phase 1b learning:** Initially, the system prompt had only prohibitions ("never suggest non-compliant recipes"). Evals showed the agent followed the prohibition but got stuck — it didn't know *what to do instead*. Adding the explicit recovery workflow (prohibition + mechanics) resolved this.

---

## ADR-11: Modular System Prompt Architecture

**Decision:** System prompt is assembled from three reusable snippets — persona, rules, and tool instructions — concatenated at build time. User profile is injected dynamically. Prompt assembly happens on every `/chat` call, not cached at session start.

**Structure:**

```
[Persona snippet]     — who the agent is
[Rules snippet]       — what the agent must do (hard constraints, quality bars)
[User profile]        — dynamically injected from PostgreSQL
[Tool instructions]   — how the agent executes (tool sequencing, workflows)
```

**Why:** Separating concerns enables independent iteration — test persona changes without touching rules, add tool workflows without risking behavioral regressions. Rebuilding every `/chat` call ensures profile changes mid-session (via `update_user_profile`) are reflected immediately.

**Why not alternatives:**

- *Monolithic prompt:* Single string with everything. Hard to iterate — changing one rule risks breaking adjacent context. Hard to test — no way to evaluate persona vs. rules independently.
- *Session-cached prompt:* Build once at session start, reuse for all turns. Faster but misses mid-session profile updates. User says "I'm vegetarian" → agent updates profile → next turn still uses old prompt.
- *RAG-based prompt selection:* Retrieve relevant prompt chunks per query. Overkill — the full prompt is <2000 tokens. Retrieval adds latency and non-determinism for no benefit.

**Trade-off:** Rebuilding the prompt every call adds a PostgreSQL read per turn (fetching latest profile). Acceptable — single-row read by primary key is <1ms.

> **Phase 1b learning:** Tool instructions need *workflows* (which tools to call in sequence for specific scenarios), not just *descriptions* (what each tool does). Without workflows, the agent follows behavioral rules but gets stuck on mechanics.

---

## ADR-12: Conversation as Continuous Thread with Screen Checkpoints

**Decision:** The full Home → Clarify → Recipes → Grocery flow is one continuous LLM conversation thread. Each screen transition is a new user message in the same thread, tagged with a screen context identifier.

**Why:** Enables cross-step reasoning — the agent can reference earlier clarifications when suggesting recipes, or recall ingredient discussions when building the grocery list. The conversation thread is the agent's working memory within a session.

**Why not alternatives:**

- *Stateless per screen:* Each screen starts a fresh LLM call with only its own inputs. Loses context — user's clarification on screen 2 isn't available on screen 3. Forces the frontend to pass all relevant state explicitly.
- *Separate sessions per screen:* Clean isolation but defeats the purpose of a conversational agent. User has to repeat context at each transition.
- *Full history replay:* Send entire uncompressed conversation on every call. Works for short sessions but token costs grow linearly. Hits context limits on long sessions.

**Trade-off:** Conversation history grows with each turn, increasing token costs. Mitigated by the context manager: Phase 2 uses simple truncation (last N turns + summary of older turns), Phase 3 upgrades to LLM-generated compression via `build_context()`.

---

## ADR-13: Magic Link + JWT Authentication

**Decision:** Passwordless email-based auth (magic link via 6-digit code) + stateless JWT tokens. Token stored in frontend memory, not localStorage.

**Flow:**

1. User enters email → backend sends 6-digit code
2. User enters code → backend issues JWT
3. JWT sent as `Authorization: Bearer` header on all requests
4. Token stored in memory (not localStorage)

**Why:** No password storage, no hashing, no "forgot password" flow — lower friction for a grocery app. Stateless JWT means no session lookup per request. Memory-only token storage avoids XSS exposure (localStorage is readable by any script on the page). Works naturally with SSE (token sent on connection start).

**Why not alternatives:**

- *Username/password:* Requires password hashing, storage, reset flow, and strength validation. Disproportionate complexity for a grocery assistant.
- *OAuth only (Google/Apple):* Depends on third-party availability. Some users (especially immigrants) may not have Google accounts tied to their primary email. Clean addition later — same JWT flow, different issuer.
- *Token in localStorage:* Simpler persistence across page reloads but vulnerable to XSS. Any injected script can read and exfiltrate the token.

**Trade-off:** Memory-only storage means the token is lost on page refresh — user must re-authenticate. Acceptable for Phase 2 validation. Can add secure httpOnly cookie as upgrade if session persistence becomes important.

---

## ADR-14: Single VPS + Docker Compose Deployment

**Decision:** Deploy as containerized services on a single VPS (DigitalOcean or similar) using Docker Compose. Frontend served as static files by Caddy reverse proxy.

**Stack:**

```
VPS
├── Docker Compose
│   ├── fastapi-app (backend + SQLite KB bundled)
│   ├── postgres (sessions, saved content, users)
│   └── caddy (reverse proxy, auto-HTTPS)
└── Frontend: static files served by Caddy
```

**Why:** Simplest deployment that validates the product. One machine, one `docker compose up`. Caddy handles TLS automatically. The architecture is scale-ready without scale-ready infra — SQLite is read-only (copied per container), PostgreSQL is shared, JWT auth is stateless (no session affinity needed).

**Why not alternatives:**

- *Serverless (Lambda/Cloud Run):* SSE requires long-lived connections. Serverless platforms have timeout limits (30s–5min) that conflict with 5–15s tool-use loops. Timeout management adds complexity for no benefit at this scale.
- *Kubernetes:* Correct for multi-service production but premature for validation phase. Adds operational overhead (cluster management, helm charts, ingress controllers) without proportional benefit.
- *PaaS (Heroku/Railway):* Simpler ops but less control over SQLite file bundling and SSE connection handling. Vendor-specific constraints may force architectural compromises.

**Trade-off:** Single VPS is a single point of failure. Acceptable for validation — no SLA commitments. When user load justifies it, horizontal scaling is straightforward: stateless app containers behind a load balancer, shared PostgreSQL.

> **Phase 3 target:** AWS (ECS/Fargate for backend containers, RDS for managed PostgreSQL, ALB for SSE-compatible load balancing, S3 + CloudFront for frontend). The Docker Compose service structure maps directly to ECS task definitions — no architectural rework needed.

---

## ADR-15: Multi-Dimensional Flavor Tags for Variety Matching

**Decision:** Recipes carry 2–4 flavor tags from a two-tier vocabulary: 5 basic tastes (sweet, salty, sour, bitter, umami) + 10+ sensory descriptors (spicy, creamy, smoky, fresh, rich, numbing, tangy, herbal, aromatic). Used for variety matching across meals.

**Why:** "Chinese cuisine" spans wildly different flavor profiles — Mapo Tofu (umami, spicy, numbing) vs. Sweet & Sour Pork (sweet, sour, tangy). Cuisine labels alone can't drive variety. Flavor tags enable the agent to suggest contrasting profiles: if tonight's dish is [sweet, umami], tomorrow suggest [sour, fresh].

**Why not alternatives:**

- *Cuisine labels only:* Too coarse. "Chinese" doesn't distinguish numbing Sichuan from light Cantonese. Users get variety in name but not in taste.
- *Free-text flavor descriptions:* Non-standardized. Can't do set operations (contrast, complement) on free text. Each recipe describes flavor differently.
- *Single-tier flat vocabulary:* Mixing basic tastes with sensory descriptors in one list conflates different dimensions. Two tiers allow filtering by either level.

**Trade-off:** Tags must be manually curated per recipe — no reliable automated tagging exists. Vocabulary stored as a flat expandable list, so adding descriptors requires no schema migration, only KB updates.

> **Origin:** Inspired by CookWell's recipe categorization. See commit `fbc2e14`.

---

## ADR-16: Frontend Stack — React + Vite + shadcn/ui + Tailwind + Bun

**Decision:** Use React + TypeScript with Vite as the build tool, Bun as the package manager, shadcn/ui for component primitives, and Tailwind CSS for styling. Design tokens from the Soft Bento design system are mapped into the Tailwind configuration.

**Why:** Solo developer needs to minimize frontend time while maintaining quality. shadcn/ui provides accessible, well-structured component primitives (Card, Button, Dialog, Input) that can be customized via Tailwind. Bun replaces npm with 10-30x faster installs. Tailwind's utility-first approach maps naturally to extracting design tokens from the Soft Bento reference into `tailwind.config.ts`. No meta-framework (Next.js) needed — the app is a client-side SPA with no SSR requirements.

**Why not alternatives:**

- *Next.js:* Adds SSR complexity and a redundant server layer when FastAPI is already the backend. SSE proxying through Next.js adds friction.
- *Vue/Svelte:* Smaller ecosystems. No mobile path equivalent to React Native.
- *Expo (React Native for web):* Web output quality is noticeably worse than native web. Design system wouldn't translate to React Native's StyleSheet model.

**Trade-off:** shadcn/ui components are copied into the project (not installed as a package), which means manual updates. Acceptable given the small component surface area (< 15 components).

---

## References

- **ADR-1 through ADR-7 original source:** `docs/ai-layer-architecture-v2.md` §4
- **Product spec:** `docs/product-spec-v2.md`
- **Architecture spec:** `docs/architecture-spec-v2.md`
- **AI layer architecture:** `docs/ai-layer-architecture-v2.md`
- **Phase 1b eval results:** `docs/03-evaluations/phase-1b-reasoning-eval-report.md`
- **Prompt engineering patterns:** `docs/02-human_reference/feedback_prompt_engineering_patterns.md`
