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
  flavorProfile: string;
  cookingMethod: string;
  time: string;
  ingredients: IngredientTag[];
  onSwap: () => void;
  onInfoClick: () => void;
  isSwapping?: boolean;
}

export function RecipeCard({
  index,
  name,
  nameCjk,
  flavorProfile,
  cookingMethod,
  time,
  ingredients,
  onSwap,
  onInfoClick,
  isSwapping = false,
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

      {/* CJK name */}
      {nameCjk && (
        <div className="font-cjk text-[12px] font-medium text-ink-3 mt-[3px] tracking-[0.02em]">
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
        {ingredients.map((ing) => (
          <span
            key={ing.name}
            className={cn(
              "text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full inline-flex items-center gap-[5px]",
              ing.have ? "bg-jade-soft text-jade" : "bg-persimmon-soft text-persimmon"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "w-[5px] h-[5px] rounded-full inline-block",
                ing.have ? "bg-jade" : "bg-persimmon"
              )}
            />
            {ing.name}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex justify-end items-center mt-3 pt-3 border-t border-cream-deep">
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
            className="bg-cream-deep text-ink border-none rounded-full px-4 py-2 text-[11px] font-semibold cursor-pointer flex items-center gap-[5px] min-h-[34px] hover:bg-cream transition-colors"
          >
            try another
            <span aria-hidden="true" className="text-[13px] leading-none">↺</span>
          </button>
        )}
      </div>
    </div>
  );
}
