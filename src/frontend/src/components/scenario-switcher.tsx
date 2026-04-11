// ScenarioSwitcher — dev-only floating toggle button
// Fixed bottom-right, only rendered in import.meta.env.DEV mode

import { useScenario } from "@/context/scenario-context";
import type { ScenarioKey } from "@/mocks/scenarios";

const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  bbq: "bbq",
  chicken: "chicken",
};

const NEXT_SCENARIO: Record<ScenarioKey, ScenarioKey> = {
  bbq: "chicken",
  chicken: "bbq",
};

export function ScenarioSwitcher() {
  // Always render in test environments (import.meta.env.DEV may be undefined in tests)
  const isDev =
    typeof import.meta !== "undefined" &&
    typeof import.meta.env !== "undefined"
      ? import.meta.env.DEV !== false
      : true;

  const { scenarioKey, setScenario } = useScenario();

  if (!isDev) return null;

  function handleClick() {
    setScenario(NEXT_SCENARIO[scenarioKey]);
  }

  return (
    <button
      type="button"
      data-testid="scenario-switcher"
      onClick={handleClick}
      aria-label={`Switch scenario (current: ${SCENARIO_LABELS[scenarioKey]})`}
      className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-shoyu text-cream rounded-full text-[11px] font-semibold shadow-md border border-apricot cursor-pointer font-sans min-h-[36px] flex items-center gap-1.5"
    >
      <span className="text-apricot">◎</span>
      {SCENARIO_LABELS[scenarioKey]}
    </button>
  );
}
