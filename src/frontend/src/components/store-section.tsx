import type { ReactNode } from "react";

interface StoreSectionProps {
  storeName: string;
  children: ReactNode;
}

export function StoreSection({
  storeName,
  children,
}: StoreSectionProps) {
  return (
    <div className="mx-3.5 mb-2.5">
      {/* Section header */}
      <div className="px-4 py-[7px] rounded-t-[10px] text-[10px] font-bold tracking-[0.14em] uppercase bg-cream-deep text-ink-3">
        {storeName}
      </div>

      {/* Body */}
      <div className="bg-paper rounded-b-[10px]">
        {children}
      </div>
    </div>
  );
}
