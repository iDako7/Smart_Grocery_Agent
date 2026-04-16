// server.ts — MSW Node server for Vitest
//
// Import this in setup.tsx to activate MSW for all unit/integration tests.
// Use server.use(...) in individual tests to add per-test overrides.

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
