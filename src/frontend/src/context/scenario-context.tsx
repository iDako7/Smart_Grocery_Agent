// ScenarioContext — provides current scenario data and a switcher function
// Defaults to 'bbq' scenario. Checks URL param ?scenario=chicken to override.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { scenarios } from "@/mocks/scenarios";
import type { ScenarioData, ScenarioKey } from "@/mocks/scenarios";

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------
interface ScenarioContextValue {
  scenario: ScenarioData;
  scenarioKey: ScenarioKey;
  setScenario: (key: ScenarioKey) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const ScenarioContext = createContext<ScenarioContextValue | null>(null);

// ---------------------------------------------------------------------------
// Resolve initial scenario from URL param (graceful fallback to 'bbq')
// ---------------------------------------------------------------------------
function resolveInitialKey(): ScenarioKey {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("scenario");
    if (param && param in scenarios) {
      return param as ScenarioKey;
    }
  }
  return "bbq";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>(
    resolveInitialKey
  );

  const setScenario = useCallback((key: ScenarioKey) => {
    setScenarioKey(key);
  }, []);

  const scenario = scenarios[scenarioKey];

  const value = useMemo(
    () => ({ scenario, scenarioKey, setScenario }),
    [scenario, scenarioKey, setScenario]
  );

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext);
  if (!ctx) {
    throw new Error("useScenario must be used inside ScenarioProvider");
  }
  return ctx;
}
