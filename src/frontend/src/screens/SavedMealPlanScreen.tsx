import { ChatInput } from "@/components/chat-input";
import { ExpandableRecipe } from "@/components/expandable-recipe";
import { useScenario } from "@/context/scenario-context";

export function SavedMealPlanScreen() {
  const { scenario } = useScenario();
  const { name, savedDate, deckText, recipes: SAVED_RECIPES } = scenario.savedPlan;

  return (
    <div data-testid="screen-saved-meal-plan" className="min-h-screen bg-cream flex flex-col">
      {/* Status bar */}
      <div className="flex justify-between items-center px-[22px] pt-3 pb-1 text-[11px] font-semibold text-ink-2">
        <span>9:41</span>
        <span>SGA</span>
      </div>

      {/* Saved plan card */}
      <div className="mx-3.5 my-3.5 bg-paper rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-[18px] pb-3 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute -top-5 -right-5 w-[120px] h-[120px] rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, var(--color-apricot) 0%, transparent 70%)",
              opacity: 0.32,
            }}
          />
          <div className="relative z-[1]">
            <div className="inline-flex items-center gap-1.5 bg-shoyu text-cream px-[11px] py-[5px] rounded-full text-[10px] font-semibold tracking-[0.04em] mb-2.5">
              <span className="text-apricot">✶</span> {savedDate}
            </div>
            <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
              {name} <span className="text-persimmon">plan</span>.
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-2 leading-[1.5]">
              {deckText}
            </p>
          </div>
        </div>

        {/* Expandable recipe rows */}
        {SAVED_RECIPES.map((recipe) => (
          <ExpandableRecipe
            key={recipe.id}
            name={recipe.name}
            meta={recipe.meta}
            detail={recipe.detail}
          />
        ))}
      </div>

      {/* Chat input */}
      <ChatInput
        placeholder="Add a dessert to this plan..."
        hint="Chat to add or modify recipes"
        onSend={() => {}}
      />

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
