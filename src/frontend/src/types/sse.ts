// TypeScript translation of contracts/sse_events.py
// Status: mirrors unfrozen Python contract

import type { PCSVResult, RecipeSummary } from "./tools";

// ---------------------------------------------------------------------------
// Grocery list structure (Store > Department > Item)
// ---------------------------------------------------------------------------

export type GroceryItem = {
  id: string;
  name: string;
  amount: string;
  recipe_context: string;
  checked: boolean;
};

export type GroceryDepartment = {
  name: string;
  items: GroceryItem[];
};

export type GroceryStore = {
  store_name: string;
  departments: GroceryDepartment[];
};

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

export type ThinkingEvent = {
  event_type: "thinking";
  message: string;
};

export type PcsvUpdateEvent = {
  event_type: "pcsv_update";
  pcsv: PCSVResult;
};

export type RecipeCardEvent = {
  event_type: "recipe_card";
  recipe: RecipeSummary;
};

export type ExplanationEvent = {
  event_type: "explanation";
  text: string;
};

export type GroceryListEvent = {
  event_type: "grocery_list";
  stores: GroceryStore[];
};

export type ErrorEvent = {
  event_type: "error";
  message: string;
  code: string | null;
  recoverable: boolean;
};

export type DoneEvent = {
  event_type: "done";
  status: "complete" | "partial";
  reason: string | null;
};

// ---------------------------------------------------------------------------
// Discriminated union for type-safe deserialization
// ---------------------------------------------------------------------------

export type SSEEvent =
  | ThinkingEvent
  | PcsvUpdateEvent
  | RecipeCardEvent
  | ExplanationEvent
  | GroceryListEvent
  | ErrorEvent
  | DoneEvent;
