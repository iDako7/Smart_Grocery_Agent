// ErrorBanner — reusable inline error/partial state banner.
// Soft Bento style: compact, fits within a card area.

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  variant?: "error" | "partial";
}

export function ErrorBanner({
  message,
  onRetry,
  variant = "error",
}: ErrorBannerProps) {
  const isError = variant === "error";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-[12px] font-medium ${
        isError
          ? "bg-persimmon-soft text-persimmon"
          : "bg-apricot text-ink"
      }`}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          aria-label="Try again"
          onClick={onRetry}
          className="shrink-0 px-3 py-1.5 bg-shoyu text-cream rounded-full text-[11px] font-semibold border-none cursor-pointer"
        >
          Try again
        </button>
      )}
    </div>
  );
}
