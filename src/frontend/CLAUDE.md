# Frontend — CLAUDE.md

## Testing Rules

**Screen-level tests must assert visible DOM and MSW request contents** — not component props, internal state, or `vi.mock(...).toHaveBeenCalledWith(...)`. Use `getByRole`, `findByText`, `getByTestId` for DOM assertions. Use MSW `server.use()` with request capture for network assertions.

This rule exists because PR #74 shipped 499/499 green tests with 4 user-visible bugs — the tests asserted implementation details instead of user-observable outcomes.

### When renderHook is OK

Pure hook/reducer logic that has no screen-level equivalent (e.g. `toggleIngredientExclusion`, `addLocalTurn`, `navigateToScreen` state, idempotency guards) can use `renderHook` + `createMockChatService`. But if the behavior is visible on a screen, test it at the screen level with MSW.

### MSW patterns

- Default handlers: `src/test/msw/handlers.ts` (covers all endpoints)
- Per-test overrides: `server.use(http.post(...))` in the test body
- SSE streams: `makeSseStream()` for immediate, `makeDeferredSseStream()` for intermediate-state assertions
- Fixtures: `src/test/fixtures/sse-sequences.ts` for reusable event sequences
