import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import Markdown from "react-markdown";

import { StepProgress } from "@/components/step-progress";
import { PcvBadge } from "@/components/pcv-badge";
import { ChatInput } from "@/components/chat-input";
import { InfoSheet } from "@/components/info-sheet";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmResetDialog } from "@/components/confirm-reset-dialog";
import { useSessionOptional } from "@/context/session-context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKING_SETUP_OPTIONS = [
  "Outdoor grill",
  "Oven",
  "Stovetop",
  "All of the above",
] as const;

const DIETARY_OPTIONS = [
  "None",
  "Halal",
  "Vegetarian",
  "Vegan",
  "Gluten-free",
] as const;

const INDIVIDUAL_SETUP_OPTIONS = COOKING_SETUP_OPTIONS.filter(
  (o) => o !== "All of the above"
);

const PCV_INFO = {
  name: "How PCV analysis works",
  flavorTags: ["Protein", "Carb", "Veggie"],
  description:
    "We check your ingredients across three categories to find structural gaps in your meal plan. Protein — meats, fish, tofu, beans. Carb — rice, bread, noodles, potatoes. Veggie — fresh produce, greens, roots. Sauce is tracked internally but shown only in the grocery list.",
};

// ---------------------------------------------------------------------------
// PCSVStatus → PcvBadge status mapping
// ---------------------------------------------------------------------------

function pcsvStatusToBadge(status: "ok" | "low" | "gap"): "ok" | "warn" | "gap" {
  if (status === "ok") return "ok";
  if (status === "low") return "warn";
  return "gap";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClarifyScreen() {
  const navigate = useNavigate();
  const session = useSessionOptional();

  const sendMessage = session?.sendMessage ?? (() => {});
  const navigateToScreen = session?.navigateToScreen;
  const screenData = session?.screenData;
  const screenState = session?.screenState ?? "idle";
  const isComplete = session?.isComplete ?? false;
  const resetSession = session?.resetSession;

  // Chip state — empty start, no defaults
  const [selectedSetup, setSelectedSetup] = useState<string[]>([]);
  const [selectedDiet, setSelectedDiet] = useState<string[]>([]);
  const [pcvInfoOpen, setPcvInfoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  function handleStartOver() {
    resetSession?.();
    navigate("/");
  }

  // ---------------------------------------------------------------------------
  // Derived rendering flags
  // ---------------------------------------------------------------------------

  const hasRealData = screenData?.pcsv != null;
  const isLoading = screenState === "loading";
  const isError = screenState === "error";
  const isStreaming = screenState === "streaming";

  // Show PCV content only when we have real data from the SSE stream
  const showPcv = hasRealData;

  // ---------------------------------------------------------------------------
  // Chip toggle handlers (lifted from pre-deletion file, initial state changed)
  // ---------------------------------------------------------------------------

  function toggleSetup(option: string) {
    setSelectedSetup((prev) => {
      if (option === "All of the above") {
        if (prev.includes("All of the above")) {
          return [];
        }
        return [...INDIVIDUAL_SETUP_OPTIONS, "All of the above"];
      }
      const toggled = prev.includes(option)
        ? prev.filter((o) => o !== option)
        : [...prev.filter((o) => o !== "All of the above"), option];
      // Auto-select "All of the above" if all individual options are selected
      const allIndividualSelected = INDIVIDUAL_SETUP_OPTIONS.every((o) =>
        toggled.includes(o)
      );
      if (allIndividualSelected) {
        return [...toggled, "All of the above"];
      }
      return toggled.filter((o) => o !== "All of the above");
    });
  }

  function toggleDiet(option: string) {
    setSelectedDiet((prev) => {
      if (option === "None") {
        // None is exclusive — selecting it clears everything else
        if (prev.includes("None")) {
          return [];
        }
        return ["None"];
      }
      const withoutNone = prev.filter((o) => o !== "None");
      const toggled = withoutNone.includes(option)
        ? withoutNone.filter((o) => o !== option)
        : [...withoutNone, option];
      return toggled;
    });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleLooksGood() {
    const resolvedSetup = selectedSetup.includes("All of the above")
      ? INDIVIDUAL_SETUP_OPTIONS
      : selectedSetup.filter((o) => o !== "All of the above");
    const setup = resolvedSetup.join(", ");
    const diet = selectedDiet.filter((d) => d !== "None").join(", ");
    const setupClause = setup ? ` Setup: ${setup}.` : "";
    const dietClause = diet ? ` Dietary: ${diet}.` : "";
    const msg = `Looks good, show recipes.${setupClause}${dietClause}`;
    navigateToScreen?.("recipes");
    sendMessage(msg);
    navigate("/recipes");
  }

  function handleRetry() {
    sendMessage("retry");
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div data-testid="screen-clarify" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => setResetOpen(true)}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-[11px] font-semibold text-ink-2">Clarify</span>
        {/* Right spacer to balance nav bar */}
        <div className="min-w-[36px]" aria-hidden="true" />
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
              Here&apos;s what I <span className="text-persimmon">see</span>.
            </h1>

            {/* Loading skeleton — shown while waiting for first SSE event */}
            {isLoading && (
              <div
                data-testid="clarify-loading-skeleton"
                role="status"
                aria-label="Thinking…"
                className="mt-3 space-y-2"
              >
                <div className="h-3 bg-cream-deep rounded animate-pulse w-4/5" />
                <div className="h-3 bg-cream-deep rounded animate-pulse w-3/5" />
                <div className="h-3 bg-cream-deep rounded animate-pulse w-2/3" />
              </div>
            )}

            {/* PCV badges — shown only when pcsv_update has arrived */}
            {showPcv && screenData?.pcsv && (
              <>
                {/* PCV badges */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <PcvBadge
                    category="Protein"
                    status={pcsvStatusToBadge(screenData.pcsv.protein.status)}
                  />
                  <PcvBadge
                    category="Carb"
                    status={pcsvStatusToBadge(screenData.pcsv.carb.status)}
                  />
                  <PcvBadge
                    category="Veggie"
                    status={pcsvStatusToBadge(screenData.pcsv.veggie.status)}
                  />
                  <button
                    type="button"
                    aria-label="PCV info"
                    onClick={() => setPcvInfoOpen(true)}
                    className="w-4 h-4 rounded-full bg-cream-deep text-ink-3 text-[9px] font-bold border-none cursor-pointer shrink-0 mt-[1px] inline-flex items-center justify-center self-center"
                  >
                    ?
                  </button>
                </div>
              </>
            )}

            {/* Explanation — rendered with markdown; shown when text is available */}
            {screenData?.explanation && (
              <div className="mt-2 text-[13px] text-ink-2 leading-[1.5]">
                <Markdown
                  allowedElements={["p", "strong", "em", "ul", "ol", "li", "a"]}
                  unwrapDisallowed
                >
                  {screenData.explanation}
                </Markdown>
              </div>
            )}
          </div>
        </div>

        {/* Error banner — shown when in error state */}
        {isError && screenData?.error && (
          <div className="px-5 py-4">
            <ErrorBanner message={screenData.error} onRetry={handleRetry} />
          </div>
        )}

        {/* Partial completion banner */}
        {isComplete && screenData?.completionStatus === "partial" && (
          <div className="px-5 pt-3">
            <ErrorBanner
              message="Some results may be incomplete"
              variant="partial"
            />
          </div>
        )}

        {/* Quick questions chip section */}
        <div className="px-5 pt-3">
          <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-ink-3 mb-2">
            A few quick questions
          </div>

          {/* Cooking setup */}
          <div className="mb-2.5">
            <div className="text-[12px] font-medium text-ink mb-1.5">
              What&apos;s your cooking setup?
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COOKING_SETUP_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={selectedSetup.includes(opt)}
                  disabled={screenState === "loading"}
                  onClick={() => toggleSetup(opt)}
                  className={`px-4 py-2 rounded-full text-[11px] font-semibold cursor-pointer min-h-[34px] flex items-center border-none transition-colors disabled:opacity-50 disabled:pointer-events-none ${
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
                  aria-pressed={selectedDiet.includes(opt)}
                  disabled={screenState === "loading"}
                  onClick={() => toggleDiet(opt)}
                  className={`px-4 py-2 rounded-full text-[11px] font-semibold cursor-pointer min-h-[34px] flex items-center border-none transition-colors disabled:opacity-50 disabled:pointer-events-none ${
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

        {/* Thinking message — shown during loading/streaming when available */}
        {(isLoading || isStreaming) && screenData?.thinkingMessage && (
          <div className="px-5 py-2 text-[12px] text-ink-2 italic">
            {screenData.thinkingMessage}
          </div>
        )}

        {/* Chat input */}
        <ChatInput
          placeholder="I also have kimchi, forgot to mention…"
          hint="Add details or corrections"
          onSend={(text) => sendMessage(text)}
        />

        {/* Looks good CTA */}
        <div className="px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={handleLooksGood}
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

      {/* Confirm reset dialog — opens on back button click */}
      <ConfirmResetDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={handleStartOver}
      />

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
