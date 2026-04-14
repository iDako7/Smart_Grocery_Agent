import { useEffect, useRef } from "react";
import type { RecipeSummary } from "@/types/tools";

interface SwapPanelProps {
  alternatives: RecipeSummary[];
  lang: "en" | "zh";
  onPick: (alt: RecipeSummary) => void;
  onClose: () => void;
}

export function SwapPanel({ alternatives, lang, onPick, onClose }: SwapPanelProps) {
  const firstPickRef = useRef<HTMLButtonElement>(null);

  // Esc key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus first alternative button on mount
  useEffect(() => {
    if (alternatives.length > 0) {
      firstPickRef.current?.focus();
    }
  }, [alternatives.length]);

  if (alternatives.length === 0) {
    return (
      <div
        data-testid="swap-panel"
        className="mx-3.5 mb-2.5 px-4 py-3.5 rounded-lg"
        style={{ background: "linear-gradient(165deg, var(--color-apricot) 0%, var(--color-persimmon-soft) 100%)" }}
      >
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-[10px] font-bold text-shoyu tracking-[0.15em] uppercase">
            TRY INSTEAD
          </span>
        </div>
        <div className="bg-tofu rounded-md px-3.5 py-3 text-[12px] text-ink-3 font-medium">
          No alternatives available
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2.5 w-full pt-2.5 pb-0.5 px-1 text-[11px] text-shoyu font-medium cursor-pointer bg-transparent border-none"
        >
          <span
            aria-hidden="true"
            className="w-3.5 h-3.5 rounded-full border-[1.5px] border-shoyu inline-block shrink-0"
          />
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="swap-panel"
      className="mx-3.5 mb-2.5 px-4 py-3.5 rounded-lg"
      style={{ background: "linear-gradient(165deg, var(--color-apricot) 0%, var(--color-persimmon-soft) 100%)" }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[10px] font-bold text-shoyu tracking-[0.15em] uppercase">
          TRY INSTEAD
        </span>
      </div>

      {/* Alt cards */}
      {alternatives.map((alt, i) => (
        <div
          key={alt.id}
          className="bg-tofu rounded-md px-3.5 py-3 mb-2 flex justify-between items-center gap-2.5 last:mb-0"
        >
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14px] leading-tight text-ink tracking-tight">
              {alt.name}
            </div>
            {alt.name_zh && lang === "zh" && (
              <div lang="zh" className="font-cjk text-[11px] text-ink-3 font-medium mt-0.5">
                {alt.name_zh}
              </div>
            )}
            <div className="mt-1 text-[10.5px] text-ink-3 font-medium flex flex-wrap gap-1">
              <span className="bg-cream-deep rounded-full px-2 py-[2px]">{alt.cuisine}</span>
              <span className="bg-cream-deep rounded-full px-2 py-[2px]">{alt.cooking_method}</span>
              <span className="bg-cream-deep rounded-full px-2 py-[2px]">{alt.effort_level}</span>
              {alt.flavor_tags.map((tag) => (
                <span key={tag} className="bg-cream-deep rounded-full px-2 py-[2px]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button
            ref={i === 0 ? firstPickRef : undefined}
            type="button"
            onClick={() => onPick(alt)}
            aria-label={`Pick ${alt.name}`}
            className="bg-shoyu text-cream border-none rounded-full w-[34px] h-[34px] shrink-0 cursor-pointer text-[14px] font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            →
          </button>
        </div>
      ))}

      {/* Close row */}
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-2.5 w-full pt-2.5 pb-0.5 px-1 text-[11px] text-shoyu font-medium cursor-pointer bg-transparent border-none"
      >
        <span
          aria-hidden="true"
          className="w-3.5 h-3.5 rounded-full border-[1.5px] border-shoyu inline-block shrink-0"
        />
        or keep the original
      </button>
    </div>
  );
}
