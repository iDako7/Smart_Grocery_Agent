// TDD: Tests written BEFORE implementation.
// These tests define the contract for useScreenState hook.
// Run `bun test` to see them fail (RED), then implement the hook (GREEN).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  useScreenState,
  screenReducer,
  initialScreenData,
} from "@/hooks/use-screen-state";

import type {
  ScreenState,
  ScreenAction,
  ScreenData,
  UseScreenStateReturn,
} from "@/hooks/use-screen-state";

import type { SSEEvent, GroceryStore } from "@/types/sse";
import type { PCSVResult, RecipeSummary } from "@/types/tools";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePcsv = (override?: Partial<PCSVResult>): PCSVResult => ({
  protein: { status: "ok", items: ["chicken"] },
  carb: { status: "gap", items: [] },
  veggie: { status: "low", items: ["spinach"] },
  sauce: { status: "ok", items: ["soy sauce"] },
  ...override,
});

const makeRecipe = (id: string): RecipeSummary => ({
  id,
  name: `Recipe ${id}`,
  name_zh: `食谱 ${id}`,
  cuisine: "Chinese",
  cooking_method: "stir-fry",
  effort_level: "medium",
  flavor_tags: ["savory"],
  serves: 4,
  pcsv_roles: { protein: ["chicken"] },
  ingredients_have: ["chicken"],
  ingredients_need: ["soy sauce"],
});

// ---------------------------------------------------------------------------
// 1. Initial state
// ---------------------------------------------------------------------------

describe("useScreenState — initial state", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useScreenState());
    expect(result.current.state).toBe("idle");
  });

  it("starts with empty data", () => {
    const { result } = renderHook(() => useScreenState());
    const { data } = result.current;
    expect(data.pcsv).toBeNull();
    expect(data.recipes).toEqual([]);
    expect(data.groceryList).toEqual([]);
    expect(data.explanation).toBe("");
    expect(data.thinkingMessage).toBe("");
    expect(data.error).toBeNull();
    expect(data.completionStatus).toBeNull();
    expect(data.completionReason).toBeNull();
  });

  it("convenience booleans are all false in idle", () => {
    const { result } = renderHook(() => useScreenState());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("exposes dispatch function", () => {
    const { result } = renderHook(() => useScreenState());
    expect(typeof result.current.dispatch).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 2. State transitions — valid paths
// ---------------------------------------------------------------------------

describe("useScreenState — valid state transitions", () => {
  it("idle → loading on start_loading", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => {
      result.current.dispatch({ type: "start_loading" });
    });
    expect(result.current.state).toBe("loading");
  });

  it("loading → streaming on start_streaming", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => {
      result.current.dispatch({ type: "start_loading" });
    });
    act(() => {
      result.current.dispatch({ type: "start_streaming" });
    });
    expect(result.current.state).toBe("streaming");
  });

  it("streaming → complete on complete action with status complete", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() => result.current.dispatch({ type: "complete", status: "complete" }));
    expect(result.current.state).toBe("complete");
  });

  it("streaming → complete on complete action with status partial", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "complete",
        status: "partial",
        reason: "max_iterations",
      })
    );
    expect(result.current.state).toBe("complete");
  });

  it("streaming → error on error action", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "error", message: "LLM timeout" })
    );
    expect(result.current.state).toBe("error");
  });

  it("loading → error on error action", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() =>
      result.current.dispatch({ type: "error", message: "Connection refused" })
    );
    expect(result.current.state).toBe("error");
  });

  it("error → loading on start_loading (retry)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "error", message: "Timeout" }));
    act(() => result.current.dispatch({ type: "start_loading" }));
    expect(result.current.state).toBe("loading");
  });

  it("complete → loading on start_loading (new request)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    act(() => result.current.dispatch({ type: "start_loading" }));
    expect(result.current.state).toBe("loading");
  });

  it("any state → idle on reset", () => {
    const { result } = renderHook(() => useScreenState());
    // From loading
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "reset" }));
    expect(result.current.state).toBe("idle");
  });

  it("streaming state → idle on reset", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() => result.current.dispatch({ type: "reset" }));
    expect(result.current.state).toBe("idle");
  });

  it("complete state → idle on reset", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() => result.current.dispatch({ type: "complete", status: "complete" }));
    act(() => result.current.dispatch({ type: "reset" }));
    expect(result.current.state).toBe("idle");
  });

  it("error state → idle on reset", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "error", message: "Timeout" }));
    act(() => result.current.dispatch({ type: "reset" }));
    expect(result.current.state).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid transitions — must be ignored (no state change)
// ---------------------------------------------------------------------------

describe("useScreenState — invalid transitions (ignored)", () => {
  it("idle → streaming is ignored (stays idle)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_streaming" }));
    expect(result.current.state).toBe("idle");
  });

  it("idle → complete is ignored (stays idle)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.state).toBe("idle");
  });

  it("idle → error transitions to error (error from any state is allowed)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "error", message: "Unexpected" }));
    expect(result.current.state).toBe("error");
  });

  it("loading → complete is ignored (stays loading)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.state).toBe("loading");
  });

  it("complete → streaming is ignored (stays complete)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    act(() => result.current.dispatch({ type: "start_streaming" }));
    expect(result.current.state).toBe("complete");
  });

  it("error → streaming is ignored (stays error)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "error", message: "Bad" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    expect(result.current.state).toBe("error");
  });

  it("receive_event is ignored when not in streaming state (idle)", () => {
    const { result } = renderHook(() => useScreenState());
    const event: SSEEvent = { event_type: "thinking", message: "Thinking..." };
    act(() =>
      result.current.dispatch({ type: "receive_event", event })
    );
    expect(result.current.state).toBe("idle");
    expect(result.current.data.thinkingMessage).toBe("");
  });

  it("receive_event is ignored when in loading state", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    const event: SSEEvent = {
      event_type: "pcsv_update",
      pcsv: makePcsv(),
    };
    act(() => result.current.dispatch({ type: "receive_event", event }));
    expect(result.current.state).toBe("loading");
    expect(result.current.data.pcsv).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Data accumulation on receive_event (only in streaming state)
// ---------------------------------------------------------------------------

describe("useScreenState — data accumulation via receive_event", () => {
  function intoStreaming() {
    const hookResult = renderHook(() => useScreenState());
    act(() => hookResult.result.current.dispatch({ type: "start_loading" }));
    act(() => hookResult.result.current.dispatch({ type: "start_streaming" }));
    return hookResult;
  }

  it("thinking event updates thinkingMessage", () => {
    const { result } = intoStreaming();
    const event: SSEEvent = { event_type: "thinking", message: "Analyzing your ingredients..." };
    act(() => result.current.dispatch({ type: "receive_event", event }));
    expect(result.current.data.thinkingMessage).toBe("Analyzing your ingredients...");
  });

  it("second thinking event replaces previous thinkingMessage", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "thinking", message: "First message" },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "thinking", message: "Second message" },
      })
    );
    expect(result.current.data.thinkingMessage).toBe("Second message");
  });

  it("pcsv_update event replaces pcsv data", () => {
    const { result } = intoStreaming();
    const pcsv = makePcsv();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "pcsv_update", pcsv },
      })
    );
    expect(result.current.data.pcsv).toEqual(pcsv);
  });

  it("second pcsv_update replaces the first pcsv", () => {
    const { result } = intoStreaming();
    const first = makePcsv();
    const second = makePcsv({
      protein: { status: "gap", items: [] },
    });
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "pcsv_update", pcsv: first },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "pcsv_update", pcsv: second },
      })
    );
    expect(result.current.data.pcsv?.protein.status).toBe("gap");
  });

  it("recipe_card event appends to recipes array", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r001") },
      })
    );
    expect(result.current.data.recipes).toHaveLength(1);
    expect(result.current.data.recipes[0].id).toBe("r001");
  });

  it("multiple recipe_card events accumulate (append, not replace)", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r001") },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r002") },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r003") },
      })
    );
    expect(result.current.data.recipes).toHaveLength(3);
    expect(result.current.data.recipes.map((r) => r.id)).toEqual([
      "r001",
      "r002",
      "r003",
    ]);
  });

  it("explanation event replaces explanation text", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "explanation", text: "Here is why I chose these recipes." },
      })
    );
    expect(result.current.data.explanation).toBe(
      "Here is why I chose these recipes."
    );
  });

  it("second explanation event replaces the first", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "explanation", text: "First explanation" },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "explanation", text: "Updated explanation" },
      })
    );
    expect(result.current.data.explanation).toBe("Updated explanation");
  });

  it("grocery_list event replaces groceryList", () => {
    const { result } = intoStreaming();
    const stores = [{ store_name: "Costco", departments: [] }];
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "grocery_list", stores },
      })
    );
    expect(result.current.data.groceryList).toEqual(stores);
  });

  it("second grocery_list event replaces the first", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: {
          event_type: "grocery_list",
          stores: [{ store_name: "Costco", departments: [] }],
        },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: {
          event_type: "grocery_list",
          stores: [
            { store_name: "Community Market", departments: [] },
            { store_name: "Costco", departments: [] },
          ],
        },
      })
    );
    expect(result.current.data.groceryList).toHaveLength(2);
    expect(result.current.data.groceryList[0].store_name).toBe("Community Market");
  });

  it("error event with recoverable=false transitions to error state", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: {
          event_type: "error",
          message: "Fatal error",
          code: "LLM_ERROR",
          recoverable: false,
        },
      })
    );
    expect(result.current.state).toBe("error");
    expect(result.current.data.error).toBe("Fatal error");
  });

  it("error event with recoverable=true stays in streaming, sets error message", () => {
    const { result } = intoStreaming();
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: {
          event_type: "error",
          message: "Tool call failed, retrying...",
          code: "TOOL_ERROR",
          recoverable: true,
        },
      })
    );
    expect(result.current.state).toBe("streaming");
    expect(result.current.data.error).toBe("Tool call failed, retrying...");
  });

  it("recoverable error is cleared by next successful event", () => {
    const { result } = intoStreaming();
    // Receive a recoverable error
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: {
          event_type: "error",
          message: "Tool call failed, retrying...",
          code: "TOOL_ERROR",
          recoverable: true,
        },
      })
    );
    expect(result.current.data.error).toBe("Tool call failed, retrying...");
    // Next successful event should clear the error
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "thinking", message: "Retrying..." },
      })
    );
    expect(result.current.data.error).toBeNull();
    expect(result.current.state).toBe("streaming");
  });

  it("done event via receive_event is not processed (done uses complete action)", () => {
    const { result } = intoStreaming();
    // done events should only be dispatched as complete action by the SSE client
    // Dispatching a done event via receive_event should be a no-op
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "done", status: "complete", reason: null },
      })
    );
    // State stays streaming — done events don't auto-complete via receive_event
    expect(result.current.state).toBe("streaming");
    expect(result.current.data.completionStatus).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Reset returns to idle with empty data
// ---------------------------------------------------------------------------

describe("useScreenState — reset clears all data", () => {
  it("reset from streaming with accumulated data returns to empty idle", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "thinking", message: "Thinking..." },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "pcsv_update", pcsv: makePcsv() },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r001") },
      })
    );
    act(() => result.current.dispatch({ type: "reset" }));

    expect(result.current.state).toBe("idle");
    expect(result.current.data.thinkingMessage).toBe("");
    expect(result.current.data.pcsv).toBeNull();
    expect(result.current.data.recipes).toEqual([]);
    expect(result.current.data.explanation).toBe("");
    expect(result.current.data.groceryList).toEqual([]);
    expect(result.current.data.error).toBeNull();
    expect(result.current.data.completionStatus).toBeNull();
    expect(result.current.data.completionReason).toBeNull();
  });

  it("reset from error clears error message", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "error", message: "Timeout" }));
    act(() => result.current.dispatch({ type: "reset" }));
    expect(result.current.data.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Complete with partial status
// ---------------------------------------------------------------------------

describe("useScreenState — complete action with partial status", () => {
  it("sets completionStatus to partial", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "complete",
        status: "partial",
        reason: "max_iterations",
      })
    );
    expect(result.current.data.completionStatus).toBe("partial");
  });

  it("sets completionReason when provided", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "complete",
        status: "partial",
        reason: "max_iterations",
      })
    );
    expect(result.current.data.completionReason).toBe("max_iterations");
  });

  it("sets completionReason to null when not provided", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.data.completionReason).toBeNull();
  });

  it("sets completionStatus to complete for full completion", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.data.completionStatus).toBe("complete");
  });

  it("preserves accumulated data on completion", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r001") },
      })
    );
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.data.recipes).toHaveLength(1);
    expect(result.current.data.completionStatus).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// 7. Convenience booleans match state
// ---------------------------------------------------------------------------

describe("useScreenState — convenience booleans", () => {
  it("isLoading is true only in loading state", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("isStreaming is true only in streaming state", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("isComplete is true only in complete state", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it("isError is true only in error state", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() =>
      result.current.dispatch({ type: "error", message: "Timeout" })
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isError).toBe(true);
  });

  it("all false in idle state", () => {
    const { result } = renderHook(() => useScreenState());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Retry flow
// ---------------------------------------------------------------------------

describe("useScreenState — retry flow", () => {
  it("error → start_loading transitions to loading (retry works)", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({ type: "error", message: "LLM timeout" })
    );
    expect(result.current.state).toBe("error");

    act(() => result.current.dispatch({ type: "start_loading" }));
    expect(result.current.state).toBe("loading");
    expect(result.current.isLoading).toBe(true);
  });

  it("retry clears error message", () => {
    const { result } = renderHook(() => useScreenState());
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() =>
      result.current.dispatch({ type: "error", message: "LLM timeout" })
    );
    expect(result.current.data.error).toBe("LLM timeout");

    act(() => result.current.dispatch({ type: "start_loading" }));
    expect(result.current.data.error).toBeNull();
  });

  it("retry clears stale recipes and pcsv from previous run", () => {
    const { result } = renderHook(() => useScreenState());
    // First run accumulates data then errors
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r001") },
      })
    );
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "pcsv_update", pcsv: makePcsv() },
      })
    );
    act(() => result.current.dispatch({ type: "error", message: "Timeout" }));
    // Retry should clear all content data
    act(() => result.current.dispatch({ type: "start_loading" }));
    expect(result.current.data.recipes).toEqual([]);
    expect(result.current.data.pcsv).toBeNull();
    expect(result.current.data.explanation).toBe("");
    expect(result.current.data.groceryList).toEqual([]);
    expect(result.current.data.thinkingMessage).toBe("");
    expect(result.current.data.error).toBeNull();
  });

  it("full retry cycle: error → loading → streaming → complete", () => {
    const { result } = renderHook(() => useScreenState());
    // Initial request fails
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "error", message: "Timeout" }));
    // Retry
    act(() => result.current.dispatch({ type: "start_loading" }));
    act(() => result.current.dispatch({ type: "start_streaming" }));
    act(() =>
      result.current.dispatch({
        type: "receive_event",
        event: { event_type: "recipe_card", recipe: makeRecipe("r001") },
      })
    );
    act(() =>
      result.current.dispatch({ type: "complete", status: "complete" })
    );
    expect(result.current.state).toBe("complete");
    expect(result.current.data.recipes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 9. screenReducer — pure function tests (no React needed)
// ---------------------------------------------------------------------------

describe("screenReducer — pure function contract", () => {
  it("is exported and callable directly", () => {
    expect(typeof screenReducer).toBe("function");
  });

  it("returns same reference when no-op (invalid transition)", () => {
    const state = {
      state: "idle" as ScreenState,
      data: initialScreenData,
    };
    const next = screenReducer(state, { type: "start_streaming" });
    // State and data must be unchanged
    expect(next.state).toBe("idle");
    expect(next.data).toBe(state.data); // same reference for no-ops
  });

  it("start_loading from idle returns new state with loading", () => {
    const state = { state: "idle" as ScreenState, data: initialScreenData };
    const next = screenReducer(state, { type: "start_loading" });
    expect(next.state).toBe("loading");
  });

  it("error action sets data.error correctly", () => {
    const state = { state: "loading" as ScreenState, data: initialScreenData };
    const next = screenReducer(state, {
      type: "error",
      message: "Something went wrong",
    });
    expect(next.state).toBe("error");
    expect(next.data.error).toBe("Something went wrong");
  });

  it("error action from complete state is ignored (returns same reference)", () => {
    const state = { state: "complete" as ScreenState, data: initialScreenData };
    const next = screenReducer(state, { type: "error", message: "Too late" });
    expect(next.state).toBe("complete");
    expect(next).toBe(state);
  });

  it("error action from error state is ignored (returns same reference)", () => {
    const state = {
      state: "error" as ScreenState,
      data: { ...initialScreenData, error: "First error" },
    };
    const next = screenReducer(state, { type: "error", message: "Second error" });
    expect(next.state).toBe("error");
    expect(next).toBe(state);
  });

  it("start_loading from loading state is ignored (returns same reference)", () => {
    const state = { state: "loading" as ScreenState, data: initialScreenData };
    const next = screenReducer(state, { type: "start_loading" });
    expect(next.state).toBe("loading");
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// 10. set_grocery_list action (REST endpoint injection, outside SSE flow)
// ---------------------------------------------------------------------------

describe("screenReducer — set_grocery_list action", () => {
  const makeStore = (name: string): GroceryStore => ({
    store_name: name,
    departments: [
      {
        name: "Produce",
        items: [
          {
            id: `${name}-item-1`,
            name: "Broccoli",
            amount: "1 head",
            recipe_context: "Stir-fry",
            checked: false,
          },
        ],
      },
    ],
  });

  it("set_grocery_list populates groceryList from idle state", () => {
    const stores = [makeStore("Costco"), makeStore("T&T")];
    const state = { state: "idle" as ScreenState, data: { ...initialScreenData } };
    const next = screenReducer(state, { type: "set_grocery_list", stores });
    expect(next.state).toBe("idle");
    expect(next.data.groceryList).toEqual(stores);
  });

  it("set_grocery_list preserves other data fields", () => {
    const pcsv = makePcsv();
    const recipe = makeRecipe("r001");
    const existingData = {
      ...initialScreenData,
      pcsv,
      recipes: [recipe],
      explanation: "Here are your recipes.",
    };
    const state = { state: "streaming" as ScreenState, data: existingData };
    const stores = [makeStore("Costco")];
    const next = screenReducer(state, { type: "set_grocery_list", stores });
    expect(next.data.groceryList).toEqual(stores);
    expect(next.data.pcsv).toEqual(pcsv);
    expect(next.data.recipes).toEqual([recipe]);
    expect(next.data.explanation).toBe("Here are your recipes.");
  });

  it("set_grocery_list works from complete state", () => {
    // Simulate: SSE chat finished → user clicks "Build shopping list" → REST call returns
    const dataAfterChat = {
      ...initialScreenData,
      pcsv: makePcsv(),
      recipes: [makeRecipe("r001"), makeRecipe("r002")],
      explanation: "Here are your meals.",
      completionStatus: "complete" as const,
      completionReason: null,
    };
    const state = { state: "complete" as ScreenState, data: dataAfterChat };
    const stores = [makeStore("Costco"), makeStore("Community Market")];
    const next = screenReducer(state, { type: "set_grocery_list", stores });
    expect(next.state).toBe("complete");
    expect(next.data.groceryList).toEqual(stores);
    expect(next.data.pcsv).toEqual(dataAfterChat.pcsv);
    expect(next.data.recipes).toHaveLength(2);
    expect(next.data.completionStatus).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// 11. TypeScript type exports (compile-time verification)
// ---------------------------------------------------------------------------

describe("useScreenState — exported types are usable", () => {
  it("ScreenState type covers all 5 states", () => {
    const states: ScreenState[] = [
      "idle",
      "loading",
      "streaming",
      "complete",
      "error",
    ];
    expect(states).toHaveLength(5);
  });

  it("ScreenAction type covers all 7 actions", () => {
    const actions: ScreenAction[] = [
      { type: "start_loading" },
      { type: "start_streaming" },
      { type: "receive_event", event: { event_type: "thinking", message: "" } },
      { type: "complete", status: "complete" },
      { type: "error", message: "test" },
      { type: "reset" },
      { type: "set_grocery_list", stores: [] },
    ];
    expect(actions).toHaveLength(7);
  });

  it("ScreenData type has all 9 expected fields", () => {
    const data: ScreenData = {
      pcsv: null,
      recipes: [],
      groceryList: [],
      explanation: "",
      thinkingMessage: "",
      error: null,
      completionStatus: null,
      completionReason: null,
      clarifyTurn: null,
    };
    expect(Object.keys(data)).toHaveLength(9);
  });

  it("UseScreenStateReturn shape matches hook output", () => {
    const { result } = renderHook(() => useScreenState());
    const ret: UseScreenStateReturn = result.current;
    expect(typeof ret.state).toBe("string");
    expect(typeof ret.data).toBe("object");
    expect(typeof ret.dispatch).toBe("function");
    expect(typeof ret.isLoading).toBe("boolean");
    expect(typeof ret.isStreaming).toBe("boolean");
    expect(typeof ret.isComplete).toBe("boolean");
    expect(typeof ret.isError).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// 12. clarify_turn SSE event handling (Phase 2d)
// ---------------------------------------------------------------------------

describe("screenReducer — clarify_turn event", () => {
  it("test_session_reducer_clarify_turn_event: populates clarifyTurn and sets screenState to complete", () => {
    // Start in streaming state (receive_event only fires in streaming)
    const state = { state: "streaming" as ScreenState, data: { ...initialScreenData } };

    const event: SSEEvent = {
      event_type: "clarify_turn",
      explanation: "Let me ask a couple of quick questions before I proceed.",
      questions: [
        {
          id: "cooking_setup",
          text: "What's your cooking setup?",
          selection_mode: "single",
          options: [
            { label: "Full kitchen", is_exclusive: false },
            { label: "Hot plate only", is_exclusive: false },
          ],
        },
        {
          id: "dietary",
          text: "Any dietary restrictions?",
          selection_mode: "multi",
          options: [
            { label: "None", is_exclusive: true },
            { label: "Vegetarian", is_exclusive: false },
            { label: "Gluten-free", is_exclusive: false },
          ],
        },
      ],
    };

    const next = screenReducer(state, { type: "receive_event", event });

    // clarifyTurn should be populated with explanation and questions
    expect(next.data.clarifyTurn).not.toBeNull();
    expect(next.data.clarifyTurn?.explanation).toBe(
      "Let me ask a couple of quick questions before I proceed."
    );
    expect(next.data.clarifyTurn?.questions).toHaveLength(2);
    expect(next.data.clarifyTurn?.questions[0].id).toBe("cooking_setup");
    expect(next.data.clarifyTurn?.questions[0].selection_mode).toBe("single");
    expect(next.data.clarifyTurn?.questions[1].id).toBe("dietary");
    expect(next.data.clarifyTurn?.questions[1].selection_mode).toBe("multi");
    expect(next.data.clarifyTurn?.questions[1].options[0].is_exclusive).toBe(true);

    // screenState should be complete
    expect(next.state).toBe("complete");

    // Other screenData fields should be untouched (still at initial values)
    expect(next.data.pcsv).toBeNull();
    expect(next.data.recipes).toEqual([]);
    expect(next.data.explanation).toBe(
      "Let me ask a couple of quick questions before I proceed."
    );
    expect(next.data.error).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Bug2b: clarify_turn must copy explanation into screenData.explanation
  // (Option A fix: reducer-level copy so the render gate stays simple)
  // ---------------------------------------------------------------------------

  it("Bug2b: clarify_turn action exposes explanation text via screenData.explanation", () => {
    // When the backend sends clarify_turn with a non-empty explanation and
    // empty questions, the reducer must copy explanation → screenData.explanation
    // so the ClarifyScreen render gate `{explanation && ...}` evaluates to truthy.
    const state = { state: "streaming" as ScreenState, data: { ...initialScreenData } };

    const event: SSEEvent = {
      event_type: "clarify_turn",
      explanation: "Sounds great — balanced plan, let me find recipes.",
      questions: [],
    };

    const next = screenReducer(state, { type: "receive_event", event });

    // Option A requires the explanation to be promoted to screenData.explanation
    expect(next.data.explanation).toBe(
      "Sounds great — balanced plan, let me find recipes."
    );
    // clarifyTurn should also carry the explanation
    expect(next.data.clarifyTurn?.explanation).toBe(
      "Sounds great — balanced plan, let me find recipes."
    );
    // State transitions to complete
    expect(next.state).toBe("complete");
  });

  it("Bug2b: clarify_turn with non-empty questions also copies explanation into screenData.explanation", () => {
    // The copy must happen regardless of questions length.
    const state = { state: "streaming" as ScreenState, data: { ...initialScreenData } };

    const event: SSEEvent = {
      event_type: "clarify_turn",
      explanation: "I need a bit more info to suggest the best recipes.",
      questions: [
        {
          id: "cooking_setup",
          text: "What's your cooking setup?",
          selection_mode: "single",
          options: [{ label: "Full kitchen", is_exclusive: false }],
        },
      ],
    };

    const next = screenReducer(state, { type: "receive_event", event });

    expect(next.data.explanation).toBe(
      "I need a bit more info to suggest the best recipes."
    );
    expect(next.data.clarifyTurn?.questions).toHaveLength(1);
    expect(next.state).toBe("complete");
  });

  it("test_session_reducer_explanation_event_still_works: explanation handler is untouched, clarifyTurn stays null", () => {
    // Regression guard: ensure the explanation handler for non-Clarify screens is not broken
    const state = { state: "streaming" as ScreenState, data: { ...initialScreenData } };

    const event: SSEEvent = {
      event_type: "explanation",
      text: "Here are your recommended recipes.",
    };

    const next = screenReducer(state, { type: "receive_event", event });

    // explanation field should be populated
    expect(next.data.explanation).toBe("Here are your recommended recipes.");

    // clarifyTurn should remain null — untouched
    expect(next.data.clarifyTurn).toBeNull();

    // State stays streaming (explanation does not flip to complete)
    expect(next.state).toBe("streaming");
  });
});
