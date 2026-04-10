import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface SidebarItem {
  id: string;
  name: string;
  meta: string;
}

export type SidebarItemType = "plan" | "recipe" | "list";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  mealPlans: SidebarItem[];
  savedRecipes: SidebarItem[];
  groceryLists: SidebarItem[];
  onItemClick?: (id: string, type: SidebarItemType) => void;
}

interface SectionProps {
  title: string;
  items: SidebarItem[];
  type: SidebarItemType;
  onItemClick?: (id: string, type: SidebarItemType) => void;
}

function SidebarSection({ title, items, type, onItemClick }: SectionProps) {
  return (
    <div className="pt-3 pb-1 border-t border-t-cream-deep">
      <div className="px-5 pb-2 text-[10px] font-bold tracking-[0.12em] uppercase text-ink-3">
        {title}
      </div>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onItemClick?.(item.id, type)}
          className="block w-full text-left px-5 py-2.5 cursor-pointer min-h-[44px] hover:bg-cream transition-colors bg-transparent border-none"
        >
          <span className="block text-[14px] font-semibold text-ink">{item.name}</span>
          <span className="block text-[11px] text-ink-3 mt-0.5">{item.meta}</span>
        </button>
      ))}
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
  mealPlans,
  savedRecipes,
  groceryLists,
  onItemClick,
}: SidebarProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="bg-paper p-0 w-[280px] max-w-[280px] overflow-y-auto"
      >
        <SheetHeader className="flex flex-row items-center justify-between px-5 pt-5 pb-3.5 border-b border-b-cream-deep gap-0">
          <SheetTitle className="text-[16px] font-bold text-ink font-sans">
            Smart Grocery
          </SheetTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="text-[18px] text-ink-3 cursor-pointer p-2 min-w-[36px] min-h-[36px] flex items-center justify-center hover:text-ink transition-colors"
          >
            ✕
          </button>
        </SheetHeader>

        <SidebarSection title="Meal plans" items={mealPlans} type="plan" onItemClick={onItemClick} />
        <SidebarSection title="Saved recipes" items={savedRecipes} type="recipe" onItemClick={onItemClick} />
        <SidebarSection title="Grocery lists" items={groceryLists} type="list" onItemClick={onItemClick} />
      </SheetContent>
    </Sheet>
  );
}
