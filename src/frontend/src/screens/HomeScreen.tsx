import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { QuickStartChip } from "@/components/quick-start-chip";
import { Sidebar, type SidebarItem, type SidebarItemType } from "@/components/sidebar";
import { useSessionOptional } from "@/context/session-context";
import { listSavedMealPlans, listSavedRecipes, listSavedGroceryLists } from "@/services/api-client";

const QUICK_STARTS = ["Weekend BBQ", "Weeknight meals", "Use my leftovers"];

export function HomeScreen() {
  const navigate = useNavigate();
  const session = useSessionOptional();
  const sendMessage = session?.sendMessage ?? (() => {});
  const navigateToScreen = session?.navigateToScreen;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [mealPlans, setMealPlans] = useState<SidebarItem[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SidebarItem[]>([]);
  const [groceryLists, setGroceryLists] = useState<SidebarItem[]>([]);

  useEffect(() => {
    async function fetchSidebarData() {
      try {
        const [plans, recipes, lists] = await Promise.all([
          listSavedMealPlans(),
          listSavedRecipes(),
          listSavedGroceryLists(),
        ]);
        setMealPlans(plans.map(p => ({
          id: p.id,
          name: p.name,
          meta: `${p.recipe_count} recipes`,
        })));
        setSavedRecipes(recipes.map(r => ({
          id: r.id,
          name: r.recipe_name,
          meta: new Date(r.created_at).toLocaleDateString(),
        })));
        setGroceryLists(lists.map(l => ({
          id: l.id,
          name: l.name,
          meta: `${l.item_count} items`,
        })));
      } catch {
        // Sidebar data is non-critical — fail silently with empty lists
      }
    }
    void fetchSidebarData();
  }, []);

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    navigateToScreen?.("clarify");
    sendMessage(trimmed);
    navigate("/clarify");
  }

  function handleQuickStart(label: string) {
    navigateToScreen?.("clarify");
    sendMessage(label);
    navigate("/clarify");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSend(inputValue);
    }
  }

  function handleSidebarItemClick(id: string, type: SidebarItemType) {
    setSidebarOpen(false);
    const routePrefix = type === "plan" ? "/saved/plan" : type === "recipe" ? "/saved/recipe" : "/saved/list";
    navigate(`${routePrefix}/${id}`);
  }

  return (
    <div data-testid="screen-home" className="min-h-screen bg-cream flex flex-col">
      {/* Status bar */}
      <div className="flex justify-between items-center px-[22px] pt-3 pb-1 text-[11px] font-semibold text-ink-2">
        <span>9:41</span>
        <span>SGA</span>
      </div>

      {/* Nav bar */}
      <div className="flex justify-between items-center px-[18px] pt-2 pb-0.5">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setSidebarOpen(true)}
          className="text-[18px] text-ink-2 cursor-pointer p-2 min-w-[36px] min-h-[36px] flex items-center justify-center leading-none bg-transparent border-none"
        >
          ☰
        </button>
        <span className="text-[13px] font-semibold text-ink">Smart Grocery</span>
        <span className="w-9" aria-hidden="true" />
      </div>

      {/* Hero card */}
      <div className="mx-3.5 mt-2.5 px-5 py-[18px] bg-paper rounded-2xl relative overflow-hidden">
        {/* Decorative radial gradient */}
        <div
          aria-hidden="true"
          className="absolute -top-5 -right-5 w-[120px] h-[120px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-apricot) 0%, transparent 70%)",
            opacity: 0.3,
          }}
        />
        <div className="relative z-[1]">
          <h2 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
            What are you <span className="text-persimmon">planning</span>?
          </h2>
          <p className="mt-1.5 text-[13px] text-ink-2 leading-[1.4]">
            Tell me what you have, or what you're cooking this week.
          </p>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="BBQ for 8, or I have leftover chicken..."
            className="w-full mt-3.5 px-3.5 py-3 border-[1.5px] border-cream-deep rounded-md bg-tofu font-sans text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-3 min-h-[44px]"
          />
        </div>
      </div>

      {/* Quick start */}
      <div className="px-3.5 pt-3 pb-1 text-[12px] font-medium text-ink-3">
        Quick start
      </div>
      <div className="flex flex-wrap gap-2 px-3.5 pb-4">
        {QUICK_STARTS.map((label) => (
          <QuickStartChip key={label} label={label} onClick={() => handleQuickStart(label)} />
        ))}
      </div>

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        mealPlans={mealPlans}
        savedRecipes={savedRecipes}
        groceryLists={groceryLists}
        onItemClick={handleSidebarItemClick}
      />
    </div>
  );
}
