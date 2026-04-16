// Typed SSE event sequences for MSW behavioral testing (issue #89).
//
// Each export is an ordered array of SSEEvent values that represents a
// complete, realistic agent response flow. The MSW SSE helper will iterate
// these arrays and emit them as server-sent events on the `/chat` endpoint.
//
// Naming convention: SEQUENCE_<FLOW_DESCRIPTION>
//   e.g. SEQUENCE_THINKING_PCSV_RECIPE_DONE = thinking → pcsv → recipe_card → done

import type {
  SSEEvent,
  ThinkingEvent,
  PcsvUpdateEvent,
  RecipeCardEvent,
  ExplanationEvent,
  GroceryListEvent,
  ClarifyTurnEvent,
  ErrorEvent,
  DoneEvent,
} from "@/types/sse";
import type { PCSVResult } from "@/types/tools";
import { makeRecipeSummary, makePcsvUpdateEvent } from "./recipes";
import { STORES_RECIPES_SCREEN } from "./grocery";

// ---------------------------------------------------------------------------
// Reusable individual events
// ---------------------------------------------------------------------------

export const EVENT_THINKING_ANALYZING: ThinkingEvent = {
  event_type: "thinking",
  message: "Analyzing your ingredients...",
};

export const EVENT_THINKING_LOOKING_UP: ThinkingEvent = {
  event_type: "thinking",
  message: "Looking up recipes...",
};

export const EVENT_THINKING_BUILDING_LIST: ThinkingEvent = {
  event_type: "thinking",
  message: "Building your grocery list...",
};

export const EVENT_PCSV_GOOD: PcsvUpdateEvent = makePcsvUpdateEvent();

export const EVENT_PCSV_GAP: PcsvUpdateEvent = makePcsvUpdateEvent({
  pcsv: {
    protein: { status: "ok", items: ["chicken"] },
    carb: { status: "gap", items: [] },
    veggie: { status: "low", items: ["spinach"] },
    sauce: { status: "ok", items: ["soy sauce"] },
  } satisfies PCSVResult,
});

export const EVENT_RECIPE_CARD_SHRIMP: RecipeCardEvent = {
  event_type: "recipe_card",
  recipe: makeRecipeSummary(),
};

export const EVENT_RECIPE_CARD_TACOS: RecipeCardEvent = {
  event_type: "recipe_card",
  recipe: makeRecipeSummary({
    id: "r_tacos",
    name: "Chicken Tinga Tacos",
    name_zh: "雞肉墨西哥捲",
    cuisine: "Mexican",
    cooking_method: "Braise",
    effort_level: "medium",
    flavor_tags: ["Smoky", "Spicy"],
    ingredients: [
      { name: "chicken thigh", amount: "500g", pcsv: ["protein"] },
      { name: "tortillas", amount: "8", pcsv: ["carb"] },
      { name: "chipotle", amount: "1 can", pcsv: ["sauce"] },
      { name: "lime", amount: "2", pcsv: ["sauce"] },
    ],
    ingredients_have: ["chicken thigh", "tortillas"],
    ingredients_need: ["chipotle", "lime"],
  }),
};

export const EVENT_EXPLANATION_GENERAL: ExplanationEvent = {
  event_type: "explanation",
  text: "Here are some recipes based on your ingredients.",
};

export const EVENT_EXPLANATION_PCSV: ExplanationEvent = {
  event_type: "explanation",
  text: "Your meal plan looks balanced. You have protein and vegetables covered. Consider adding a carb.",
};

export const EVENT_GROCERY_LIST: GroceryListEvent = {
  event_type: "grocery_list",
  stores: STORES_RECIPES_SCREEN,
};

export const EVENT_CLARIFY_TURN: ClarifyTurnEvent = {
  event_type: "clarify_turn",
  explanation: "I need a bit more info to suggest the best recipes.",
  questions: [
    {
      id: "cooking_setup",
      text: "What's your cooking setup?",
      selection_mode: "single",
      options: [
        { label: "Stovetop", is_exclusive: false },
        { label: "Outdoor grill", is_exclusive: false },
      ],
    },
    {
      id: "dietary",
      text: "Any dietary restrictions?",
      selection_mode: "multi",
      options: [
        { label: "Vegetarian", is_exclusive: false },
        { label: "Gluten-free", is_exclusive: false },
        { label: "None", is_exclusive: true },
      ],
    },
  ],
};

export const EVENT_ERROR_GENERIC: ErrorEvent = {
  event_type: "error",
  message: "Something went wrong. Please try again.",
  code: null,
  recoverable: false,
};

export const EVENT_ERROR_LLM_TIMEOUT: ErrorEvent = {
  event_type: "error",
  message: "LLM timeout — please retry your request.",
  code: "llm_timeout",
  recoverable: true,
};

export const EVENT_DONE_COMPLETE: DoneEvent = {
  event_type: "done",
  status: "complete",
  reason: null,
  error_category: null,
};

export const EVENT_DONE_PARTIAL: DoneEvent = {
  event_type: "done",
  status: "partial",
  reason: "max_iterations",
  error_category: null,
};

// ---------------------------------------------------------------------------
// Named SSE sequences — feed these to the MSW SSE helper
// ---------------------------------------------------------------------------

/**
 * Happy path: agent thinks, emits PCSV update, emits a recipe card, done.
 * Covers the most common RecipesScreen flow.
 */
export const SEQUENCE_THINKING_PCSV_RECIPE_DONE: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_PCSV_GOOD,
  EVENT_RECIPE_CARD_SHRIMP,
  EVENT_DONE_COMPLETE,
];

/**
 * Multi-recipe flow: thinking → two recipe cards → done.
 * Used in tests that assert multiple cards render.
 */
export const SEQUENCE_THINKING_TWO_RECIPES_DONE: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_RECIPE_CARD_SHRIMP,
  EVENT_RECIPE_CARD_TACOS,
  EVENT_DONE_COMPLETE,
];

/**
 * Explanation flow: thinking → explanation text → done.
 * Used in HomeScreen / clarify flow tests.
 */
export const SEQUENCE_THINKING_EXPLANATION_DONE: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_EXPLANATION_GENERAL,
  EVENT_DONE_COMPLETE,
];

/**
 * Clarify flow: thinking → clarify_turn question set → done.
 * The real SSE client requires a `done` event to close cleanly —
 * without it, `consumeSseStream` fires `onError("Connection closed unexpectedly")`.
 */
export const SEQUENCE_THINKING_CLARIFY: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_CLARIFY_TURN,
  EVENT_DONE_COMPLETE,
];

/**
 * Error flow: thinking → error event.
 * Used in error state tests across RecipesScreen, GroceryScreen, ClarifyScreen.
 */
export const SEQUENCE_THINKING_ERROR: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_ERROR_GENERIC,
];

/**
 * Grocery list flow: thinking → grocery_list event → done.
 * Used in GroceryScreen tests.
 */
export const SEQUENCE_THINKING_GROCERY_LIST_DONE: SSEEvent[] = [
  EVENT_THINKING_BUILDING_LIST,
  EVENT_GROCERY_LIST,
  EVENT_DONE_COMPLETE,
];

/**
 * Partial completion: thinking → recipe card → partial done.
 * Used in partial-banner regression tests.
 */
export const SEQUENCE_THINKING_RECIPE_PARTIAL: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_RECIPE_CARD_SHRIMP,
  EVENT_DONE_PARTIAL,
];

/**
 * PCSV gap flow: thinking → PCSV with gap → explanation → done.
 * Used in tests that verify PCSV analysis rendering.
 */
export const SEQUENCE_THINKING_PCSV_GAP_EXPLANATION_DONE: SSEEvent[] = [
  EVENT_THINKING_ANALYZING,
  EVENT_PCSV_GAP,
  EVENT_EXPLANATION_PCSV,
  EVENT_DONE_COMPLETE,
];

/**
 * Immediate done with no preceding events (edge case).
 * Verifies the state machine handles an agent that returns nothing.
 */
export const SEQUENCE_DONE_ONLY: SSEEvent[] = [EVENT_DONE_COMPLETE];
