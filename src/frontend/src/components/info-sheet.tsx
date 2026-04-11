import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

interface InfoSheetProps {
  open: boolean;
  onClose: () => void;
  name: string;
  nameCjk?: string;
  flavorTags: string[];
  description: string;
}

export function InfoSheet({
  open,
  onClose,
  name,
  nameCjk,
  flavorTags,
  description,
}: InfoSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-paper px-[22px] pt-[22px] pb-9 rounded-t-lg border-0 w-full"
      >
        {/* Drag handle */}
        <div className="w-9 h-1 bg-cream-deep rounded-full mx-auto mb-[18px]" aria-hidden="true" />

        {/* Name */}
        <SheetTitle className="text-[18px] font-bold tracking-tight text-ink">{name}</SheetTitle>
        {nameCjk && (
          <p lang="zh" className="font-cjk text-[14px] font-medium text-ink-3 mt-1 tracking-[0.02em]">
            {nameCjk}
          </p>
        )}

        {/* Flavor tags */}
        {flavorTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {flavorTags.map((tag) => (
              <span
                key={tag}
                className="bg-cream-deep text-ink-2 px-3 py-[5px] rounded-full text-[10.5px] font-semibold"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        <p className="mt-3.5 text-[13px] leading-[1.55] text-ink-2">{description}</p>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="block w-full mt-5 py-3.5 bg-shoyu text-cream border-none rounded-md font-sans text-[13px] font-semibold cursor-pointer"
        >
          Close
        </button>
      </SheetContent>
    </Sheet>
  );
}
