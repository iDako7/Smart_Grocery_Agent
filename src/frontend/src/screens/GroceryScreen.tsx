import { useState } from "react";
import { StepProgress } from "@/components/step-progress";
import { ChecklistRow } from "@/components/checklist-row";
import { StoreSection } from "@/components/store-section";
import { useScenario } from "@/context/scenario-context";

export function GroceryScreen() {
  const { scenario } = useScenario();
  const GROCERY_ITEMS = scenario.groceryItems;
  const AISLE_GROUPS = scenario.aisleGroups;
  const { eyebrow, deckText } = scenario.groceryHeader;
  const [view, setView] = useState<"store" | "aisle">("store");
  const [checked, setChecked] = useState<Set<string>>(new Set());

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

  const costcoItems = GROCERY_ITEMS.filter((i) => i.store === "costco");
  const marketItems = GROCERY_ITEMS.filter((i) => i.store === "market");

  return (
    <div data-testid="screen-grocery" className="min-h-screen bg-cream flex flex-col">
      {/* Status bar */}
      <div className="flex justify-between items-center px-[22px] pt-3 pb-1 text-[11px] font-semibold text-ink-2">
        <span>9:41</span>
        <span>SGA</span>
      </div>

      {/* Step progress */}
      <StepProgress currentStep={4} totalSteps={4} label="Grocery list" />

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
        <div
          aria-hidden="true"
          className="absolute -bottom-7 -left-[18px] w-[100px] h-[100px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-persimmon-soft) 0%, transparent 70%)",
            opacity: 0.35,
          }}
        />
        <div className="relative z-[1]">
          <div className="inline-flex items-center gap-1.5 bg-shoyu text-cream px-[11px] py-[5px] rounded-full text-[10px] font-semibold tracking-[0.04em] mb-2.5">
            <span className="text-apricot">✶</span> {eyebrow}
          </div>
          <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
            Your shopping <span className="text-persimmon">list</span>.
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2 leading-[1.5]">{deckText}</p>
        </div>
      </div>

      {/* Sort toggle */}
      <div className="flex mx-3.5 mb-2 bg-cream-deep rounded-full p-[3px]">
        <button
          type="button"
          onClick={() => setView("store")}
          className={`flex-1 py-[7px] text-center text-[11px] font-semibold rounded-full cursor-pointer border-none font-sans min-h-[34px] transition-all ${
            view === "store"
              ? "bg-paper text-ink shadow-sm"
              : "bg-transparent text-ink-3"
          }`}
        >
          By store
        </button>
        <button
          type="button"
          onClick={() => setView("aisle")}
          className={`flex-1 py-[7px] text-center text-[11px] font-semibold rounded-full cursor-pointer border-none font-sans min-h-[34px] transition-all ${
            view === "aisle"
              ? "bg-paper text-ink shadow-sm"
              : "bg-transparent text-ink-3"
          }`}
        >
          By aisle
        </button>
      </div>

      {/* Store view */}
      {view === "store" && (
        <>
          <StoreSection storeName="COSTCO">
            {costcoItems.map((item) => (
              <ChecklistRow
                key={item.id}
                id={item.id}
                name={item.name}
                subtitle={item.subtitle}
                aisle={item.aisle}
                checked={checked.has(item.id)}
                onToggle={handleToggle}
              />
            ))}
          </StoreSection>
          <StoreSection storeName="COMMUNITY MARKET">
            {marketItems.map((item) => (
              <ChecklistRow
                key={item.id}
                id={item.id}
                name={item.name}
                subtitle={item.subtitle}
                aisle={item.aisle}
                checked={checked.has(item.id)}
                onToggle={handleToggle}
              />
            ))}
          </StoreSection>
        </>
      )}

      {/* Aisle view */}
      {view === "aisle" && (
        <>
          {AISLE_GROUPS.map((group) => {
            const items = GROCERY_ITEMS.filter((i) => i.aisle === group.aisle);
            return (
              <StoreSection
                key={group.aisle}
                storeName={group.name.toUpperCase()}
                variant="aisle"
                storeHint={group.hint}
              >
                {items.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    subtitle={item.subtitle}
                    checked={checked.has(item.id)}
                    onToggle={handleToggle}
                  />
                ))}
              </StoreSection>
            );
          })}
        </>
      )}

      {/* Save list button */}
      <button
        type="button"
        className="mx-3.5 mt-1.5 mb-3 py-[13px] bg-shoyu text-cream border-none rounded-md font-sans text-[13px] font-semibold cursor-pointer min-h-[44px]"
      >
        Save list
      </button>

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
