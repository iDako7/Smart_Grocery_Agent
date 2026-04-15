// RecipesScreen — shows recipe results from the agent (issue #39, T-C).
//
// Reads everything from useSessionOptional(). If the session is unavailable
// or the recipe list is empty, the empty state is shown.
//
// State branches (by screenState):
//   idle       → empty state
//   loading    → 3 skeleton cards
//   streaming  → real cards (CTA disabled)
//   complete   → real cards + CTA enabled  (or empty state if recipes == [])
//   error      → ErrorBanner + retry
//
// Partial completion banner appears above the body when
//   isComplete && screenData.completionStatus === "partial".
//
// UAT fixes (issue #56):
//   - SwapPanel is now a radio-group selector; stays open after pick.
//   - Always passes r.alternatives (not shown.alternatives) to avoid stale data.
//   - Remove button hides the card from the displayed list.

import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

import { RecipeCard } from "@/components/recipe-card";
import { SwapPanel } from "@/components/swap-panel";
import { RecipeInfoSheet } from "@/components/recipe-info-sheet";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmResetDialog } from "@/components/confirm-reset-dialog";
import { useSessionOptional } from "@/context/session-context";
import { partialBannerMessage } from "@/lib/partial-message";
import { postGroceryList, patchSessionRecipe, saveMealPlan } from "@/services/api-client";
import { collectBuyItems } from "@/services/grocery-helpers";
import type { RecipeSummary, EffortLevel } from "@/types/tools";

// ---------------------------------------------------------------------------
// Helpers (inline — single-use helpers kept local to this file)
// ---------------------------------------------------------------------------

function effortToTime(level: EffortLevel): string {
  switch (level) {
    case "quick":
      return "20 min";
    case "medium":
      return "35 min";
    case "long":
      return "60 min";
  }
}

function recipeToIngredientTags(r: RecipeSummary): { name: string; have: boolean }[] {
  const haveHints = r.ingredients_have.map((s) => s.toLowerCase());
  return r.ingredients.map((ing) => {
    const nameLower = ing.name.toLowerCase();
    const have = haveHints.some((hint) => hint.includes(nameLower) || nameLower.includes(hint));
    return { name: ing.name, have };
  });
}

function SkeletonCard() {
  return (
    <div
      data-testid="recipe-card-skeleton"
      className="mx-3.5 mb-2.5 px-[18px] py-4 bg-paper rounded-lg"
    >
      <div className="h-3 w-20 bg-cream-deep rounded-full mb-3 animate-pulse" />
      <div className="h-4 w-48 bg-cream-deep rounded mb-2 animate-pulse" />
      <div className="h-3 w-40 bg-cream-deep rounded mb-3 animate-pulse" />
      <div className="flex gap-1.5">
        <div className="h-5 w-16 bg-cream-deep rounded-full animate-pulse" />
        <div className="h-5 w-20 bg-cream-deep rounded-full animate-pulse" />
        <div className="h-5 w-14 bg-cream-deep rounded-full animate-pulse" />
      </div>
    </div>
  );
}

// Module-level empty set — stable reference avoids unnecessary re-renders.
const EMPTY_SET: Set<string> = new Set();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecipesScreen() {
  const navigate = useNavigate();
  const session = useSessionOptional();

  const navigateToScreen = session?.navigateToScreen;
  const resetSession = session?.resetSession;
  const sendMessage = session?.sendMessage ?? (() => {});
  const dispatch = session?.dispatch;
  const sessionId = session?.sessionId ?? null;
  const screenData = session?.screenData;
  const screenState = session?.screenState ?? "idle";
  const isComplete = session?.isComplete ?? false;

  const recipes = screenData?.recipes ?? [];

  const [lang, setLang] = useState<"en" | "zh">("en");
  const [resetOpen, setResetOpen] = useState(false);
  const [infoRecipeId, setInfoRecipeId] = useState<string | null>(null);
  const [swapOpenFor, setSwapOpenFor] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RecipeSummary>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [excludedByCard, setExcludedByCard] = useState<Map<string, Set<string>>>(new Map());
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const backButtonRef = useRef<HTMLButtonElement>(null);
  const prevResetOpen = useRef(false);
  const prevRecipesRef = useRef(screenData?.recipes);

  // Reset local display state when the session produces a new recipe list.
  if (prevRecipesRef.current !== screenData?.recipes) {
    prevRecipesRef.current = screenData?.recipes;
    if (Object.keys(overrides).length > 0) setOverrides({});
    if (removedIds.size > 0) setRemovedIds(new Set());
    if (swapOpenFor !== null) setSwapOpenFor(null);
    if (excludedByCard.size > 0) setExcludedByCard(new Map());
  }

  useEffect(() => {
    if (prevResetOpen.current && !resetOpen) {
      backButtonRef.current?.focus();
    }
    prevResetOpen.current = resetOpen;
  }, [resetOpen]);

  function handleToggleBuy(cardId: string, ingredientName: string) {
    setExcludedByCard((prev) => {
      const next = new Map(prev);
      const cardSet = new Set(next.get(cardId) ?? []);
      if (cardSet.has(ingredientName)) {
        cardSet.delete(ingredientName);
      } else {
        cardSet.add(ingredientName);
      }
      next.set(cardId, cardSet);
      return next;
    });
  }

  function handleStartOver() {
    resetSession?.();
    navigate("/");
  }

  function handleRetry() {
    sendMessage("retry");
  }

  async function handleSaveMealPlan() {
    if (!sessionId) return;
    setIsSaving(true);
    setBuildError(null);
    try {
      const saved = await saveMealPlan("My Meal Plan", sessionId);
      navigate(`/saved/plan/${saved.id}`, { state: { justSaved: true } });
    } catch {
      setBuildError("Couldn't save your meal plan. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBuildList() {
    if (!sessionId || !dispatch) return;
    setIsBuilding(true);
    setBuildError(null);
    try {
      const excludedByIndex = new Map<number, Set<string>>();
      displayedRecipes.forEach((r, idx) => {
        const excluded = excludedByCard.get(r.id);
        if (excluded && excluded.size > 0) excludedByIndex.set(idx, excluded);
      });
      const items = collectBuyItems(
        displayedRecipes.map((r) => {
          const shown = overrides[r.id] ?? r;
          return { name: shown.name, id: shown.id, ingredients: recipeToIngredientTags(shown) };
        }),
        excludedByIndex
      );
      const stores = await postGroceryList(sessionId, items);
      navigateToScreen?.("grocery");
      dispatch({ type: "set_grocery_list", stores });
      navigate("/grocery");
    } catch {
      setBuildError("Couldn't build your grocery list. Please try again.");
    } finally {
      setIsBuilding(false);
    }
  }

  const isLoading = screenState === "loading";
  const isStreaming = screenState === "streaming";
  const isError = screenState === "error";
  const isPartial = isComplete && screenData?.completionStatus === "partial";

  // Recipes filtered by user removals.
  const displayedRecipes = recipes.filter((r) => !removedIds.has(r.id));

  // Empty state when idle, or when complete-but-no-recipes (T7 guard).
  // Based on agent-returned count, not user-removed count.
  const showEmptyState =
    (screenState === "idle" && recipes.length === 0) ||
    (screenState === "complete" && recipes.length === 0);

  const showCta = displayedRecipes.length > 0;
  const ctaEnabled = screenState === "complete";

  return (
    <div
      data-testid="screen-recipes"
      className="min-h-screen bg-cream flex flex-col"
    >
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button
          ref={backButtonRef}
          type="button"
          aria-label="Go back"
          onClick={() => setResetOpen(true)}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-[11px] font-semibold text-ink-2">Recipes</span>
        {/* EN / 中 language toggle */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLang("en")}
            aria-pressed={lang === "en"}
            className={`text-[11px] font-semibold px-2 py-1 rounded-full border-none cursor-pointer ${
              lang === "en" ? "bg-shoyu text-cream" : "bg-transparent text-ink-3"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang("zh")}
            aria-pressed={lang === "zh"}
            className={`text-[11px] font-semibold px-2 py-1 rounded-full border-none cursor-pointer ${
              lang === "zh" ? "bg-shoyu text-cream" : "bg-transparent text-ink-3"
            }`}
          >
            中
          </button>
        </div>
      </div>

      {/* Partial completion banner — above body */}
      {isPartial && (
        <div className="px-5 pt-3">
          <ErrorBanner
            message={partialBannerMessage(screenData?.completionReason ?? null)}
            variant="partial"
          />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="px-5 py-4">
          <ErrorBanner
            message={screenData?.error ?? "Something went wrong. Please try again."}
            onRetry={handleRetry}
          />
        </div>
      )}

      {/* Loading → 3 skeletons */}
      {isLoading && (
        <div className="mt-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state — idle with no recipes, or complete-with-zero (T7) */}
      {!isLoading && !isError && showEmptyState && (
        <div className="flex-1 flex items-center justify-center px-5 py-10">
          <p className="text-[13px] text-ink-3 text-center">
            No recipes yet. Start a chat to get recommendations.
          </p>
        </div>
      )}

      {/* Real cards — streaming or complete with data */}
      {!isLoading && !isError && !showEmptyState && displayedRecipes.length > 0 && (isStreaming || isComplete) && (
        <div className="mt-2">
          {displayedRecipes.map((r, idx) => {
            const shown = overrides[r.id] ?? r;
            return (
              <React.Fragment key={r.id}>
                <RecipeCard
                  index={idx}
                  name={shown.name}
                  nameCjk={shown.name_zh}
                  lang={lang}
                  flavorProfile={shown.flavor_tags[0] ?? ""}
                  cookingMethod={shown.cooking_method}
                  time={effortToTime(shown.effort_level)}
                  ingredients={recipeToIngredientTags(shown)}
                  onSwap={() => setSwapOpenFor(r.id)}
                  isSwapping={swapOpenFor === r.id}
                  onInfoClick={() => setInfoRecipeId(shown.id)}
                  excludedIngredients={excludedByCard.get(r.id) ?? EMPTY_SET}
                  onToggleBuy={(name) => handleToggleBuy(r.id, name)}
                  onRemove={() => {
                    setRemovedIds((prev) => new Set(prev).add(r.id));
                    if (swapOpenFor === r.id) setSwapOpenFor(null);
                  }}
                  canRemove={true}
                />
                {swapOpenFor === r.id && (
                  <SwapPanel
                    original={r}
                    selected={shown}
                    alternatives={r.alternatives}
                    lang={lang}
                    onSelect={async (recipe) => {
                      const isRestore = recipe.id === r.id;

                      // Optimistic update
                      if (isRestore) {
                        setOverrides((prev) => {
                          const next = { ...prev };
                          delete next[r.id];
                          return next;
                        });
                      } else {
                        setOverrides((prev) => ({ ...prev, [r.id]: recipe }));
                        // Clear pill exclusions when swapping to a different recipe —
                        // exclusions from the old recipe don't translate to the new one.
                        setExcludedByCard((prev) => {
                          const next = new Map(prev);
                          next.delete(r.id);
                          return next;
                        });
                      }

                      // Persist to backend when a session is active and it's a real swap
                      if (sessionId && !isRestore) {
                        try {
                          await patchSessionRecipe(sessionId, idx, recipe);
                        } catch {
                          // Revert optimistic update on failure and close the panel
                          setOverrides((prev) => {
                            const next = { ...prev };
                            delete next[r.id];
                            return next;
                          });
                          setSwapOpenFor(null);
                          setBuildError("Couldn't save your recipe swap. Please try again.");
                        }
                      }
                    }}
                    onClose={() => setSwapOpenFor(null)}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Build list error banner */}
      {buildError && (
        <div className="px-5 pt-3">
          <ErrorBanner message={buildError} />
        </div>
      )}

      {/* CTA — visible when there are displayed recipes */}
      {showCta && (
        <div className="px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSaveMealPlan}
            disabled={!ctaEnabled || isSaving}
            className={`px-6 py-[11px] border-none rounded-full font-sans text-[13px] font-semibold ${
              ctaEnabled && !isSaving
                ? "bg-cream-deep text-ink cursor-pointer"
                : "bg-cream-deep text-ink-3 cursor-not-allowed opacity-60"
            }`}
          >
            {isSaving ? "Saving…" : "Save meal plan"}
          </button>
          <button
            type="button"
            onClick={handleBuildList}
            disabled={!ctaEnabled || isBuilding}
            className={`px-6 py-[11px] border-none rounded-full font-sans text-[13px] font-semibold ${
              ctaEnabled && !isBuilding
                ? "bg-shoyu text-cream cursor-pointer"
                : "bg-cream-deep text-ink-3 cursor-not-allowed opacity-60"
            }`}
          >
            {isBuilding ? "Building…" : "Build list →"}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>

      {/* Confirm reset dialog */}
      <ConfirmResetDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={handleStartOver}
      />

      {/* Info sheet */}
      <RecipeInfoSheet
        open={infoRecipeId !== null}
        recipeId={infoRecipeId}
        lang={lang}
        onClose={() => setInfoRecipeId(null)}
      />
    </div>
  );
}
