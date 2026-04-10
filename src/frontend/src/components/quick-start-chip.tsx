interface QuickStartChipProps {
  label: string;
  onClick: () => void;
}

export function QuickStartChip({ label, onClick }: QuickStartChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-paper border border-cream-deep rounded-full px-[18px] py-2.5 text-[12px] font-semibold text-ink cursor-pointer min-h-[40px] flex items-center hover:bg-cream-deep transition-colors duration-120"
    >
      {label}
    </button>
  );
}
