import { useState } from "react";

interface ChatInputProps {
  placeholder: string;
  hint?: string;
  onSend: (message: string) => void;
  defaultValue?: string;
}

export function ChatInput({ placeholder, hint, onSend, defaultValue = "" }: ChatInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [prevDefault, setPrevDefault] = useState(defaultValue);

  // Adjust state during render when defaultValue changes (supported React pattern).
  // If the input is currently empty, adopt the new default.
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue);
    if (!value) {
      setValue(defaultValue);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      onSend(value.trim());
      setValue("");
    }
  }

  function handleSendClick() {
    if (value.trim()) {
      onSend(value.trim());
      setValue("");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mx-3.5 mt-1 px-4 py-[13px] bg-paper rounded-md">
        <span className="text-[18px] text-ink-3 shrink-0" aria-hidden="true">›</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 border-none bg-transparent outline-none font-sans text-[13px] text-ink placeholder:text-ink-3"
          aria-label={placeholder}
        />
        {value.trim() && (
          <button
            type="button"
            onClick={handleSendClick}
            aria-label="Send message"
            className="text-ink-3 hover:text-ink shrink-0 text-sm font-semibold transition-colors"
          >
            ↵
          </button>
        )}
      </div>
      {hint && (
        <div className="px-3.5 pt-1 pb-2.5 text-[10px] text-ink-3 font-medium">
          {hint}
        </div>
      )}
    </div>
  );
}
