import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import Markdown from "react-markdown";

import { StepProgress } from "@/components/step-progress";
import { PcvBadge } from "@/components/pcv-badge";
import { InfoSheet } from "@/components/info-sheet";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmResetDialog } from "@/components/confirm-reset-dialog";
import { ChipQuestion } from "@/components/chip-question";
import { ChatInput } from "@/components/chat-input";
import { useSessionOptional } from "@/context/session-context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

  const [pcvInfoOpen, setPcvInfoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const prevResetOpen = useRef(false);

  // Restore focus to the back button when the dialog closes (a11y).
  useEffect(() => {
    if (prevResetOpen.current && !resetOpen) {
      backButtonRef.current?.focus();
    }
    prevResetOpen.current = resetOpen;
  }, [resetOpen]);

  function handleStartOver() {
    resetSession?.();
    navigate("/");
  }

  function updateSelection(questionId: string, newSelected: string[]) {
    setSelections((prev) => ({ ...prev, [questionId]: newSelected }));
  }

  function handleLooksGood() {
    const questions = screenData?.clarifyTurn?.questions ?? [];
    const clauses = questions
      .map((q) => {
        const sel = selections[q.id] ?? [];
        if (sel.length === 0) return null;
        return `${q.text} ${sel.join(", ")}.`;
      })
      .filter(Boolean);
    const msg =
      clauses.length > 0
        ? `Looks good, show recipes. ${clauses.join(" ")}`
        : "Looks good, show recipes.";
    navigateToScreen?.("recipes");
    sendMessage(msg);
    navigate("/recipes");
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
  // Actions
  // ---------------------------------------------------------------------------

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
          ref={backButtonRef}
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
        {/* Card header — decorative gradients always visible */}
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

          {/* Mutually exclusive: loading/streaming shows spinner; otherwise shows card content */}
          {(isLoading || isStreaming) ? (
            <div
              data-testid="clarify-loading-spinner"
              role="status"
              aria-label="Checking your ingredients for balance"
              className="flex flex-col items-center justify-center py-16 px-6 relative z-[1]"
            >
              <Loader2 className="w-8 h-8 text-persimmon animate-spin" />
              <p className="mt-3 text-[12px] text-ink-2 font-medium text-center">
                Checking your ingredients for balance…
              </p>
            </div>
          ) : (
            <div className="relative z-[1]">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-1.5 bg-shoyu text-cream px-[11px] py-[5px] rounded-full text-[10px] font-semibold tracking-[0.04em] mb-2.5">
                <span className="text-apricot">✶</span> Your ingredients
              </div>

              {/* Heading */}
              <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
                Here&apos;s what I <span className="text-persimmon">see</span>.
              </h1>

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

              {/* Explanation — rendered with markdown; shown when text is available and no clarifyTurn */}
              {screenData?.explanation && !screenData?.clarifyTurn && (
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
          )}
        </div>

        {/* The following sections are only shown when NOT in loading/streaming */}
        {!(isLoading || isStreaming) && (
          <>
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

            {/* Dynamic chip questions — shown when clarifyTurn arrives and state is complete */}
            {screenData?.clarifyTurn && screenState === "complete" && screenData.clarifyTurn.questions.length > 0 && (
              <div className="px-5 pt-3">
                <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-ink-3 mb-2">
                  A few quick questions
                </div>
                {screenData.clarifyTurn.questions.map((q) => (
                  <div key={q.id} className="mb-2.5">
                    <ChipQuestion
                      question={q}
                      selected={selections[q.id] ?? []}
                      onChange={(newSel) => updateSelection(q.id, newSel)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Chat input — visible in all non-loading states; disabled unless complete */}
            <div className="pb-3">
              <ChatInput
                placeholder="I also have kimchi, forgot to mention…"
                hint="Add details or corrections"
                onSend={(text) => sendMessage(text)}
                disabled={screenState !== "complete"}
              />
            </div>
          </>
        )}
      </div>

      {/* Looks good CTA — shown when clarifyTurn is populated and state is complete */}
      {screenData?.clarifyTurn && screenState === "complete" && (
        <div className="px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={handleLooksGood}
            className="px-6 py-[11px] bg-shoyu text-cream border-none rounded-full font-sans text-[13px] font-semibold cursor-pointer"
          >
            Looks good, show recipes →
          </button>
        </div>
      )}

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
