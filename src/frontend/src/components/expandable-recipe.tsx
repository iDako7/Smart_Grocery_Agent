import { useState } from "react";
import { cn } from "@/lib/utils";

interface ExpandableRecipeProps {
  name: string;
  meta: string;
  detail: string;
  onRemove?: () => void;
}

export function ExpandableRecipe({ name, meta, detail, onRemove }: ExpandableRecipeProps) {
  const [open, setOpen] = useState(false);

  function handleToggle() {
    setOpen((prev) => !prev);
  }

  return (
    <div className="border-t border-t-[0.5px] border-t-cream-deep first:border-t-0">
      {/* Row */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-[18px] py-3.5 transition-colors",
          open && "bg-tofu"
        )}
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer bg-transparent border-none p-0 text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-ink">{name}</div>
            <div className="text-[11px] text-ink-3 mt-0.5">{meta}</div>
          </div>
          {/* Chevron */}
          <div
            aria-hidden="true"
            className={cn(
              "text-[14px] text-ink-3 shrink-0 w-7 h-7 flex items-center justify-center transition-transform duration-[180ms]",
              open && "rotate-180"
            )}
          >
            ▾
          </div>
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="w-7 h-7 rounded-full bg-cream-deep text-ink-3 text-[10px] flex items-center justify-center cursor-pointer shrink-0 border-none hover:bg-cream transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* Detail block */}
      {open && (
        <div className="font-mono text-[11.5px] leading-[1.7] text-ink-2 whitespace-pre-wrap bg-tofu px-5 py-4 border-t border-t-[0.5px] border-t-cream-deep">
          {detail}
        </div>
      )}
    </div>
  );
}
