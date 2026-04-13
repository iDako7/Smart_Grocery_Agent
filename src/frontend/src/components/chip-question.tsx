import type { ClarifyQuestion } from "@/types/sse";

export interface ChipQuestionProps {
  question: ClarifyQuestion;
  selected: string[]; // array of selected option labels
  onChange: (selected: string[]) => void;
  disabled?: boolean; // optional — controls whether chips are clickable
}

export function ChipQuestion({
  question,
  selected,
  onChange,
  disabled = false,
}: ChipQuestionProps) {
  function handleChipClick(label: string) {
    if (disabled) return;

    if (question.selection_mode === "single") {
      // Toggle: clicking the selected chip deselects it; clicking another selects only it
      if (selected.includes(label)) {
        onChange([]);
      } else {
        onChange([label]);
      }
      return;
    }

    // Multi mode
    const clickedOption = question.options.find((o) => o.label === label);
    const isExclusive = clickedOption?.is_exclusive ?? false;

    if (selected.includes(label)) {
      // Clicking an already-selected chip toggles it off
      onChange(selected.filter((s) => s !== label));
    } else if (isExclusive) {
      // Exclusive option clears all others
      onChange([label]);
    } else {
      // Non-exclusive: add this option, but remove any exclusive options
      const exclusiveLabels = new Set(
        question.options.filter((o) => o.is_exclusive).map((o) => o.label)
      );
      const newSelected = selected.filter((s) => !exclusiveLabels.has(s));
      onChange([...newSelected, label]);
    }
  }

  // Sanitize label to create a safe testid segment (replace spaces with dashes, etc.)
  function chipTestId(label: string) {
    return `chip-${question.id}-${label}`;
  }

  return (
    <div>
      {/* Question text label */}
      <div className="text-[12px] font-medium text-ink mb-1.5">
        {question.text}
      </div>

      {/* Chip buttons */}
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt) => {
          const isSelected = selected.includes(opt.label);
          return (
            <button
              key={opt.label}
              type="button"
              data-testid={chipTestId(opt.label)}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => handleChipClick(opt.label)}
              className={[
                "px-[14px] py-[7px] rounded-full text-[12px] font-semibold border cursor-pointer transition-colors duration-120",
                isSelected
                  ? "bg-shoyu text-cream border-shoyu"
                  : "bg-paper text-ink border-cream-deep hover:bg-cream-deep",
                disabled ? "opacity-50 pointer-events-none" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
