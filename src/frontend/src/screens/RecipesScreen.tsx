import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import { StepProgress } from "@/components/step-progress";
import { RecipeCard } from "@/components/recipe-card";
import { SwapPanel } from "@/components/swap-panel";
import { ChatInput } from "@/components/chat-input";
import { InfoSheet } from "@/components/info-sheet";
import { ErrorBanner } from "@/components/error-banner";
import { useScenario } from "@/context/scenario-context";
import { useSessionOptional } from "@/context/session-context";
import type { RecipeCardData } from "@/mocks/bbq-weekend";
import type { RecipeSummary, EffortLevel } from "@/types/tools";

// Map RecipeSummary (from SSE events) → RecipeCardData (screen component props)
function summaryToCardData(summary: RecipeSummary, index: number): RecipeCardData {
  const effortToTime: Record<EffortLevel, string> = {
    quick: "15 min",
    medium: "25 min",
    long: "45 min",
  };
  return {
    index,
    name: summary.name,
    nameCjk: summary.name_zh,
    flavorProfile: summary.cuisine,
    cookingMethod: summary.cooking_method,
    time: effortToTime[summary.effort_level] ?? "30 min",
    ingredients: [
      ...summary.ingredients_have.map((n) => ({ name: n, have: true })),
      ...summary.ingredients_need.map((n) => ({ name: n, have: false })),
    ],
    infoFlavorTags: summary.flavor_tags,
    infoDescription: `${summary.cuisine} · ${summary.cooking_method}`,
  };
}

export function RecipesScreen() {
  const navigate = useNavigate();
  const { scenario } = useScenario();
  const session = useSessionOptional();
  const sendMessage = session?.sendMessage ?? (() => {});
  const navigateToScreen = session?.navigateToScreen;
  const sessionRecipes = session?.screenData?.recipes ?? [];
  const screenState = session?.screenState ?? "idle";
  const screenData = session?.screenData;
  const isComplete = session?.isComplete ?? false;

  // Use session recipe data if available, fall back to scenario data
  const RECIPES: RecipeCardData[] = useMemo(() => {
    if (sessionRecipes.length > 0) {
      return sessionRecipes.map((r, i) => summaryToCardData(r, i));
    }
    return scenario.recipes;
  }, [sessionRecipes, scenario.recipes]);

  const SWAP_ALTERNATIVES = scenario.swapAlternatives;
  const { eyebrow, description } = scenario.recipesHeader;
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoRecipe, setInfoRecipe] = useState<RecipeCardData | null>(null);

  function handleRetry() {
    sendMessage("retry");
  }

  function handleSwap(idx: number, recipeName: string) {
    setSwappingIndex(idx === swappingIndex ? null : idx);
    sendMessage(`try another for ${recipeName}`);
  }

  function handleKeepOriginal() {
    setSwappingIndex(null);
  }

  function handleInfoClick(recipe: RecipeCardData) {
    setInfoRecipe(recipe);
    setInfoOpen(true);
  }

  return (
    <div data-testid="screen-recipes" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate("/clarify")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="bg-paper px-[9px] py-[3px] rounded-full text-[10px] flex gap-1.5 items-center">
          <b className="text-ink">EN</b>
          <span className="text-ink-3 font-normal">·</span>
          <span className="text-ink-3 font-normal">中</span>
        </span>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => navigate("/")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Step progress */}
      <StepProgress currentStep={3} totalSteps={4} label="Recipes" />

      {/* Header card */}
      <div className="mx-3.5 mb-3.5 px-5 py-5 bg-paper rounded-2xl relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-[30px] -right-[30px] w-[140px] h-[140px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-apricot) 0%, var(--color-persimmon-soft) 60%, transparent 100%)",
            opacity: 0.5,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-[40px] -left-[30px] w-[120px] h-[120px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-jade-soft) 0%, transparent 70%)",
            opacity: 0.6,
          }}
        />
        <div className="relative z-[1]">
          <div className="inline-flex items-center gap-1.5 bg-shoyu text-cream px-[11px] py-[5px] rounded-full text-[10px] font-semibold tracking-[0.04em] mb-2.5">
            <span className="text-apricot">✶</span> {eyebrow}
          </div>
          <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.1] max-w-[260px]">
            Your meal <span className="text-persimmon">plan</span>.
          </h1>
          <p className="mt-2.5 text-[13px] text-ink-2 leading-[1.5] max-w-[280px]">
            {description}
          </p>
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            <span className="bg-cream-deep px-[11px] py-[5px] rounded-full text-[10.5px] font-semibold text-ink-2">
              <b className="text-jade">{RECIPES.length}</b> dishes
            </span>
            <span className="bg-cream-deep px-[11px] py-[5px] rounded-full text-[10.5px] font-semibold text-ink-2">
              serves <b className="text-jade">8</b>
            </span>
            <span className="bg-cream-deep px-[11px] py-[5px] rounded-full text-[10.5px] font-semibold text-ink-2">
              ~<b className="text-jade">60</b> min
            </span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {screenState === "error" && screenData?.error && (
        <div className="mx-3.5 mb-2">
          <ErrorBanner
            message={screenData.error}
            onRetry={handleRetry}
          />
        </div>
      )}

      {/* Partial banner */}
      {isComplete && screenData?.completionStatus === "partial" && (
        <div className="mx-3.5 mb-2">
          <ErrorBanner
            message="Some results may be incomplete"
            variant="partial"
          />
        </div>
      )}

      {/* Recipe cards + swap panel interleaved */}
      {RECIPES.map((recipe) => (
        <div key={recipe.name}>
          <RecipeCard
            index={recipe.index}
            name={recipe.name}
            nameCjk={recipe.nameCjk}
            flavorProfile={recipe.flavorProfile}
            cookingMethod={recipe.cookingMethod}
            time={recipe.time}
            ingredients={recipe.ingredients}
            isSwapping={swappingIndex === recipe.index}
            onSwap={() => handleSwap(recipe.index, recipe.name)}
            onInfoClick={() => handleInfoClick(recipe)}
          />
          {swappingIndex === recipe.index && (
            <SwapPanel
              alternatives={SWAP_ALTERNATIVES}
              onPick={() => setSwappingIndex(null)}
              onKeepOriginal={handleKeepOriginal}
            />
          )}
        </div>
      ))}

      {/* Chat input */}
      <ChatInput
        placeholder="Refine your meal plan..."
        hint="Edit to refine, or send as written"
        onSend={(text) => sendMessage(text)}
      />

      {/* Actions */}
      <div className="flex gap-2.5 px-3.5 pt-1 pb-2.5">
        <button
          type="button"
          className="flex-1 py-3 rounded-md bg-paper text-ink border border-cream-deep font-sans text-[13px] font-semibold cursor-pointer min-h-[44px]"
        >
          Save plan
        </button>
        <button
          type="button"
          onClick={() => { navigateToScreen?.("grocery"); navigate("/grocery"); }}
          className="flex-[1.3] py-3 rounded-md bg-shoyu text-cream border-none font-sans text-[13px] font-semibold cursor-pointer flex items-center justify-center gap-2 min-h-[44px]"
        >
          Build list <span className="text-apricot text-[14px]">→</span>
        </button>
      </div>

      {/* Footer */}
      <div className="text-center px-4 pt-1.5 pb-[18px] text-[10px] text-ink-3 font-medium">
        Smart Grocery <span className="text-persimmon mx-[6px]">·</span> Vancouver
      </div>

      {/* Info sheet */}
      {infoRecipe && (
        <InfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          name={infoRecipe.name}
          nameCjk={infoRecipe.nameCjk}
          flavorTags={infoRecipe.infoFlavorTags}
          description={infoRecipe.infoDescription}
        />
      )}
    </div>
  );
}
