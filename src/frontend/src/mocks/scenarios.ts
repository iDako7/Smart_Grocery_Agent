// Scenario registry — all available demo scenarios
// Import this to access the full scenario map

import { bbqWeekend } from "./bbq-weekend";
import { weeknightChicken } from "./weeknight-chicken";
import type { ScenarioShape } from "./bbq-weekend";

export type ScenarioData = ScenarioShape;
export type ScenarioKey = "bbq" | "chicken";

export const scenarios: Record<ScenarioKey, ScenarioData> = {
  bbq: bbqWeekend,
  chicken: weeknightChicken,
};
