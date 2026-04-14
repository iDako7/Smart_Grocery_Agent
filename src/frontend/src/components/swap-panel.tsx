// SwapPanel — selector for recipe alternatives.
//
// Shows the original recipe first (labeled "Current"), then alternatives.
// Clicking any option immediately applies it and closes the panel.
// The X button (or Esc) dismisses without changing the selection.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecipeSummary } from "@/types/tools";

interface SwapPanelProps {
  original: RecipeSummary;
  selected: RecipeSummary;
  alternatives: RecipeSummary[];
  lang: "en" | "zh";
  onSelect: (recipe: RecipeSummary) => void;
  onClose: () => void;
}

export function SwapPanel({
  original,
  selected,
  alternatives,
  lang,
  onSelect,
  onClose,
}: SwapPanelProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Esc key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus the currently selected option on mount
  useEffect(() => {
    selectedRef.current?.focus();
  }, []);

  const allOptions = [original, ...alternatives];

  return (
    <div
      data-testid="swap-panel"
      className="mx-3.5 mb-2.5 px-4 py-3.5 rounded-lg"
      style={{
        background:
          "linear-gradient(165deg, var(--color-apricot) 0%, var(--color-persimmon-soft) 100%)",
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[10px] font-bold text-shoyu tracking-[0.15em] uppercase">
          TRY INSTEAD
        </span>
      </div>

      {/* Option rows — original first, then alternatives */}
      {allOptions.map((option) => {
        const isOriginal = option.id === original.id;
        const isSelected = option.id === selected.id;
        return (
          <div
            key={option.id}
            className="bg-tofu rounded-md px-3.5 py-3 mb-2 flex justify-between items-center gap-2.5 last:mb-0"
          >
            <div className="flex-1 min-w-0">
              {isOriginal && (
                <div className="text-[9px] font-bold tracking-[0.12em] uppercase text-persimmon mb-0.5">
                  Current
                </div>
              )}
              <div className="font-semibold text-[14px] leading-tight text-ink tracking-tight">
                {option.name}
              </div>
              {option.name_zh && lang === "zh" && (
                <div
                  lang="zh"
                  className="font-cjk text-[11px] text-ink-3 font-medium mt-0.5"
                >
                  {option.name_zh}
                </div>
              )}
              <div className="mt-1 text-[10.5px] text-ink-3 font-medium flex flex-wrap gap-1">
                <span className="bg-cream-deep rounded-full px-2 py-[2px]">
                  {option.cuisine}
                </span>
                <span className="bg-cream-deep rounded-full px-2 py-[2px]">
                  {option.cooking_method}
                </span>
                <span className="bg-cream-deep rounded-full px-2 py-[2px]">
                  {option.effort_level}
                </span>
              </div>
            </div>

            {/* Select button — picks option and closes panel */}
            <button
              ref={isSelected ? selectedRef : undefined}
              type="button"
              onClick={() => { onSelect(option); onClose(); }}
              aria-label={`Select ${option.name}`}
              aria-pressed={isSelected}
              className={cn(
                "shrink-0 w-[28px] h-[28px] rounded-full border-[2px] border-shoyu flex items-center justify-center cursor-pointer transition-colors",
                isSelected
                  ? "bg-shoyu text-cream border-shoyu"
                  : "bg-transparent text-shoyu hover:bg-shoyu/10"
              )}
            >
              {isSelected && (
                <span aria-hidden="true" className="text-[12px] font-bold leading-none">
                  ✓
                </span>
              )}
            </button>
          </div>
        );
      })}

      {/* Dismiss button — closes without changing selection */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex items-center gap-2 w-full pt-2.5 pb-0.5 px-1 text-[11px] text-shoyu font-medium cursor-pointer bg-transparent border-none"
      >
        <X size={13} aria-hidden="true" strokeWidth={2.5} />
        <span className="sr-only">Close</span>
      </button>
    </div>
  );
}
