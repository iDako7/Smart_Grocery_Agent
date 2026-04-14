import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const ORDINALS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN"];

interface IngredientTag {
  name: string;
  have: boolean;
}

interface RecipeCardProps {
  index: number;
  name: string;
  nameCjk?: string;
  lang?: "en" | "zh";
  flavorProfile: string;
  cookingMethod: string;
  time: string;
  ingredients: IngredientTag[];
  onSwap: () => void;
  onInfoClick: () => void;
  isSwapping?: boolean;
  onToggleBuy?: (ingredientName: string) => void;
  excludedIngredients?: Set<string>;
  onRemove?: () => void;
  canRemove?: boolean;
  swapDisabled?: boolean;
}

export function RecipeCard({
  index,
  name,
  nameCjk,
  lang = "en",
  flavorProfile,
  cookingMethod,
  time,
  ingredients,
  onSwap,
  onInfoClick,
  isSwapping = false,
  onToggleBuy,
  excludedIngredients,
  onRemove,
  canRemove = false,
  swapDisabled = false,
}: RecipeCardProps) {
  const ordinal = ORDINALS[index] ?? String(index + 1);

  return (
    <div
      className={cn(
        "mx-3.5 mb-2.5 px-[18px] py-4 bg-paper rounded-lg relative",
        isSwapping && "border-2 border-dashed border-persimmon px-4 py-[14px]"
      )}
    >
      {/* Faded large number */}
      <div
        aria-hidden="true"
        className="absolute top-4 right-[18px] font-extrabold text-[28px] leading-none text-cream-deep tracking-tight select-none"
      >
        {index + 1}
      </div>

      {/* Dish label pill */}
      <div className="inline-block text-[9.5px] font-bold text-persimmon tracking-[0.12em] bg-persimmon-soft px-2 py-[3px] rounded-full mb-2">
        DISH {ordinal}
      </div>

      {/* Dish name row */}
      <div className="font-semibold text-[15px] leading-tight tracking-tight text-ink max-w-[240px]">
        {name}
        <button
          type="button"
          onClick={onInfoClick}
          aria-label={`Info about ${name}`}
          className="inline-flex w-5 h-5 rounded-full bg-cream-deep text-ink-2 text-[10px] font-bold items-center justify-center ml-[5px] align-middle cursor-pointer border-none"
        >
          i
        </button>
      </div>

      {/* CJK name — only rendered when lang is zh */}
      {nameCjk && lang === "zh" && (
        <div lang="zh" className="font-cjk text-[12px] font-medium text-ink-3 mt-[3px] tracking-[0.02em]">
          {nameCjk}
        </div>
      )}

      {/* Meta line */}
      <div className="mt-2 text-[11px] text-ink-3 flex items-center gap-1.5 font-medium flex-wrap">
        <span>{flavorProfile}</span>
        <span className="w-[3px] h-[3px] rounded-full bg-persimmon inline-block" aria-hidden="true" />
        <span>{cookingMethod}</span>
        <span className="w-[3px] h-[3px] rounded-full bg-persimmon inline-block" aria-hidden="true" />
        <span>{time}</span>
      </div>

      {/* Ingredient tags */}
      <div className="flex flex-wrap gap-[5px] mt-3">
        {ingredients.map((ing) => {
          // isChecked = ingredient is in the user's possession.
          // Starts from ing.have; flipped if the ingredient name is in excludedIngredients.
          const isFlipped = excludedIngredients?.has(ing.name) ?? false;
          const isChecked = ing.have !== isFlipped; // XOR: flip toggles the original state

          return (
            <button
              key={ing.name}
              type="button"
              onClick={() => onToggleBuy?.(ing.name)}
              aria-pressed={isChecked}
              className={cn(
                "text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full inline-flex items-center gap-[5px] border-none cursor-pointer",
                isChecked
                  ? "bg-jade-soft text-jade"
                  : "bg-persimmon-soft text-persimmon"
              )}
            >
              <span
                aria-hidden="true"
                className="text-[9px] leading-none"
              >
                {isChecked ? "✓" : "☐"}
              </span>
              {ing.name}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className={cn(
          "flex items-center mt-3 pt-3 border-t border-cream-deep",
          onRemove && canRemove && !isSwapping ? "justify-between" : "justify-end"
        )}
      >
        {onRemove && canRemove && !isSwapping && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-full bg-cream-deep text-ink-3 text-[10.5px] font-semibold border-none cursor-pointer hover:bg-cream transition-colors min-h-[30px]"
          >
            Remove
          </button>
        )}
        {isSwapping ? (
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] uppercase text-persimmon">
            <span
              aria-label="swapping indicator"
              className="w-1.5 h-1.5 rounded-full bg-persimmon inline-block animate-pulse"
            />
            SWAPPING
          </div>
        ) : (
          <button
            type="button"
            onClick={onSwap}
            disabled={swapDisabled}
            aria-disabled={swapDisabled || undefined}
            title={swapDisabled ? "Coming soon" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-[6px] rounded-full bg-cream-deep text-ink-2 text-[10.5px] font-semibold border-none min-h-[30px]",
              swapDisabled
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:bg-cream transition-colors"
            )}
          >
            <RefreshCw size={12} />
            Try another
          </button>
        )}
      </div>
    </div>
  );
}
