import { useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider } from "@/context/session-context";
import { ScenarioSwitcher } from "@/components/scenario-switcher";
import { createRealSSEService } from "@/services/real-sse";

function AppShell() {
  const chatService = useMemo(() => createRealSSEService(), []);

  return (
    <BrowserRouter>
      <SessionProvider chatService={chatService}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/clarify" element={<ClarifyScreen />} />
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/plan/:id" element={<SavedMealPlanScreen />} />
          <Route path="/saved/recipe/:id" element={<SavedRecipeScreen />} />
          <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
        </Routes>
        <ScenarioSwitcher />
      </SessionProvider>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ScenarioProvider>
      <AppShell />
    </ScenarioProvider>
  );
}

export default App;
