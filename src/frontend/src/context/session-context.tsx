// SessionContext — session-level state provider for SGA V2 frontend
//
// Wraps useScreenState and adds:
//   - sessionId (null until backend assigns one)
//   - conversationHistory (ordered list of user/assistant turns)
//   - currentScreen (current navigation screen literal)
//
// Actions:
//   - sendMessage(text)      — add user turn, dispatch start_loading, call chatService
//   - navigateToScreen(s)    — update currentScreen only (screen component decides reset)
//   - resetSession()         — clear history, cancel in-flight request, reset to idle/home
//   - dispatch               — direct access to the screen state machine for advanced use

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, ReactNode } from "react";

import {
  useScreenState,
} from "@/hooks/use-screen-state";
import type { ScreenAction, ScreenData, ScreenState } from "@/hooks/use-screen-state";

import type { SSEEvent } from "@/types/sse";
import type { ConversationTurn, Screen } from "@/types/api";

// ---------------------------------------------------------------------------
// ChatService interface
// ---------------------------------------------------------------------------

export type ChatServiceHandler = (
  message: string,
  screen: Screen,
  onEvent: (event: SSEEvent) => void,
  onDone: (status: "complete" | "partial", reason: string | null) => void,
  onError: (message: string) => void
) => { cancel: () => void };

// ---------------------------------------------------------------------------
// Default no-op chatService
// ---------------------------------------------------------------------------

const noopChatService: ChatServiceHandler = () => ({ cancel: () => {} });

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

type SessionContextValue = {
  // From useScreenState (pass-through)
  screenState: ScreenState;
  screenData: ScreenData;
  isLoading: boolean;
  isStreaming: boolean;
  isComplete: boolean;
  isError: boolean;

  // Session-level state
  sessionId: string | null;
  conversationHistory: ConversationTurn[];
  currentScreen: Screen;

  // Actions
  sendMessage: (message: string) => void;
  navigateToScreen: (screen: Screen) => void;
  resetSession: () => void;
  addLocalTurn: (turn: ConversationTurn) => void;
  dispatch: Dispatch<ScreenAction>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SessionContext = createContext<SessionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider props
// ---------------------------------------------------------------------------

interface SessionProviderProps {
  children: ReactNode;
  chatService?: ChatServiceHandler;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionProvider({
  children,
  chatService = noopChatService,
}: SessionProviderProps) {
  const { state, data, dispatch, isLoading, isStreaming, isComplete, isError } =
    useScreenState();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationTurn[]
  >([]);
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");

  // Refs for values that should be readable inside stable callbacks without
  // causing those callbacks to be re-created on every render.
  const stateRef = useRef<ScreenState>(state);
  stateRef.current = state;

  const currentScreenRef = useRef<Screen>(currentScreen);
  currentScreenRef.current = currentScreen;

  const chatServiceRef = useRef<ChatServiceHandler>(chatService);
  chatServiceRef.current = chatService;

  // Store the cancel function from the last chatService call
  const cancelRef = useRef<(() => void) | null>(null);

  // H2: Cancel stale SSE events when chatService changes (scenario switch).
  // Old setTimeout chains from the previous mock SSE service would otherwise
  // fire callbacks into the new scenario's state.
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
        cancelRef.current = null;
      }
    };
  }, [chatService]);

  // --------------------------------------------------------------------------
  // sendMessage
  // --------------------------------------------------------------------------

  const sendMessage = useCallback(
    (text: string) => {
      // Guard: ignore empty messages
      if (!text.trim()) return;

      // Guard: idempotent — ignore while loading or streaming
      if (stateRef.current === "loading" || stateRef.current === "streaming") {
        return;
      }

      // 1. Dispatch start_loading to the state machine
      dispatch({ type: "start_loading" });

      // 2. Add user turn to history
      const userTurn: ConversationTurn = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setConversationHistory((prev) => [...prev, userTurn]);

      // 3. Track whether streaming has been started for this request
      let streamingStarted = false;

      // 4. Call chatService (via ref so this callback stays stable)
      const { cancel } = chatServiceRef.current(
        text,
        currentScreenRef.current,
        // onEvent
        (event: SSEEvent) => {
          if (!streamingStarted) {
            streamingStarted = true;
            dispatch({ type: "start_streaming" });
          }
          dispatch({ type: "receive_event", event });
        },
        // onDone
        (status: "complete" | "partial", reason: string | null) => {
          // Ensure we enter streaming before completing, otherwise
          // the complete action is silently dropped by the reducer.
          if (!streamingStarted) {
            streamingStarted = true;
            dispatch({ type: "start_streaming" });
          }
          dispatch({ type: "complete", status, reason: reason ?? undefined });

          // Add assistant turn to history
          // TODO(Stage 4): Populate assistant content from screenData summary.
          // Content lives in screenData (pcsv, recipes, etc.), not as a flat string.
          // At Stage 4, serialize a summary for backend context injection.
          const assistantTurn: ConversationTurn = {
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
          };
          setConversationHistory((prev) => [...prev, assistantTurn]);
        },
        // onError
        (errorMessage: string) => {
          dispatch({ type: "error", message: errorMessage });
        }
      );

      cancelRef.current = cancel;
    },
    [dispatch] // stable — chatService and currentScreen are read via refs
  );

  // --------------------------------------------------------------------------
  // addLocalTurn
  // --------------------------------------------------------------------------

  const addLocalTurn = useCallback((turn: ConversationTurn) => {
    setConversationHistory((prev) => [...prev, turn]);
  }, []);

  // --------------------------------------------------------------------------
  // navigateToScreen
  // --------------------------------------------------------------------------

  const navigateToScreen = useCallback((screen: Screen) => {
    setCurrentScreen(screen);
  }, []);

  // --------------------------------------------------------------------------
  // resetSession
  // --------------------------------------------------------------------------

  const resetSession = useCallback(() => {
    // Cancel any in-flight request
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }

    // Clear session state
    setSessionId(null);
    setConversationHistory([]);
    setCurrentScreen("home");

    // Reset screen state machine to idle
    dispatch({ type: "reset" });
  }, [dispatch]);

  // --------------------------------------------------------------------------
  // Context value
  // --------------------------------------------------------------------------

  const value = useMemo<SessionContextValue>(
    () => ({
      screenState: state,
      screenData: data,
      isLoading,
      isStreaming,
      isComplete,
      isError,

      sessionId,
      conversationHistory,
      currentScreen,

      sendMessage,
      navigateToScreen,
      resetSession,
      addLocalTurn,
      dispatch,
    }),
    [
      state, data, isLoading, isStreaming, isComplete, isError,
      sessionId, conversationHistory, currentScreen,
      sendMessage, navigateToScreen, resetSession, addLocalTurn, dispatch,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Optional hook — returns null when used outside SessionProvider.
// Use this in screen components that must also work in test environments
// where SessionProvider is not in the wrapper (e.g. legacy screens.test.tsx).
// ---------------------------------------------------------------------------

export function useSessionOptional(): SessionContextValue | null {
  return useContext(SessionContext);
}
