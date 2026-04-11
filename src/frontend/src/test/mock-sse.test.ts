// Tests for MockSSEService — written FIRST per TDD methodology (RED phase)
//
// All tests use delayMs=0 (synchronous emission) unless testing cancel behavior.
// Cancel tests use vi.useFakeTimers() to control setTimeout.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSSEService } from "@/mocks/mock-sse";
import { bbqWeekend } from "@/mocks/bbq-weekend";
import { weeknightChicken } from "@/mocks/weeknight-chicken";
import type { SSEEvent } from "@/types/sse";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectEvents(
  scenarioData: typeof bbqWeekend,
  screen: Parameters<ReturnType<typeof createMockSSEService>>[1],
  message = "test message",
  delayMs = 0
): {
  events: SSEEvent[];
  doneStatus: { status: "complete" | "partial"; reason: string | null } | null;
  errorMessage: string | null;
  cancel: () => void;
} {
  const events: SSEEvent[] = [];
  let doneStatus: { status: "complete" | "partial"; reason: string | null } | null = null;
  let errorMessage: string | null = null;

  const handler = createMockSSEService(scenarioData, { delayMs });
  const { cancel } = handler(
    message,
    screen,
    (event) => events.push(event),
    (status, reason) => { doneStatus = { status, reason }; },
    (msg) => { errorMessage = msg; }
  );

  return { events, doneStatus, errorMessage, cancel };
}

// ---------------------------------------------------------------------------
// 1. Factory function type check
// ---------------------------------------------------------------------------

describe("createMockSSEService — factory", () => {
  it("returns a ChatServiceHandler (function)", () => {
    const handler = createMockSSEService(bbqWeekend);
    expect(typeof handler).toBe("function");
  });

  it("calling handler returns an object with a cancel function", () => {
    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    const result = handler(
      "hello",
      "home",
      () => {},
      () => {},
      () => {}
    );
    expect(typeof result).toBe("object");
    expect(typeof result.cancel).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 2. Clarify screen — event sequence
// ---------------------------------------------------------------------------

describe("createMockSSEService — clarify screen", () => {
  it("emits exact event types in correct order", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    const types = events.map((e) => e.event_type);
    expect(types).toEqual(["thinking", "thinking", "pcsv_update", "explanation"]);
  });

  it("first event is thinking with ingredient analysis message", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    expect(events[0].event_type).toBe("thinking");
    if (events[0].event_type === "thinking") {
      expect(events[0].message.length).toBeGreaterThan(0);
    }
  });

  it("second event is thinking with checking message", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    expect(events[1].event_type).toBe("thinking");
  });

  it("pcsv_update event contains correct pcsv data matching scenario", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    const pcsvEvent = events.find((e) => e.event_type === "pcsv_update");
    expect(pcsvEvent).toBeDefined();
    if (pcsvEvent?.event_type === "pcsv_update") {
      expect(pcsvEvent.pcsv).toEqual(bbqWeekend.clarify.pcsv);
    }
  });

  it("explanation event contains scenario deckText", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    const explanationEvent = events.find((e) => e.event_type === "explanation");
    expect(explanationEvent).toBeDefined();
    if (explanationEvent?.event_type === "explanation") {
      expect(explanationEvent.text).toBe(bbqWeekend.clarify.deckText);
    }
  });

  it("onDone is called with status='complete' and reason=null", () => {
    const { doneStatus } = collectEvents(bbqWeekend, "clarify");
    expect(doneStatus).not.toBeNull();
    expect(doneStatus?.status).toBe("complete");
    expect(doneStatus?.reason).toBeNull();
  });

  it("onError is NOT called for normal clarify request", () => {
    const { errorMessage } = collectEvents(bbqWeekend, "clarify");
    expect(errorMessage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Recipes screen — event sequence
// ---------------------------------------------------------------------------

describe("createMockSSEService — recipes screen", () => {
  it("emits thinking, thinking, recipe_card x3, explanation in order for bbq scenario", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const types = events.map((e) => e.event_type);
    expect(types).toEqual([
      "thinking",
      "thinking",
      "recipe_card",
      "recipe_card",
      "recipe_card",
      "explanation",
    ]);
  });

  it("emits the correct number of recipe_card events (matches scenario recipes length)", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    expect(recipeCards).toHaveLength(bbqWeekend.recipes.length);
  });

  it("first two events are always thinking type", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    expect(events[0].event_type).toBe("thinking");
    expect(events[1].event_type).toBe("thinking");
  });

  it("last event before done is explanation", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const last = events[events.length - 1];
    expect(last.event_type).toBe("explanation");
  });

  it("explanation event text matches scenario recipesHeader description", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const explanationEvent = events.find((e) => e.event_type === "explanation");
    if (explanationEvent?.event_type === "explanation") {
      expect(explanationEvent.text).toBe(bbqWeekend.recipesHeader.description);
    }
  });

  it("onDone called with status='complete'", () => {
    const { doneStatus } = collectEvents(bbqWeekend, "recipes");
    expect(doneStatus?.status).toBe("complete");
    expect(doneStatus?.reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Recipe card shape validation
// ---------------------------------------------------------------------------

describe("createMockSSEService — recipe card RecipeSummary shape", () => {
  it("recipe card has required id field (mock-r-{index})", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card, i) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.id).toBe(`mock-r-${i}`);
      }
    });
  });

  it("recipe card has name matching scenario recipe name", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card, i) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.name).toBe(bbqWeekend.recipes[i].name);
      }
    });
  });

  it("recipe card has name_zh mapped from scenario nameCjk", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card, i) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.name_zh).toBe(bbqWeekend.recipes[i].nameCjk);
      }
    });
  });

  it("recipe card has cuisine mapped from flavorProfile", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card, i) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.cuisine).toBe(bbqWeekend.recipes[i].flavorProfile);
      }
    });
  });

  it("recipe card has cooking_method mapped from scenario cookingMethod", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card, i) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.cooking_method).toBe(bbqWeekend.recipes[i].cookingMethod);
      }
    });
  });

  it("recipe card has ingredients_have (items where have=true)", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const firstCard = events.find((e) => e.event_type === "recipe_card");
    if (firstCard?.event_type === "recipe_card") {
      const expectedHave = bbqWeekend.recipes[0].ingredients
        .filter((i) => i.have)
        .map((i) => i.name);
      expect(firstCard.recipe.ingredients_have).toEqual(expectedHave);
    }
  });

  it("recipe card has ingredients_need (items where have=false)", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const firstCard = events.find((e) => e.event_type === "recipe_card");
    if (firstCard?.event_type === "recipe_card") {
      const expectedNeed = bbqWeekend.recipes[0].ingredients
        .filter((i) => !i.have)
        .map((i) => i.name);
      expect(firstCard.recipe.ingredients_need).toEqual(expectedNeed);
    }
  });

  it("recipe card has flavor_tags mapped from infoFlavorTags", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const firstCard = events.find((e) => e.event_type === "recipe_card");
    if (firstCard?.event_type === "recipe_card") {
      expect(firstCard.recipe.flavor_tags).toEqual(bbqWeekend.recipes[0].infoFlavorTags);
    }
  });

  it("recipe card has effort_level set to a valid EffortLevel", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card) => {
      if (card.event_type === "recipe_card") {
        expect(["quick", "medium", "long"]).toContain(card.recipe.effort_level);
      }
    });
  });

  it("recipe card has serves set to a positive integer", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.serves).toBeGreaterThan(0);
        expect(Number.isInteger(card.recipe.serves)).toBe(true);
      }
    });
  });

  it("recipe card has pcsv_roles as an object (may be empty)", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const firstCard = events.find((e) => e.event_type === "recipe_card");
    if (firstCard?.event_type === "recipe_card") {
      expect(typeof firstCard.recipe.pcsv_roles).toBe("object");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Grocery screen — immediate done
// ---------------------------------------------------------------------------

describe("createMockSSEService — grocery screen", () => {
  it("emits no events, calls onDone immediately", () => {
    const { events, doneStatus } = collectEvents(bbqWeekend, "grocery");
    expect(events).toHaveLength(0);
    expect(doneStatus).not.toBeNull();
    expect(doneStatus?.status).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// 6. Home screen — no-op, immediate done
// ---------------------------------------------------------------------------

describe("createMockSSEService — home screen", () => {
  it("emits no events, calls onDone immediately", () => {
    const { events, doneStatus } = collectEvents(bbqWeekend, "home");
    expect(events).toHaveLength(0);
    expect(doneStatus?.status).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// 7. Swap request
// ---------------------------------------------------------------------------

describe("createMockSSEService — swap request", () => {
  it("detects 'try another' in message and emits swap alternatives", () => {
    const { events } = collectEvents(bbqWeekend, "recipes", "try another option please");
    const types = events.map((e) => e.event_type);
    expect(types[0]).toBe("thinking");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    expect(recipeCards.length).toBeGreaterThan(0);
  });

  it("swap recipe cards count matches scenario swapAlternatives length", () => {
    const { events } = collectEvents(bbqWeekend, "recipes", "try another");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    expect(recipeCards).toHaveLength(bbqWeekend.swapAlternatives.length);
  });

  it("swap recipe card names match swapAlternatives names", () => {
    const { events } = collectEvents(bbqWeekend, "recipes", "try another");
    const recipeCards = events.filter((e) => e.event_type === "recipe_card");
    recipeCards.forEach((card, i) => {
      if (card.event_type === "recipe_card") {
        expect(card.recipe.name).toBe(bbqWeekend.swapAlternatives[i].name);
        expect(card.recipe.name_zh).toBe(bbqWeekend.swapAlternatives[i].nameCjk);
      }
    });
  });

  it("swap sequence: thinking → recipe_card(s) → done", () => {
    const { events, doneStatus } = collectEvents(
      bbqWeekend,
      "recipes",
      "try another"
    );
    expect(events[0].event_type).toBe("thinking");
    expect(doneStatus?.status).toBe("complete");
  });

  it("is case-insensitive for swap detection", () => {
    const { events: lowerEvents } = collectEvents(bbqWeekend, "recipes", "Try Another");
    const { events: upperEvents } = collectEvents(bbqWeekend, "recipes", "TRY ANOTHER");
    expect(lowerEvents.filter((e) => e.event_type === "recipe_card").length).toBeGreaterThan(0);
    expect(upperEvents.filter((e) => e.event_type === "recipe_card").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Error scenario
// ---------------------------------------------------------------------------

describe("createMockSSEService — error scenario", () => {
  it("detects 'error' in message and emits error event", () => {
    const { events } = collectEvents(bbqWeekend, "clarify", "trigger error please");
    const errorEvent = events.find((e) => e.event_type === "error");
    expect(errorEvent).toBeDefined();
  });

  it("error event has correct shape: message, code, recoverable=false", () => {
    const { events } = collectEvents(bbqWeekend, "clarify", "error test");
    const errorEvent = events.find((e) => e.event_type === "error");
    if (errorEvent?.event_type === "error") {
      expect(errorEvent.message.length).toBeGreaterThan(0);
      expect(errorEvent.code).toBe("MOCK_ERROR");
      expect(errorEvent.recoverable).toBe(false);
    }
  });

  it("error scenario calls onError callback", () => {
    const { errorMessage } = collectEvents(bbqWeekend, "clarify", "error test");
    expect(errorMessage).not.toBeNull();
    expect(errorMessage?.length).toBeGreaterThan(0);
  });

  it("onError message matches error event message", () => {
    const { events, errorMessage } = collectEvents(bbqWeekend, "clarify", "error now");
    const errorEvent = events.find((e) => e.event_type === "error");
    if (errorEvent?.event_type === "error") {
      expect(errorMessage).toBe(errorEvent.message);
    }
  });

  it("error starts with a thinking event", () => {
    const { events } = collectEvents(bbqWeekend, "clarify", "error test");
    expect(events[0].event_type).toBe("thinking");
  });

  it("onDone is NOT called for error scenario", () => {
    const { doneStatus } = collectEvents(bbqWeekend, "clarify", "error please");
    expect(doneStatus).toBeNull();
  });

  it("is case-insensitive for error detection", () => {
    const { errorMessage: lower } = collectEvents(bbqWeekend, "clarify", "ERROR test");
    const { errorMessage: upper } = collectEvents(bbqWeekend, "clarify", "Error Test");
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. Cancel behavior
// ---------------------------------------------------------------------------

describe("createMockSSEService — cancel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancel stops emission of pending events", () => {
    const events: SSEEvent[] = [];
    let doneStatus: string | null = null;

    const handler = createMockSSEService(bbqWeekend, { delayMs: 1 });
    const { cancel } = handler(
      "test message",
      "clarify",
      (event) => events.push(event),
      (status) => { doneStatus = status; },
      () => {}
    );

    // Cancel immediately before any timeouts fire
    cancel();

    // Advance all timers — no more events should arrive after cancel
    vi.runAllTimers();

    // No events should have fired (cancelled before first timeout)
    expect(events).toHaveLength(0);
    expect(doneStatus).toBeNull();
  });

  it("cancel after partial emission stops remaining events", () => {
    const events: SSEEvent[] = [];
    let doneStatus: string | null = null;

    const handler = createMockSSEService(bbqWeekend, { delayMs: 1 });
    const { cancel } = handler(
      "test message",
      "recipes",
      (event) => events.push(event),
      (status) => { doneStatus = status; },
      () => {}
    );

    // Advance by 500ms (first thinking event fires at 500ms)
    vi.advanceTimersByTime(500);
    const countAfterFirst = events.length;

    // Cancel after first thinking
    cancel();

    // Advance all remaining timers
    vi.runAllTimers();

    // No additional events should fire after cancel
    expect(events.length).toBe(countAfterFirst);
    expect(doneStatus).toBeNull();
  });

  it("cancel does NOT call onDone", () => {
    const onDone = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 1 });
    const { cancel } = handler(
      "test message",
      "clarify",
      () => {},
      onDone,
      () => {}
    );

    cancel();
    vi.runAllTimers();

    expect(onDone).not.toHaveBeenCalled();
  });

  it("cancel does NOT call onError", () => {
    const onError = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 1 });
    const { cancel } = handler(
      "test message",
      "clarify",
      () => {},
      () => {},
      onError
    );

    cancel();
    vi.runAllTimers();

    expect(onError).not.toHaveBeenCalled();
  });

  it("already-emitted events are preserved after cancel", () => {
    const events: SSEEvent[] = [];

    const handler = createMockSSEService(bbqWeekend, { delayMs: 1 });
    const { cancel } = handler(
      "test message",
      "recipes",
      (event) => events.push(event),
      () => {},
      () => {}
    );

    // Let first thinking fire (500ms)
    vi.advanceTimersByTime(500);
    const eventsBeforeCancel = [...events];
    expect(eventsBeforeCancel.length).toBeGreaterThan(0);

    cancel();
    vi.runAllTimers();

    // Events from before cancel remain in the array
    expect(events).toEqual(eventsBeforeCancel);
  });
});

// ---------------------------------------------------------------------------
// 10. Both scenarios work
// ---------------------------------------------------------------------------

describe("createMockSSEService — both scenarios", () => {
  it("bbq scenario clarify emits bbq pcsv data", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    const pcsvEvent = events.find((e) => e.event_type === "pcsv_update");
    if (pcsvEvent?.event_type === "pcsv_update") {
      expect(pcsvEvent.pcsv.protein.items).toContain("pork belly");
    }
  });

  it("chicken scenario clarify emits chicken pcsv data", () => {
    const { events } = collectEvents(weeknightChicken, "clarify");
    const pcsvEvent = events.find((e) => e.event_type === "pcsv_update");
    if (pcsvEvent?.event_type === "pcsv_update") {
      expect(pcsvEvent.pcsv.protein.items).toContain("chicken wings");
    }
  });

  it("bbq scenario recipes emits bbq recipe cards", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const firstCard = events.find((e) => e.event_type === "recipe_card");
    if (firstCard?.event_type === "recipe_card") {
      expect(firstCard.recipe.name).toBe("Korean BBQ Pork Belly");
    }
  });

  it("chicken scenario recipes emits chicken recipe cards", () => {
    const { events } = collectEvents(weeknightChicken, "recipes");
    const firstCard = events.find((e) => e.event_type === "recipe_card");
    if (firstCard?.event_type === "recipe_card") {
      expect(firstCard.recipe.name).toBe("Honey Garlic Chicken Wings");
    }
  });

  it("bbq swap alternatives differ from chicken swap alternatives", () => {
    const { events: bbqEvents } = collectEvents(bbqWeekend, "recipes", "try another");
    const { events: chickenEvents } = collectEvents(weeknightChicken, "recipes", "try another");
    const bbqCard = bbqEvents.find((e) => e.event_type === "recipe_card");
    const chickenCard = chickenEvents.find((e) => e.event_type === "recipe_card");
    if (bbqCard?.event_type === "recipe_card" && chickenCard?.event_type === "recipe_card") {
      expect(bbqCard.recipe.name).not.toBe(chickenCard.recipe.name);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. onDone called exactly once per request
// ---------------------------------------------------------------------------

describe("createMockSSEService — onDone exactly once", () => {
  it("onDone is called exactly once for clarify", () => {
    const onDone = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    handler("test", "clarify", () => {}, onDone, () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("onDone is called exactly once for recipes", () => {
    const onDone = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    handler("test", "recipes", () => {}, onDone, () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("onDone is called exactly once for grocery", () => {
    const onDone = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    handler("test", "grocery", () => {}, onDone, () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("onDone is called exactly once for home", () => {
    const onDone = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    handler("test", "home", () => {}, onDone, () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("onDone is NOT called when error scenario triggered", () => {
    const onDone = vi.fn();
    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    handler("error test", "clarify", () => {}, onDone, () => {});
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 12. Events arrive in correct order (first events are always thinking)
// ---------------------------------------------------------------------------

describe("createMockSSEService — event ordering", () => {
  it("clarify sequence: first event is always thinking", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe("thinking");
  });

  it("recipes sequence: first event is always thinking", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe("thinking");
  });

  it("error sequence: first event is always thinking", () => {
    const { events } = collectEvents(bbqWeekend, "clarify", "error test");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe("thinking");
  });

  it("swap sequence: first event is always thinking", () => {
    const { events } = collectEvents(bbqWeekend, "recipes", "try another");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe("thinking");
  });

  it("clarify: pcsv_update comes before explanation", () => {
    const { events } = collectEvents(bbqWeekend, "clarify");
    const pcsvIndex = events.findIndex((e) => e.event_type === "pcsv_update");
    const explanationIndex = events.findIndex((e) => e.event_type === "explanation");
    expect(pcsvIndex).toBeLessThan(explanationIndex);
  });

  it("recipes: all recipe_card events come before explanation", () => {
    const { events } = collectEvents(bbqWeekend, "recipes");
    const lastRecipeCardIndex = events.reduce(
      (acc, e, i) => (e.event_type === "recipe_card" ? i : acc),
      -1
    );
    const explanationIndex = events.findIndex((e) => e.event_type === "explanation");
    expect(lastRecipeCardIndex).toBeLessThan(explanationIndex);
  });
});

// ---------------------------------------------------------------------------
// 13. delayMs=0 is truly synchronous
// ---------------------------------------------------------------------------

describe("createMockSSEService — delayMs=0 synchronous behavior", () => {
  it("all events are emitted synchronously when delayMs=0 (no timers needed)", () => {
    // This test verifies that with delayMs=0, all callbacks fire immediately
    // without needing vi.useFakeTimers() or vi.runAllTimers()
    const events: SSEEvent[] = [];
    let doneCalled = false;

    const handler = createMockSSEService(bbqWeekend, { delayMs: 0 });
    handler(
      "test",
      "clarify",
      (event) => events.push(event),
      () => { doneCalled = true; },
      () => {}
    );

    // If synchronous, events and done should be populated immediately
    expect(events.length).toBeGreaterThan(0);
    expect(doneCalled).toBe(true);
  });
});
