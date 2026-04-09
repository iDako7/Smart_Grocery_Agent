import { cn } from "@/lib/utils";

interface PcvBadgeProps {
  category: string;
  status: "ok" | "warn" | "gap";
}

const statusConfig = {
  ok: {
    badge: "bg-jade-soft text-jade",
    icon: "bg-jade",
    symbol: "✓",
  },
  warn: {
    badge: "bg-apricot/30 text-ink-2",
    icon: "bg-apricot",
    symbol: "~",
  },
  gap: {
    badge: "bg-persimmon-soft text-persimmon",
    icon: "bg-persimmon",
    symbol: "!",
  },
} as const;

export function PcvBadge({ category, status }: PcvBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] px-3 py-[5px] rounded-full text-[11px] font-semibold",
        config.badge
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] font-bold text-white shrink-0",
          config.icon,
          status === "warn" && "text-ink"
        )}
      >
        {config.symbol}
      </span>
      {category}
    </span>
  );
}
