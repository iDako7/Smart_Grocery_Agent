import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { ChecklistRow } from "@/components/checklist-row";
import { StoreSection } from "@/components/store-section";
import { Toast } from "@/components/toast";
import { useScenario } from "@/context/scenario-context";

type ListItem = {
  id: string;
  name: string;
  subtitle: string;
  store: "costco" | "market";
};

export function SavedGroceryListScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenario } = useScenario();
  const { name, savedDate, items: INITIAL_ITEMS } = scenario.savedGroceryList;
  const [items, setItems] = useState<ListItem[]>(INITIAL_ITEMS);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [addCostco, setAddCostco] = useState("");
  const [addMarket, setAddMarket] = useState("");

  function handleToggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleAddCostco() {
    const val = addCostco.trim();
    if (!val) return;
    setItems((prev) => [
      ...prev,
      { id: `costco-${crypto.randomUUID()}`, name: val, subtitle: "", store: "costco" },
    ]);
    setAddCostco("");
  }

  async function handleCopyToNotes() {
    const text = items.map((item) => `[ ] ${item.name}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access denied — silently degrade
    }
  }

  function handleAddMarket() {
    const val = addMarket.trim();
    if (!val) return;
    setItems((prev) => [
      ...prev,
      { id: `market-${crypto.randomUUID()}`, name: val, subtitle: "", store: "market" },
    ]);
    setAddMarket("");
  }

  const costcoItems = items.filter((i) => i.store === "costco");
  const marketItems = items.filter((i) => i.store === "market");

  return (
    <div data-testid="screen-saved-grocery-list" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button type="button" aria-label="Go back" onClick={() => navigate("/")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <span className="text-[11px] font-semibold text-ink-2">SGA</span>
        {/* spacer for alignment */}
        <div aria-hidden="true" className="min-w-[36px]" />
      </div>

      {/* Saved toast — only shown when arriving via the Save list button */}
      {(location.state as { justSaved?: boolean } | null)?.justSaved && <Toast message="Saved!" />}

      {/* Header card */}
      <div className="mx-3.5 my-2.5 px-5 py-[18px] bg-paper rounded-2xl relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-5 -right-5 w-[110px] h-[110px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-jade-soft) 0%, transparent 70%)",
            opacity: 0.45,
          }}
        />
        <div className="relative z-[1]">
          <div className="inline-flex items-center gap-1.5 bg-shoyu text-cream px-[11px] py-[5px] rounded-full text-[10px] font-semibold tracking-[0.04em] mb-2.5">
            <span className="text-apricot">✶</span> {savedDate}
          </div>
          <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
            {name} <span className="text-persimmon">list</span>.
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">{items.length} items · {new Set(items.map((i) => i.store)).size} stores</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 px-3.5 pb-2">
        <button
          type="button"
          onClick={handleCopyToNotes}
          className="bg-paper border border-cream-deep rounded-full px-4 py-2 text-[11px] font-semibold text-ink cursor-pointer min-h-[36px]"
        >
          Copy to Notes
        </button>
      </div>

      {/* Costco section */}
      <StoreSection storeName="COSTCO">
        {costcoItems.map((item) => (
          <ChecklistRow
            key={item.id}
            id={item.id}
            name={item.name}
            subtitle={item.subtitle || undefined}
            checked={checked.has(item.id)}
            onToggle={handleToggle}
            onRemove={handleRemove}
          />
        ))}
        {/* Add row inside Costco */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-t-[0.5px] border-t-dashed border-t-cream-deep bg-tofu min-h-[44px] rounded-b-[10px]">
          <input
            type="text"
            value={addCostco}
            onChange={(e) => setAddCostco(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCostco()}
            placeholder="Add to Costco..."
            className="flex-1 border-none bg-transparent outline-none font-sans text-[13px] text-ink placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={handleAddCostco}
            className="bg-shoyu text-cream border-none rounded-full px-4 py-2 text-[11px] font-semibold cursor-pointer font-sans min-h-[34px]"
          >
            Add
          </button>
        </div>
      </StoreSection>

      {/* Community Market section */}
      <StoreSection storeName="COMMUNITY MARKET">
        {marketItems.map((item) => (
          <ChecklistRow
            key={item.id}
            id={item.id}
            name={item.name}
            subtitle={item.subtitle || undefined}
            checked={checked.has(item.id)}
            onToggle={handleToggle}
            onRemove={handleRemove}
          />
        ))}
        {/* Add row inside Market */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-t-[0.5px] border-t-dashed border-t-cream-deep bg-tofu min-h-[44px] rounded-b-[10px]">
          <input
            type="text"
            value={addMarket}
            onChange={(e) => setAddMarket(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddMarket()}
            placeholder="Add to Market..."
            className="flex-1 border-none bg-transparent outline-none font-sans text-[13px] text-ink placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={handleAddMarket}
            className="bg-shoyu text-cream border-none rounded-full px-4 py-2 text-[11px] font-semibold cursor-pointer font-sans min-h-[34px]"
          >
            Add
          </button>
        </div>
      </StoreSection>

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
