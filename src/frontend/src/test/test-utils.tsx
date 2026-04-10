// Shared test utilities for session-aware component tests.
// Eliminates duplication of createMockChatService and renderWithSession
// across session-context.test.tsx, stage3-integration.test.tsx, and stage3-phase5.test.tsx.

import React from "react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider } from "@/context/session-context";
import type { ChatServiceHandler } from "@/context/session-context";
import type { SSEEvent } from "@/types/sse";

/**
 * Creates a mock chatService that captures callback functions so tests can
 * invoke them manually, simulating SSE events arriving from the server.
 *
 * Returns both the service (for passing to SessionProvider) and a serviceFn
 * spy (for asserting on call args like message text and screen).
 */
export function createMockChatService() {
  let capturedOnEvent: ((event: SSEEvent) => void) | null = null;
  let capturedOnDone:
    | ((status: "complete" | "partial", reason: string | null) => void)
    | null = null;
  let capturedOnError: ((message: string) => void) | null = null;
  const cancelFn = vi.fn();
  const serviceFn = vi.fn<ChatServiceHandler>();

  const service: ChatServiceHandler = (
    message,
    screen,
    onEvent,
    onDone,
    onError
  ) => {
    capturedOnEvent = onEvent;
    capturedOnDone = onDone;
    capturedOnError = onError;
    serviceFn(message, screen, onEvent, onDone, onError);
    return { cancel: cancelFn };
  };

  return {
    service,
    serviceFn,
    getOnEvent: () => capturedOnEvent!,
    getOnDone: () => capturedOnDone!,
    getOnError: () => capturedOnError!,
    cancelFn,
  };
}

/**
 * Render a component wrapped in ScenarioProvider + SessionProvider + MemoryRouter.
 * Use this for integration tests that need the full provider stack.
 */
export function renderWithSession(
  ui: React.ReactElement,
  options?: {
    chatService?: ChatServiceHandler;
    initialPath?: string;
  }
) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ScenarioProvider>
      <SessionProvider chatService={options?.chatService}>
        <MemoryRouter initialEntries={[options?.initialPath ?? "/"]}>
          {children}
        </MemoryRouter>
      </SessionProvider>
    </ScenarioProvider>
  );
  return render(ui, { wrapper: Wrapper });
}
