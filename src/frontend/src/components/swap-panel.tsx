interface Alternative {
  name: string;
  nameCjk?: string;
  description: string;
}

interface SwapPanelProps {
  alternatives: Alternative[];
  onPick: (index: number) => void;
  onKeepOriginal: () => void;
}

export function SwapPanel({ alternatives, onPick, onKeepOriginal }: SwapPanelProps) {
  return (
    <div
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
          key={alt.name}
          className="bg-tofu rounded-md px-3.5 py-3 mb-2 flex justify-between items-center gap-2.5 last:mb-0"
        >
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14px] leading-tight text-ink tracking-tight">
              {alt.name}
            </div>
            {alt.nameCjk && (
              <div lang="zh" className="font-cjk text-[11px] text-ink-3 font-medium mt-0.5">
                {alt.nameCjk}
              </div>
            )}
            <div className="text-[10.5px] text-ink-3 mt-[3px] font-medium">
              {alt.description}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onPick(i)}
            aria-label={`Pick ${alt.name}`}
            className="bg-shoyu text-cream border-none rounded-full w-[34px] h-[34px] shrink-0 cursor-pointer text-[14px] font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            →
          </button>
        </div>
      ))}

      {/* Keep original row */}
      <button
        type="button"
        onClick={onKeepOriginal}
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
