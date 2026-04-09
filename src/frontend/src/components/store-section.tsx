import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StoreSectionProps {
  storeName: string;
  children: ReactNode;
  variant?: "default" | "aisle";
  storeHint?: string;
}

export function StoreSection({
  storeName,
  children,
  variant = "default",
  storeHint,
}: StoreSectionProps) {
  return (
    <div className="mx-3.5 mb-2.5">
      {/* Section header */}
      <div
        className={cn(
          "px-4 py-[7px] rounded-t-[10px] text-[10px] font-bold tracking-[0.14em] uppercase",
          variant === "default" && "bg-cream-deep text-ink-3",
          variant === "aisle" && "bg-jade-soft text-jade flex items-center gap-1.5"
        )}
      >
        {storeName}
        {variant === "aisle" && storeHint && (
          <span className="text-[9px] font-medium text-ink-3 normal-case tracking-normal ml-auto">
            {storeHint}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="bg-paper rounded-b-[10px]">
        {children}
      </div>
    </div>
  );
}
