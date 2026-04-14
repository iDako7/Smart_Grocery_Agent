// TDD: Tests written BEFORE implementation (RED phase).
// These tests define the contract for SessionProvider and useSession hook.
// Run `bun test` to see them fail (RED), then implement the context (GREEN).

import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  SessionProvider,
  useSession,
} from "@/context/session-context";
import type { ChatServiceHandler } from "@/context/session-context";
import type { SSEEvent } from "@/types/sse";
import { createMockChatService } from "@/test/test-utils";

// ---------------------------------------------------------------------------
// Test wrapper factory — allows injecting an optional chatService
// ---------------------------------------------------------------------------

function makeWrapper(chatService?: ChatServiceHandler) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <SessionProvider chatService={chatService}>{children}</SessionProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// 1. Provider renders children
// ---------------------------------------------------------------------------

describe("SessionProvider — renders children", () => {
  it("wraps children without error", () => {
    const { result } = renderHook(
      () => {
        // Just verify we can render inside the provider
        return true;
      },
      {
        wrapper: ({ children }) => (
          <SessionProvider>{children}</SessionProvider>
        ),
      }
    );

    expect(result.current).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. useSession throws outside provider
// ---------------------------------------------------------------------------

describe("useSession — throws outside provider", () => {
  it("throws when called outside SessionProvider", () => {
    // Suppress the React error boundary console output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useSession())).toThrow(
      /useSession must be used inside SessionProvider/i
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 3. Initial state
// ---------------------------------------------------------------------------

describe("useSession — initial state", () => {
  it("sessionId is null initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.sessionId).toBeNull();
  });

  it("conversationHistory is empty initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.conversationHistory).toEqual([]);
  });

  it("currentScreen is 'home' initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.currentScreen).toBe("home");
  });

  it("screenState is 'idle' initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.screenState).toBe("idle");
  });

  it("isLoading is false initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.isLoading).toBe(false);
  });

  it("isStreaming is false initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.isStreaming).toBe(false);
  });

  it("isComplete is false initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.isComplete).toBe(false);
  });

  it("isError is false initially", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.isError).toBe(false);
  });

  it("dispatch is a function", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(typeof result.current.dispatch).toBe("function");
  });

  it("sendMessage is a function", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(typeof result.current.sendMessage).toBe("function");
  });

  it("navigateToScreen is a function", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(typeof result.current.navigateToScreen).toBe("function");
  });

  it("resetSession is a function", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(typeof result.current.resetSession).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 4. navigateToScreen
// ---------------------------------------------------------------------------

describe("useSession — navigateToScreen", () => {
  it("updates currentScreen to 'recipes'", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.navigateToScreen("recipes");
    });

    expect(result.current.currentScreen).toBe("recipes");
  });

  it("updates currentScreen to 'grocery'", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.navigateToScreen("grocery");
    });

    expect(result.current.currentScreen).toBe("grocery");
  });

  it("does NOT reset screenState when navigating", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    // Put screen into loading state via dispatch
    act(() => {
      result.current.dispatch({ type: "start_loading" });
    });

    expect(result.current.screenState).toBe("loading");

    // Navigate — should NOT reset screen state
    act(() => {
      result.current.navigateToScreen("clarify");
    });

    expect(result.current.screenState).toBe("loading");
    expect(result.current.currentScreen).toBe("clarify");
  });

  it("can navigate back to 'home'", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.navigateToScreen("recipes");
    });
    act(() => {
      result.current.navigateToScreen("home");
    });

    expect(result.current.currentScreen).toBe("home");
  });
});

// ---------------------------------------------------------------------------
// 5. resetSession
// ---------------------------------------------------------------------------

describe("useSession — resetSession", () => {
  it("clears conversationHistory", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    // Add a turn via sendMessage
    act(() => {
      result.current.sendMessage("hello");
    });

    expect(result.current.conversationHistory).toHaveLength(1);

    act(() => {
      result.current.resetSession();
    });

    expect(result.current.conversationHistory).toEqual([]);
  });

  it("resets sessionId to null", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.resetSession();
    });

    expect(result.current.sessionId).toBeNull();
  });

  it("dispatches reset to screenState machine — state returns to idle", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    // Drive to loading
    act(() => {
      result.current.sendMessage("plan BBQ");
    });

    expect(result.current.screenState).toBe("loading");

    act(() => {
      result.current.resetSession();
    });

    expect(result.current.screenState).toBe("idle");
  });

  it("sets currentScreen back to 'home'", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.navigateToScreen("recipes");
    });

    act(() => {
      result.current.resetSession();
    });

    expect(result.current.currentScreen).toBe("home");
  });
});

// ---------------------------------------------------------------------------
// 6. sendMessage dispatches start_loading
// ---------------------------------------------------------------------------

describe("useSession — sendMessage dispatches start_loading", () => {
  it("screenState transitions to loading after sendMessage", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("I have chicken and rice");
    });

    expect(result.current.screenState).toBe("loading");
    expect(result.current.isLoading).toBe(true);
  });

  it("is idempotent — second sendMessage during loading is ignored", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("first message");
    });

    expect(result.current.screenState).toBe("loading");

    act(() => {
      result.current.sendMessage("second message — should be ignored");
    });

    // chatService must only have been called once
    expect(serviceSpy).toHaveBeenCalledTimes(1);
    // History still has only 1 user turn
    expect(result.current.conversationHistory).toHaveLength(1);
  });

  it("is idempotent during streaming — second sendMessage is ignored", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("first message");
    });

    // Drive to streaming
    act(() => {
      result.current.dispatch({ type: "start_streaming" });
    });

    expect(result.current.screenState).toBe("streaming");

    act(() => {
      result.current.sendMessage("second message — should be ignored");
    });

    expect(serviceSpy).toHaveBeenCalledTimes(1);
    expect(result.current.conversationHistory).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. sendMessage adds user turn to conversation history
// ---------------------------------------------------------------------------

describe("useSession — sendMessage adds user turn", () => {
  it("adds a turn with role='user' and the message text", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("I have chicken and rice");
    });

    expect(result.current.conversationHistory).toHaveLength(1);
    expect(result.current.conversationHistory[0].role).toBe("user");
    expect(result.current.conversationHistory[0].content).toBe(
      "I have chicken and rice"
    );
  });

  it("adds a timestamp string to the turn", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("hello");
    });

    const turn = result.current.conversationHistory[0];
    expect(typeof turn.timestamp).toBe("string");
    expect(turn.timestamp.length).toBeGreaterThan(0);
  });

  it("accumulates multiple user turns", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    // First message
    act(() => {
      result.current.sendMessage("first message");
    });

    // Drive to complete so we can send a second message
    act(() => {
      result.current.dispatch({ type: "start_streaming" });
    });
    act(() => {
      result.current.dispatch({ type: "complete", status: "complete" });
    });

    // Second message
    act(() => {
      result.current.sendMessage("second message");
    });

    // History has user + (no assistant from dispatch) + second user = 2 user turns
    const userTurns = result.current.conversationHistory.filter(
      (t) => t.role === "user"
    );
    expect(userTurns).toHaveLength(2);
    expect(userTurns[0].content).toBe("first message");
    expect(userTurns[1].content).toBe("second message");
  });
});

// ---------------------------------------------------------------------------
// 8. sendMessage calls chatService
// ---------------------------------------------------------------------------

describe("useSession — sendMessage calls chatService", () => {
  it("calls chatService with the message text", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan BBQ for 8 people");
    });

    expect(serviceSpy).toHaveBeenCalledTimes(1);
    expect(serviceSpy.mock.calls[0][0]).toBe("plan BBQ for 8 people");
  });

  it("calls chatService with currentScreen", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.navigateToScreen("recipes");
    });

    act(() => {
      result.current.sendMessage("show me more");
    });

    expect(serviceSpy.mock.calls[0][1]).toBe("recipes");
  });

  it("calls chatService with onEvent, onDone, onError callbacks", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("hello");
    });

    const call = serviceSpy.mock.calls[0];
    expect(typeof call[2]).toBe("function"); // onEvent
    expect(typeof call[3]).toBe("function"); // onDone
    expect(typeof call[4]).toBe("function"); // onError
  });

  it("does NOT call chatService when no message provided (empty string)", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("");
    });

    expect(serviceSpy).not.toHaveBeenCalled();
    expect(result.current.screenState).toBe("idle");
    expect(result.current.conversationHistory).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. chatService onEvent triggers streaming state
// ---------------------------------------------------------------------------

describe("useSession — chatService onEvent triggers streaming", () => {
  it("transitions to streaming on first onEvent call", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    expect(result.current.screenState).toBe("loading");

    act(() => {
      const event: SSEEvent = { event_type: "thinking", message: "Analyzing..." };
      mock.getOnEvent()(event);
    });

    expect(result.current.screenState).toBe("streaming");
    expect(result.current.isStreaming).toBe(true);
  });

  it("screenData accumulates thinking message from onEvent", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      const event: SSEEvent = {
        event_type: "thinking",
        message: "Looking up recipes...",
      };
      mock.getOnEvent()(event);
    });

    expect(result.current.screenData.thinkingMessage).toBe(
      "Looking up recipes..."
    );
  });

  it("subsequent onEvent calls stay in streaming and accumulate data", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    // First event — transitions to streaming
    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "Thinking..." });
    });

    // Second event — accumulates recipe
    act(() => {
      const event: SSEEvent = {
        event_type: "recipe_card",
        recipe: {
          id: "r001",
          name: "Chicken Stir Fry",
          name_zh: "鸡肉炒",
          cuisine: "Chinese",
          cooking_method: "stir-fry",
          effort_level: "medium",
          flavor_tags: ["savory"],
          serves: 2,
          pcsv_roles: { protein: ["chicken"] },
          ingredients_have: ["chicken"],
          ingredients_need: ["soy sauce"],
          alternatives: [],
        },
      };
      mock.getOnEvent()(event);
    });

    expect(result.current.screenState).toBe("streaming");
    expect(result.current.screenData.recipes).toHaveLength(1);
    expect(result.current.screenData.recipes[0].id).toBe("r001");
  });
});

// ---------------------------------------------------------------------------
// 10. chatService onDone triggers complete
// ---------------------------------------------------------------------------

describe("useSession — chatService onDone triggers complete", () => {
  it("screenState transitions to complete when onDone is called", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    // Must be in streaming before complete is valid
    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "..." });
    });

    act(() => {
      mock.getOnDone()("complete", null);
    });

    expect(result.current.screenState).toBe("complete");
    expect(result.current.isComplete).toBe(true);
  });

  it("adds assistant turn to conversationHistory on onDone", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "..." });
    });

    act(() => {
      mock.getOnDone()("complete", null);
    });

    const history = result.current.conversationHistory;
    expect(history).toHaveLength(2);
    expect(history[1].role).toBe("assistant");
  });

  it("assistant turn has a timestamp", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "..." });
    });

    act(() => {
      mock.getOnDone()("complete", null);
    });

    const assistantTurn = result.current.conversationHistory[1];
    expect(typeof assistantTurn.timestamp).toBe("string");
    expect(assistantTurn.timestamp.length).toBeGreaterThan(0);
  });

  it("completionStatus is 'partial' when onDone called with partial", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "..." });
    });

    act(() => {
      mock.getOnDone()("partial", "max_iterations");
    });

    expect(result.current.screenState).toBe("complete");
    expect(result.current.screenData.completionStatus).toBe("partial");
    expect(result.current.screenData.completionReason).toBe("max_iterations");
  });
});

// ---------------------------------------------------------------------------
// 11. chatService onError triggers error
// ---------------------------------------------------------------------------

describe("useSession — chatService onError triggers error", () => {
  it("screenState transitions to error when onError is called", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      mock.getOnError()("LLM timeout");
    });

    expect(result.current.screenState).toBe("error");
    expect(result.current.isError).toBe(true);
  });

  it("screenData.error contains the error message", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      mock.getOnError()("Connection refused");
    });

    expect(result.current.screenData.error).toBe("Connection refused");
  });
});

// ---------------------------------------------------------------------------
// 12. cancel is stored and called on resetSession
// ---------------------------------------------------------------------------

describe("useSession — cancel is stored and callable", () => {
  it("resetSession calls the cancel function from the last chatService call", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });

    act(() => {
      result.current.resetSession();
    });

    expect(mock.cancelFn).toHaveBeenCalledTimes(1);
  });

  it("cancel is not called if no sendMessage was called before resetSession", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.resetSession();
    });

    expect(mock.cancelFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 13. Default no-op chatService
// ---------------------------------------------------------------------------

describe("useSession — default no-op chatService", () => {
  it("sendMessage does not throw when no chatService is injected", () => {
    const wrapper = makeWrapper(); // no chatService
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(() => {
      act(() => {
        result.current.sendMessage("hello");
      });
    }).not.toThrow();
  });

  it("screenState becomes loading even with default no-op chatService", () => {
    const wrapper = makeWrapper(); // no chatService
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("hello");
    });

    expect(result.current.screenState).toBe("loading");
  });
});

// ---------------------------------------------------------------------------
// 14. screenData pass-through from useScreenState
// ---------------------------------------------------------------------------

describe("useSession — screenData pass-through", () => {
  it("screenData is the initial empty data shape when idle", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    const { screenData } = result.current;
    expect(screenData.pcsv).toBeNull();
    expect(screenData.recipes).toEqual([]);
    expect(screenData.groceryList).toEqual([]);
    expect(screenData.explanation).toBe("");
    expect(screenData.thinkingMessage).toBe("");
    expect(screenData.error).toBeNull();
    expect(screenData.completionStatus).toBeNull();
    expect(screenData.completionReason).toBeNull();
  });

  it("direct dispatch via context updates screenData", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.dispatch({ type: "start_loading" });
    });
    act(() => {
      result.current.dispatch({ type: "start_streaming" });
    });
    act(() => {
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "explanation", text: "Here are your recipes." },
      });
    });

    expect(result.current.screenData.explanation).toBe("Here are your recipes.");
    expect(result.current.screenState).toBe("streaming");
  });
});

// ---------------------------------------------------------------------------
// 15. Edge cases from code review
// ---------------------------------------------------------------------------

describe("useSession — edge cases", () => {
  it("completes cleanly when onDone fires with no preceding onEvent", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("quick query");
    });
    expect(result.current.screenState).toBe("loading");

    act(() => {
      mock.getOnDone()("complete", null);
    });

    expect(result.current.screenState).toBe("complete");
  });

  it("onError during streaming transitions to error", () => {
    const mock = createMockChatService();
    const wrapper = makeWrapper(mock.service);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("plan dinner");
    });
    act(() => {
      mock.getOnEvent()({ event_type: "thinking", message: "..." });
    });
    expect(result.current.screenState).toBe("streaming");

    act(() => {
      mock.getOnError()("Connection lost mid-stream");
    });

    expect(result.current.screenState).toBe("error");
    expect(result.current.screenData.error).toBe("Connection lost mid-stream");
  });

  it("whitespace-only message is rejected", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.sendMessage("   ");
    });

    expect(serviceSpy).not.toHaveBeenCalled();
    expect(result.current.screenState).toBe("idle");
    expect(result.current.conversationHistory).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 17. sendMessage with explicit targetScreen bypasses stale screen ref
//
// Regression test for issue #65:
// navigateToScreen("clarify") + sendMessage(text) in the same event handler
// causes a React 18 state-batching race — currentScreenRef.current still
// returns "home" when sendMessage reads it one line later.  The fix adds an
// optional targetScreen param so call sites can bypass the stale ref.
// ---------------------------------------------------------------------------

describe("useSession — sendMessage with explicit targetScreen", () => {
  it("calls chatService with explicit targetScreen even when currentScreen is still 'home'", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    // currentScreen is "home" (initial). Simulate the race: navigateToScreen
    // was called synchronously before sendMessage, but React hasn't committed
    // the update yet.  sendMessage must use the explicit targetScreen.
    act(() => {
      result.current.sendMessage("I have beef, tomatoes, and eggs", "clarify");
    });

    expect(serviceSpy).toHaveBeenCalledTimes(1);
    expect(serviceSpy.mock.calls[0][1]).toBe("clarify");
  });

  it("falls back to currentScreenRef when targetScreen is omitted", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    // Navigate first (committed in its own act), then send without targetScreen.
    act(() => {
      result.current.navigateToScreen("recipes");
    });
    act(() => {
      result.current.sendMessage("show more");
    });

    expect(serviceSpy.mock.calls[0][1]).toBe("recipes");
  });

  it("accepts 'recipes' as targetScreen when clarify→recipes transition fires", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    // currentScreen stays "clarify" (not yet committed), but we pass "recipes"
    act(() => {
      result.current.navigateToScreen("clarify"); // set base, then don't commit "recipes"
    });
    act(() => {
      result.current.sendMessage("Looks good, show recipes.", "recipes");
    });

    expect(serviceSpy.mock.calls[0][1]).toBe("recipes");
  });

  it("accepts 'grocery' as targetScreen for recipes→grocery transition", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.navigateToScreen("recipes"); // base screen
    });
    act(() => {
      result.current.sendMessage("Build my grocery list.", "grocery");
    });

    expect(serviceSpy.mock.calls[0][1]).toBe("grocery");
  });
});

// ---------------------------------------------------------------------------
// 16. addLocalTurn
// ---------------------------------------------------------------------------

describe("useSession — addLocalTurn", () => {
  it("appends a ConversationTurn to conversationHistory", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    const turn = {
      role: "user" as const,
      content: "locally injected message",
      timestamp: "2026-04-11T00:00:00.000Z",
    };

    act(() => {
      result.current.addLocalTurn(turn);
    });

    expect(result.current.conversationHistory).toHaveLength(1);
    expect(result.current.conversationHistory[0]).toEqual(turn);
  });

  it("does NOT change screenState — stays idle", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.addLocalTurn({
        role: "assistant",
        content: "injected assistant turn",
        timestamp: "2026-04-11T00:00:01.000Z",
      });
    });

    expect(result.current.screenState).toBe("idle");
  });

  it("does NOT trigger loading or streaming", () => {
    const mock = createMockChatService();
    const serviceSpy = vi.fn(mock.service);
    const wrapper = makeWrapper(serviceSpy);
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.addLocalTurn({
        role: "user",
        content: "no chat service call",
        timestamp: "2026-04-11T00:00:02.000Z",
      });
    });

    // chatService must NOT be called
    expect(serviceSpy).not.toHaveBeenCalled();
    // State machine must stay idle
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });
});
