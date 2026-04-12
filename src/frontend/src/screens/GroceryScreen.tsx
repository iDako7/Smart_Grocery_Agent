import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import { StepProgress } from "@/components/step-progress";
import { ChecklistRow } from "@/components/checklist-row";
import { StoreSection } from "@/components/store-section";
import { useScenario } from "@/context/scenario-context";
import { useSessionOptional } from "@/context/session-context";

export function GroceryScreen() {
  const navigate = useNavigate();
  const { scenario } = useScenario();
  const session = useSessionOptional();
  // Use session grocery data when available (from SSE grocery_list event),
  // fall back to scenario data for mock/Stage 3.
  const sessionGrocery = session?.screenData?.groceryList ?? [];
  const GROCERY_ITEMS = sessionGrocery.length > 0
    ? sessionGrocery.flatMap((store) =>
        store.departments.flatMap((dept) =>
          dept.items.map((item) => ({
            id: item.id,
            name: item.name,
            subtitle: item.amount,
            aisle: dept.name,
            store: store.store_name.toLowerCase().includes("costco")
              ? ("costco" as const)
              : ("market" as const),
          }))
        )
      )
    : scenario.groceryItems;
  const { eyebrow, deckText } = scenario.groceryHeader;
  // Bilingual toggle infrastructure — lang state will control CJK name visibility
  // once grocery items include name_zh fields from the KB. Currently a UI stub.
  const [lang, setLang] = useState<"en" | "zh">("en");
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

  function handleSave() {
    // TODO(Issue #22): POST payload to save endpoint, use returned ID for navigation.
    // Extract session?.screenData?.recipes and bundle as linked save payload:
    // { groceryStores: sessionGrocery, recipes: session?.screenData?.recipes }
    navigate("/saved/list/1", { state: { justSaved: true } });
  }

  const costcoItems = GROCERY_ITEMS.filter((i) => i.store === "costco");
  const marketItems = GROCERY_ITEMS.filter((i) => i.store === "market");

  return (
    <div data-testid="screen-grocery" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate("/recipes")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          aria-label="Toggle language"
          onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
          className="bg-paper px-[9px] py-[3px] rounded-full text-[10px] flex gap-1.5 items-center border-none cursor-pointer"
        >
          {lang === "en" ? <b className="text-ink">EN</b> : <span className="text-ink-3 font-normal">EN</span>}
          <span className="text-ink-3 font-normal">·</span>
          {lang === "zh" ? <b className="text-ink">中</b> : <span className="text-ink-3 font-normal">中</span>}
        </button>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => navigate("/")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <X size={18} />
        </button>
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

      {/* Store view — rendered unconditionally */}
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

      {/* Save list button */}
      {/* TODO(Issue #22): replace hardcoded id with real saved list id returned by POST */}
      <button
        type="button"
        onClick={handleSave}
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
