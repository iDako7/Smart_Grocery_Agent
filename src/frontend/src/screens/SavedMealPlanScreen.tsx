import { useState, useEffect, useMemo, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, useParams } from "react-router";
import { ExpandableRecipe } from "@/components/expandable-recipe";
import { Toast } from "@/components/toast";
import { getSavedMealPlan } from "@/services/api-client";
import type { SavedMealPlan } from "@/types/api";

export function SavedMealPlanScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  const [plan, setPlan] = useState<SavedMealPlan | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset to loading when id changes (React-approved prop-derived state pattern)
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setPlan(null);
    setLoading(true);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSavedMealPlan(id)
      .then((data) => { if (!cancelled) setPlan(data); })
      .catch(() => { if (!cancelled) setPlan(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const mappedRecipes = useMemo(
    () =>
      plan?.recipes.map((r) => ({
        id: r.id,
        name: r.name,
        meta: `${r.cuisine} · ${r.cooking_method}`,
        detail: r.instructions,
      })) ?? [],
    [plan]
  );

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const visibleRecipes = mappedRecipes.filter((r) => !removedIds.has(r.id));
  const handleRemove = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  }, []);

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

      {/* Saved toast — only shown when arriving via the Save plan button */}
      {(location.state as { justSaved?: boolean } | null)?.justSaved && <Toast message="Saved!" testId="saved-toast" />}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <span data-testid="loading-indicator" className="text-[13px] text-ink-2">
            Loading...
          </span>
        </div>
      )}

      {/* Not found state */}
      {!loading && !plan && (
        <div className="flex flex-1 items-center justify-center">
          <span data-testid="not-found-message" className="text-[13px] text-ink-2">
            Plan not found.
          </span>
        </div>
      )}

      {/* Saved plan card */}
      {!loading && plan && (
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
                <span className="text-apricot">✶</span>{" "}
                {new Date(plan.created_at).toLocaleDateString()}
              </div>
              <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
                {plan.name} <span className="text-persimmon">plan</span>.
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-2 leading-[1.5]">
                {plan.recipes.length} recipes
              </p>
            </div>
          </div>

          {/* Expandable recipe rows */}
          {visibleRecipes.map((recipe) => (
            <ExpandableRecipe
              key={recipe.id}
              name={recipe.name}
              meta={recipe.meta}
              detail={recipe.detail}
              onRemove={() => handleRemove(recipe.id)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
