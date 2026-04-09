# WT3: Frontend — Scope

## Owns
- `src/frontend/` — React SPA (Vite + Bun + TypeScript)

## Imports (read-only)
- `contracts/sse_events.py` — SSE event type definitions (translate to TypeScript types)
- `contracts/api_types.py` — Request/response types (translate to TypeScript types)

## Must not edit
- `src/backend/` — WT2 owns this
- `src/ai/` — WT2 owns this
- `data/` — WT1 owns this
- `contracts/` — propose changes via PR to `main`

## Tech stack
- **Framework:** React 19 + Vite 8 + TypeScript
- **Runtime:** Bun
- **Styling:** Tailwind CSS v4 + shadcn/ui (Stone base color)
- **State:** `useReducer` + Context (no Redux/Zustand)
- **Icons:** Lucide

## Development stages
1. **Stage 1:** Static HTML for all 7 screens (Soft Bento design). No JS — visual review only.
2. **Stage 2:** Convert to React + TS components with typed props. shadcn/ui primitives + Tailwind. Mock data.
3. **Stage 3:** Wire state machine (`IDLE → LOADING → STREAMING → COMPLETE`) with hardcoded mock SSE responses. Requires frozen `contracts/sse_events.py`.
4. **Stage 4 (Phase 2.2):** Real SSE client, real `/chat` endpoint, typed event handling.

## Key patterns
- Screen state machine: `IDLE → LOADING → STREAMING → COMPLETE`
- SSE streaming via `ReadableStream` (Stage 4)
- Component path aliases: `@/components`, `@/lib`, `@/hooks`
