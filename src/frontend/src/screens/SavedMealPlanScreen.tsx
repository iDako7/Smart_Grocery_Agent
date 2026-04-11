import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { ChatInput } from "@/components/chat-input";
import { ExpandableRecipe } from "@/components/expandable-recipe";
import { Toast } from "@/components/toast";
import { useScenario } from "@/context/scenario-context";
import { useSessionOptional } from "@/context/session-context";

export function SavedMealPlanScreen() {
  const navigate = useNavigate();
  const { scenario } = useScenario();
  const { name, savedDate, deckText, recipes: SAVED_RECIPES } = scenario.savedPlan;
  const session = useSessionOptional();
  const sendMessage = session?.sendMessage ?? (() => {});
  const navigateToScreen = session?.navigateToScreen;

  return (
    <div data-testid="screen-saved-meal-plan" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button type="button" aria-label="Go back" onClick={() => navigate("/")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <span className="text-[11px] font-semibold text-ink-2">SGA</span>
        {/* spacer for alignment */}
        <div aria-hidden="true" className="min-w-[36px]" />
      </div>

      {/* Saved toast */}
      <Toast message="Saved!" />

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
        onSend={(text) => {
          navigateToScreen?.("saved_meal_plan");
          sendMessage(text);
        }}
      />

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
