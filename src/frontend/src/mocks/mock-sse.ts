// MockSSEService — emits realistic SSEEvent sequences with configurable delays.
//
// Design:
//   - createMockSSEService(scenarioData, options) returns a ChatServiceHandler
//   - When delayMs=0, all events fire synchronously (in-order, no timers)
//   - When delayMs>0, events are scheduled via setTimeout chains
//   - cancel() clears all pending timeouts and prevents any future callbacks

import type { SSEEvent } from "@/types/sse";
import type { RecipeSummary, EffortLevel } from "@/types/tools";
import type { Screen } from "@/types/api";
import type { ScenarioData } from "@/mocks/scenarios";
import type { ChatServiceHandler } from "@/context/session-context";
import type { RecipeCardData, SwapAlternative } from "@/mocks/bbq-weekend";

// ---------------------------------------------------------------------------
// Default delay constants (ms) — scaled by delayMs multiplier
// ---------------------------------------------------------------------------

const THINKING_DELAY = 500;
const EVENT_DELAY = 200;

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

function parseEffortLevel(timeStr: string): EffortLevel {
  const lower = timeStr.toLowerCase();
  // Parse minute count from strings like "10 min", "25 min", "30 min"
  const match = lower.match(/(\d+)/);
  if (match) {
    const minutes = parseInt(match[1], 10);
    if (minutes <= 15) return "quick";
    if (minutes <= 25) return "medium";
    return "long";
  }
  return "medium";
}

function recipeCardDataToSummary(
  card: RecipeCardData,
  index: number
): RecipeSummary {
  return {
    id: `mock-r-${index}`,
    name: card.name,
    name_zh: card.nameCjk,
    cuisine: card.flavorProfile,
    cooking_method: card.cookingMethod,
    effort_level: parseEffortLevel(card.time),
    flavor_tags: card.infoFlavorTags,
    serves: 4,
    pcsv_roles: {},
    ingredients_have: card.ingredients.filter((i) => i.have).map((i) => i.name),
    ingredients_need: card.ingredients.filter((i) => !i.have).map((i) => i.name),
  };
}

function swapAlternativeToSummary(
  alt: SwapAlternative,
  index: number
): RecipeSummary {
  return {
    id: `mock-swap-${index}`,
    name: alt.name,
    name_zh: alt.nameCjk,
    cuisine: "",
    cooking_method: "",
    effort_level: "quick",
    flavor_tags: [],
    serves: 4,
    pcsv_roles: {},
    ingredients_have: [],
    ingredients_need: [],
  };
}

// ---------------------------------------------------------------------------
// Event builder helpers (return typed SSEEvent)
// ---------------------------------------------------------------------------

function makeThinking(message: string): SSEEvent {
  return { event_type: "thinking", message };
}

function makePcsvUpdate(scenarioData: ScenarioData): SSEEvent {
  return { event_type: "pcsv_update", pcsv: scenarioData.clarify.pcsv };
}

function makeExplanation(text: string): SSEEvent {
  return { event_type: "explanation", text };
}

function makeRecipeCard(recipe: RecipeSummary): SSEEvent {
  return { event_type: "recipe_card", recipe };
}

function makeError(message: string): SSEEvent {
  return {
    event_type: "error",
    message,
    code: "MOCK_ERROR",
    recoverable: false,
  };
}

// ---------------------------------------------------------------------------
// Emission engine
// ---------------------------------------------------------------------------

type EmissionStep =
  | { kind: "event"; event: SSEEvent; delayFromPrev: number }
  | { kind: "done"; status: "complete" | "partial"; reason: string | null; delayFromPrev: number }
  | { kind: "error"; message: string; delayFromPrev: number };

function buildClarifySteps(scenarioData: ScenarioData): EmissionStep[] {
  return [
    {
      kind: "event",
      event: makeThinking("Analyzing your ingredients..."),
      delayFromPrev: THINKING_DELAY,
    },
    {
      kind: "event",
      event: makeThinking("Checking what you have..."),
      delayFromPrev: THINKING_DELAY,
    },
    {
      kind: "event",
      event: makePcsvUpdate(scenarioData),
      delayFromPrev: EVENT_DELAY,
    },
    {
      kind: "event",
      event: makeExplanation(scenarioData.clarify.deckText),
      delayFromPrev: EVENT_DELAY,
    },
    { kind: "done", status: "complete", reason: null, delayFromPrev: EVENT_DELAY },
  ];
}

function buildRecipesSteps(scenarioData: ScenarioData): EmissionStep[] {
  const steps: EmissionStep[] = [
    {
      kind: "event",
      event: makeThinking("Searching for recipes..."),
      delayFromPrev: THINKING_DELAY,
    },
    {
      kind: "event",
      event: makeThinking("Building your meal plan..."),
      delayFromPrev: THINKING_DELAY,
    },
  ];

  scenarioData.recipes.forEach((recipe, i) => {
    steps.push({
      kind: "event",
      event: makeRecipeCard(recipeCardDataToSummary(recipe, i)),
      delayFromPrev: EVENT_DELAY,
    });
  });

  steps.push({
    kind: "event",
    event: makeExplanation(scenarioData.recipesHeader.description),
    delayFromPrev: EVENT_DELAY,
  });

  steps.push({ kind: "done", status: "complete", reason: null, delayFromPrev: EVENT_DELAY });

  return steps;
}

function buildSwapSteps(scenarioData: ScenarioData): EmissionStep[] {
  const steps: EmissionStep[] = [
    {
      kind: "event",
      event: makeThinking("Finding alternatives..."),
      delayFromPrev: THINKING_DELAY,
    },
  ];

  scenarioData.swapAlternatives.forEach((alt, i) => {
    steps.push({
      kind: "event",
      event: makeRecipeCard(swapAlternativeToSummary(alt, i)),
      delayFromPrev: EVENT_DELAY,
    });
  });

  steps.push({ kind: "done", status: "complete", reason: null, delayFromPrev: EVENT_DELAY });

  return steps;
}

function buildErrorSteps(): EmissionStep[] {
  const errorMessage = "Something went wrong. Please try again.";
  return [
    {
      kind: "event",
      event: makeThinking("Processing..."),
      delayFromPrev: THINKING_DELAY,
    },
    {
      kind: "error",
      message: errorMessage,
      delayFromPrev: EVENT_DELAY,
    },
  ];
}

function buildImmediateDoneSteps(): EmissionStep[] {
  return [{ kind: "done", status: "complete", reason: null, delayFromPrev: 0 }];
}

// ---------------------------------------------------------------------------
// Step resolution — determine which steps to build based on message + screen
// ---------------------------------------------------------------------------

function resolveSteps(
  message: string,
  screen: Screen,
  scenarioData: ScenarioData
): EmissionStep[] {
  // Error scenario takes priority
  if (/error/i.test(message)) {
    return buildErrorSteps();
  }

  // Swap request on recipes screen
  if (screen === "recipes" && /try another/i.test(message)) {
    return buildSwapSteps(scenarioData);
  }

  switch (screen) {
    case "clarify":
      return buildClarifySteps(scenarioData);
    case "recipes":
      return buildRecipesSteps(scenarioData);
    case "grocery":
    case "home":
    case "saved_meal_plan":
    case "saved_recipe":
      return buildImmediateDoneSteps();
    default: {
      // Exhaustive check — TypeScript will error if Screen union grows
      screen satisfies never;
      return buildImmediateDoneSteps();
    }
  }
}

// ---------------------------------------------------------------------------
// Emission runner — dispatches steps synchronously (delayMs=0) or via timers
// ---------------------------------------------------------------------------

function runSteps(
  steps: EmissionStep[],
  delayMs: number,
  onEvent: (event: SSEEvent) => void,
  onDone: (status: "complete" | "partial", reason: string | null) => void,
  onError: (message: string) => void
): { cancel: () => void } {
  let cancelled = false;
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  if (delayMs === 0) {
    // Synchronous path — emit all steps immediately in order
    for (const step of steps) {
      if (step.kind === "event") {
        onEvent(step.event);
      } else if (step.kind === "done") {
        onDone(step.status, step.reason);
      } else if (step.kind === "error") {
        // Dual emission by design: onEvent carries the typed ErrorEvent for the
        // state machine reducer; onError is the out-of-band signal for the
        // session context to dispatch { type: "error" } directly.
        onEvent(makeError(step.message));
        onError(step.message);
      }
    }
    return { cancel: () => {} };
  }

  // Async path — chain via setTimeout
  let cumulativeDelay = 0;

  for (const step of steps) {
    cumulativeDelay += step.delayFromPrev * delayMs;
    const delay = cumulativeDelay;

    const t = setTimeout(() => {
      if (cancelled) return;

      if (step.kind === "event") {
        onEvent(step.event);
      } else if (step.kind === "done") {
        onDone(step.status, step.reason);
      } else if (step.kind === "error") {
        onEvent(makeError(step.message));
        onError(step.message);
      }
    }, delay);

    timeouts.push(t);
  }

  return {
    cancel: () => {
      cancelled = true;
      timeouts.forEach((t) => clearTimeout(t));
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a mock SSE service that emits typed event sequences from scenario data.
 *
 * @param scenarioData - The scenario to source events from (bbq or chicken)
 * @param options.delayMs - Delay multiplier. 0 = synchronous (tests), 1 = real delays
 *   (thinking: 500ms, events: 200ms). Values like 0.5 halve all delays.
 */
export function createMockSSEService(
  scenarioData: ScenarioData,
  options?: { delayMs?: number }
): ChatServiceHandler {
  const delayMs = options?.delayMs ?? 1;

  return (
    message: string,
    screen: Screen,
    onEvent: (event: SSEEvent) => void,
    onDone: (status: "complete" | "partial", reason: string | null) => void,
    onError: (message: string) => void
  ) => {
    const steps = resolveSteps(message, screen, scenarioData);
    return runSteps(steps, delayMs, onEvent, onDone, onError);
  };
}
