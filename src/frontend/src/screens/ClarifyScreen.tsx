import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import { StepProgress } from "@/components/step-progress";
import { PcvBadge } from "@/components/pcv-badge";
import { ChatInput } from "@/components/chat-input";
import { InfoSheet } from "@/components/info-sheet";
import { useScenario } from "@/context/scenario-context";

const COOKING_SETUP_OPTIONS = [
  "Outdoor grill",
  "Oven",
  "Stovetop",
  "All of the above",
];

const DIETARY_OPTIONS = ["None", "Halal", "Vegetarian", "Gluten-free"];

const PCV_INFO = {
  name: "How PCV analysis works",
  flavorTags: ["Protein", "Carb", "Veggie"],
  description:
    "We check your ingredients across three categories to find structural gaps in your meal plan. Protein — meats, fish, tofu, beans. Carb — rice, bread, noodles, potatoes. Veggie — fresh produce, greens, roots. Sauce is tracked internally but shown only in the grocery list.",
};

export function ClarifyScreen() {
  const navigate = useNavigate();
  const { scenario } = useScenario();
  const { pcsv, deckText, summaryText } = scenario.clarify;
  const [selectedSetup, setSelectedSetup] = useState<string[]>([
    "Outdoor grill",
  ]);
  const [selectedDiet, setSelectedDiet] = useState<string[]>(["None"]);
  const [pcvInfoOpen, setPcvInfoOpen] = useState(false);

  function toggleOption(
    option: string,
    selected: string[],
    setSelected: (v: string[]) => void
  ) {
    setSelected(
      selected.includes(option)
        ? selected.filter((o) => o !== option)
        : [...selected, option]
    );
  }

  return (
    <div data-testid="screen-clarify" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate("/")}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-[11px] font-semibold text-ink-2">SGA</span>
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
      <StepProgress currentStep={2} totalSteps={4} label="Clarify" />

      {/* Clarify card */}
      <div className="mx-3.5 my-2.5 bg-paper rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-[18px] pb-3.5 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute -top-6 -right-6 w-[130px] h-[130px] rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, var(--color-jade-soft) 0%, transparent 70%)",
              opacity: 0.55,
            }}
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-[30px] -left-5 w-[100px] h-[100px] rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, var(--color-persimmon-soft) 0%, transparent 70%)",
              opacity: 0.4,
            }}
          />
          <div className="relative z-[1]">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-1.5 bg-shoyu text-cream px-[11px] py-[5px] rounded-full text-[10px] font-semibold tracking-[0.04em] mb-2.5">
              <span className="text-apricot">✶</span> Your ingredients
            </div>

            {/* Heading */}
            <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
              Here's what I <span className="text-persimmon">see</span>.
            </h1>

            {/* Deck */}
            <p className="mt-1.5 text-[13px] text-ink-2 leading-[1.5]">
              {deckText}
            </p>

            {/* PCV badges */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <PcvBadge category="Protein" status={pcsv.protein.status === "ok" ? "ok" : pcsv.protein.status === "low" ? "warn" : "gap"} />
              <PcvBadge category="Carb" status={pcsv.carb.status === "ok" ? "ok" : pcsv.carb.status === "low" ? "warn" : "gap"} />
              <PcvBadge category="Veggie" status={pcsv.veggie.status === "ok" ? "ok" : pcsv.veggie.status === "low" ? "warn" : "gap"} />
            </div>

            {/* PCV summary */}
            <div className="mt-2 text-[12px] text-ink-2 leading-[1.45] flex items-start gap-1.5 relative">
              <span>
                {summaryText}
              </span>
              <button
                type="button"
                aria-label="PCV info"
                onClick={() => setPcvInfoOpen(true)}
                className="w-4 h-4 rounded-full bg-cream-deep text-ink-3 text-[9px] font-bold border-none cursor-pointer shrink-0 mt-[1px] inline-flex items-center justify-center"
              >
                ?
              </button>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="px-5 pt-3">
          <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-ink-3 mb-2">
            A few quick questions
          </div>

          {/* Cooking setup */}
          <div className="mb-2.5">
            <div className="text-[12px] font-medium text-ink mb-1.5">
              What's your cooking setup?
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COOKING_SETUP_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    toggleOption(opt, selectedSetup, setSelectedSetup)
                  }
                  className={`px-4 py-2 rounded-full text-[11px] font-semibold cursor-pointer min-h-[34px] flex items-center border-none transition-colors ${
                    selectedSetup.includes(opt)
                      ? "bg-shoyu text-cream"
                      : "bg-cream-deep text-ink"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Dietary restrictions */}
          <div className="mb-3">
            <div className="text-[12px] font-medium text-ink mb-1.5">
              Any dietary restrictions?
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DIETARY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    toggleOption(opt, selectedDiet, setSelectedDiet)
                  }
                  className={`px-4 py-2 rounded-full text-[11px] font-semibold cursor-pointer min-h-[34px] flex items-center border-none transition-colors ${
                    selectedDiet.includes(opt)
                      ? "bg-shoyu text-cream"
                      : "bg-cream-deep text-ink"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat input */}
        <ChatInput
          placeholder="I also have kimchi, forgot to mention..."
          hint="Add details or corrections"
          onSend={() => {}}
        />

        {/* Action */}
        <div className="px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={() => navigate("/recipes")}
            className="px-6 py-[11px] bg-shoyu text-cream border-none rounded-full font-sans text-[13px] font-semibold cursor-pointer"
          >
            Looks good, show recipes →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>

      {/* PCV info sheet */}
      <InfoSheet
        open={pcvInfoOpen}
        onClose={() => setPcvInfoOpen(false)}
        name={PCV_INFO.name}
        flavorTags={PCV_INFO.flavorTags}
        description={PCV_INFO.description}
      />
    </div>
  );
}
