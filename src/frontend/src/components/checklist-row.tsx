import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ChecklistRowProps {
  id: string;
  name: string;
  subtitle?: string;
  checked: boolean;
  onToggle: (id: string) => void;
  onRemove?: (id: string) => void;
  /**
   * Opt-in: when provided, clicking the name text enters an inline edit mode.
   * Enter/blur saves (fires onEdit with the new name), Escape cancels.
   * Screens that don't pass this prop are unaffected.
   */
  onEdit?: (id: string, newName: string) => void;
  aisle?: string;
}

export function ChecklistRow({ id, name, subtitle, checked, onToggle, onRemove, onEdit, aisle }: ChecklistRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name && onEdit) {
      onEdit(id, trimmed);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-t border-t-[0.5px] border-t-cream-deep min-h-[48px]",
        "first:border-t-0"
      )}
    >
      {/* Circular checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Toggle ${name}`}
        onClick={() => onToggle(id)}
        className={cn(
          "w-7 h-7 rounded-full border-[1.5px] shrink-0 cursor-pointer flex items-center justify-center text-[12px] font-bold text-white transition-all duration-150 min-w-[28px]",
          checked ? "bg-jade border-jade" : "bg-transparent border-cream-deep"
        )}
      >
        {checked && "✓"}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing && onEdit ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            aria-label={`Edit ${name}`}
            className="w-full border-none bg-transparent outline-none font-sans text-[13px] font-medium text-ink"
          />
        ) : (
          <div
            className={cn("text-[13px] font-medium text-ink", checked && "opacity-[0.38]", onEdit && "cursor-text")}
            onClick={() => {
              if (onEdit) {
                setDraft(name);
                setEditing(true);
              }
            }}
            role={onEdit ? "button" : undefined}
            tabIndex={onEdit ? 0 : undefined}
          >
            {name}
            {aisle && (
              <span className="inline-flex items-center px-2 py-[2px] rounded-full text-[9px] font-semibold tracking-[0.04em] uppercase bg-cream-deep text-ink-3 ml-1.5 align-middle">
                {aisle}
              </span>
            )}
          </div>
        )}
        {subtitle && (
          <div className={cn("text-[11px] text-ink-3 mt-[1px]", checked && "opacity-[0.38]")}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Remove button — only shown when onRemove is provided */}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={() => onRemove(id)}
          className="w-7 h-7 rounded-full bg-cream-deep text-ink-3 text-[10px] flex items-center justify-center cursor-pointer shrink-0 border-none hover:bg-cream transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}
