import { BrowserRouter, Routes, Route } from "react-router";
import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { SavedMealPlanScreen } from "@/screens/SavedMealPlanScreen";
import { SavedRecipeScreen } from "@/screens/SavedRecipeScreen";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import { SessionProvider } from "@/context/session-context";

function AppShell() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/clarify" element={<ClarifyScreen />} />
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/grocery" element={<GroceryScreen />} />
          <Route path="/saved/plan/:id" element={<SavedMealPlanScreen />} />
          <Route path="/saved/recipe/:id" element={<SavedRecipeScreen />} />
          <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}

function App() {
  return <AppShell />;
}

export default App;
