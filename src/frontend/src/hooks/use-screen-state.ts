// useScreenState — screen-level state machine hook
// Manages the IDLE → LOADING → STREAMING → COMPLETE / ERROR lifecycle
// for the Smart Grocery Assistant chat flow.
//
// State machine:
//   idle → loading (start_loading)
//   idle → error (error — unexpected/network error before request starts)
//   loading → streaming (start_streaming)
//   streaming → streaming (receive_event — accumulates data)
//   streaming → complete (complete)
//   streaming → error (error)
//   loading → error (error)
//   error → loading (start_loading — retry)
//   complete → loading (start_loading — new request)
//   any → idle (reset)

import { useReducer } from "react";
import type { Dispatch } from "react";

import type { SSEEvent, GroceryStore, ClarifyQuestion } from "@/types/sse";
import type { PCSVResult, RecipeSummary } from "@/types/tools";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScreenState = "idle" | "loading" | "streaming" | "complete" | "error";

export type ScreenAction =
  | { type: "start_loading" }
  | { type: "start_streaming" }
  | { type: "receive_event"; event: SSEEvent }
  | { type: "complete"; status: "complete" | "partial"; reason?: string | null }
  | { type: "error"; message: string }
  | { type: "reset" }
  | { type: "set_grocery_list"; stores: GroceryStore[] };

export type ScreenData = {
  pcsv: PCSVResult | null;
  recipes: RecipeSummary[];
  groceryList: GroceryStore[];
  explanation: string;
  thinkingMessage: string;
  error: string | null;
  completionStatus: "complete" | "partial" | null;
  completionReason: string | null;
  clarifyTurn: { explanation: string; questions: ClarifyQuestion[] } | null;
};

export type UseScreenStateReturn = {
  state: ScreenState;
  data: ScreenData;
  dispatch: Dispatch<ScreenAction>;
  isLoading: boolean;
  isStreaming: boolean;
  isComplete: boolean;
  isError: boolean;
};

// ---------------------------------------------------------------------------
// Internal combined state for useReducer
// ---------------------------------------------------------------------------

type ReducerState = {
  state: ScreenState;
  data: ScreenData;
};

// ---------------------------------------------------------------------------
// Initial data (exported so tests can reference it as the "empty" sentinel)
// ---------------------------------------------------------------------------

export const initialScreenData: ScreenData = {
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

const initialReducerState: ReducerState = {
  state: "idle",
  data: initialScreenData,
};

// ---------------------------------------------------------------------------
// Reducer — pure function (exported for direct unit testing)
// ---------------------------------------------------------------------------

export function screenReducer(
  current: ReducerState,
  action: ScreenAction
): ReducerState {
  const { state, data } = current;

  switch (action.type) {
    // -----------------------------------------------------------------------
    // reset — any → idle (always allowed)
    // -----------------------------------------------------------------------
    case "reset":
      return { state: "idle", data: { ...initialScreenData } };

    // -----------------------------------------------------------------------
    // set_grocery_list — any → same state, injects grocery REST result
    // Accepted from any state: the grocery endpoint call happens outside
    // the SSE state machine (user clicks "Build shopping list" post-chat).
    // -----------------------------------------------------------------------
    case "set_grocery_list":
      return {
        state,
        data: { ...data, groceryList: action.stores },
      };

    // -----------------------------------------------------------------------
    // error — transitions to error from loading or streaming;
    //         also accepted from idle (unexpected errors)
    // -----------------------------------------------------------------------
    case "error": {
      if (state === "loading" || state === "streaming" || state === "idle") {
        return {
          state: "error",
          data: { ...data, error: action.message },
        };
      }
      // error from complete or error states: ignore
      return current;
    }

    // -----------------------------------------------------------------------
    // start_loading — valid from idle, error, complete
    // -----------------------------------------------------------------------
    case "start_loading": {
      if (state === "idle" || state === "error" || state === "complete") {
        return {
          state: "loading",
          data: { ...initialScreenData },
        };
      }
      return current;
    }

    // -----------------------------------------------------------------------
    // start_streaming — valid only from loading
    // -----------------------------------------------------------------------
    case "start_streaming": {
      if (state === "loading") {
        return { state: "streaming", data };
      }
      return current;
    }

    // -----------------------------------------------------------------------
    // complete — valid only from streaming
    // -----------------------------------------------------------------------
    case "complete": {
      if (state === "streaming") {
        return {
          state: "complete",
          data: {
            ...data,
            completionStatus: action.status,
            completionReason: action.reason ?? null,
          },
        };
      }
      return current;
    }

    // -----------------------------------------------------------------------
    // receive_event — only processed in streaming state
    // -----------------------------------------------------------------------
    case "receive_event": {
      if (state !== "streaming") {
        return current;
      }
      return applySSEEvent(current, action.event);
    }

    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// SSE event → data accumulation (pure helper, called only in streaming state)
// ---------------------------------------------------------------------------

function applySSEEvent(current: ReducerState, event: SSEEvent): ReducerState {
  const { state, data } = current;

  switch (event.event_type) {
    case "thinking":
      return {
        state,
        data: { ...data, thinkingMessage: event.message, error: null },
      };

    case "pcsv_update":
      return {
        state,
        data: { ...data, pcsv: event.pcsv, error: null },
      };

    case "recipe_card":
      return {
        state,
        data: { ...data, recipes: [...data.recipes, event.recipe], error: null },
      };

    case "explanation":
      return {
        state,
        data: { ...data, explanation: event.text, error: null },
      };

    case "clarify_turn":
      return {
        state: "complete",
        data: {
          ...data,
          clarifyTurn: {
            explanation: event.explanation,
            questions: event.questions,
          },
          error: null,
        },
      };

    case "grocery_list":
      return {
        state,
        data: { ...data, groceryList: event.stores, error: null },
      };

    case "error": {
      // Recoverable errors: stay in streaming, surface message
      // Non-recoverable errors: transition to error state
      if (event.recoverable) {
        return {
          state: "streaming",
          data: { ...data, error: event.message },
        };
      }
      return {
        state: "error",
        data: { ...data, error: event.message },
      };
    }

    case "done":
      // done events arrive via receive_event but are handled by the SSE client
      // which dispatches a `complete` action instead. Receiving a `done` event
      // here is a no-op — state stays streaming.
      return current;

    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScreenState(): UseScreenStateReturn {
  const [reducerState, dispatch] = useReducer(
    screenReducer,
    initialReducerState
  );

  const { state, data } = reducerState;

  return {
    state,
    data,
    dispatch,
    isLoading: state === "loading",
    isStreaming: state === "streaming",
    isComplete: state === "complete",
    isError: state === "error",
  };
}
