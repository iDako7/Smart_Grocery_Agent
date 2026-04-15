import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { StoreSection } from "@/components/store-section";
import { ChecklistRow } from "@/components/checklist-row";
import { ErrorBanner } from "@/components/error-banner";
import { useSessionOptional } from "@/context/session-context";
import { saveGroceryList, saveMealPlan } from "@/services/api-client";
import type { GroceryStore } from "@/types/sse";

// ---------------------------------------------------------------------------
// Skeleton components (inline — no new file)
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div data-testid="grocery-skeleton-row" className="flex items-center gap-3 px-4 py-2.5 min-h-[48px]">
      <div className="w-7 h-7 rounded-full bg-cream-deep animate-pulse shrink-0" />
      <div className="flex-1">
        <div className="h-3 w-32 bg-cream-deep rounded animate-pulse" />
      </div>
    </div>
  );
}

function SkeletonSection() {
  return (
    <div className="mx-3.5 mb-2.5">
      <div className="px-4 py-[7px] rounded-t-[10px] h-7 bg-cream-deep animate-pulse" />
      <div className="bg-paper rounded-b-[10px]">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroceryScreen
// ---------------------------------------------------------------------------

export function GroceryScreen() {
  const session = useSessionOptional();
  const navigate = useNavigate();

  // Local state for item interactions
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  // Buy-pill: when active, only unchecked items are shown.
  // This is "shopping mode" — you see only what you still need to buy.
  const [buyPillActive, setBuyPillActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mealPlanSavedId, setMealPlanSavedId] = useState<string | null>(null);

  // Derived state from session
  const screenState = session?.screenState ?? "idle";
  const screenData = session?.screenData;
  const isComplete = session?.isComplete ?? false;
  const isStreaming = session?.isStreaming ?? false;
  const isLoading = session?.isLoading ?? false;
  const groceryList: GroceryStore[] = screenData?.groceryList ?? [];
  const error = screenData?.error ?? null;

  // Toggle checked state for an item
  function handleToggle(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Remove an item from view
  function handleRemove(id: string) {
    setRemovedIds((prev) => new Set([...prev, id]));
  }

  // Save grocery list (and meal plan on first attempt) to backend, then navigate
  async function handleSave() {
    if (isSaving || !session?.sessionId) return;
    setSaveError(null);
    setIsSaving(true);
    let planIdThisCall = mealPlanSavedId;
    try {
      if (!planIdThisCall) {
        const planResult = await saveMealPlan("My Meal Plan", session.sessionId);
        planIdThisCall = planResult.id;
        setMealPlanSavedId(planResult.id);
      }
      const listResult = await saveGroceryList("My Grocery List", session.sessionId);
      navigate(`/saved/list/${listResult.id}`, { state: { justSaved: true } });
    } catch {
      if (!planIdThisCall) {
        setSaveError("Failed to save meal plan.");
      } else {
        setSaveError("Grocery list save failed; meal plan saved. Retry grocery save.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  // Copy visible items to clipboard
  async function handleCopy() {
    const lines: string[] = [];
    for (const store of groceryList) {
      const storeLines: string[] = [];
      for (const dept of store.departments) {
        for (const item of dept.items) {
          if (!removedIds.has(item.id) && !(buyPillActive && checkedIds.has(item.id))) {
            storeLines.push(`  - ${item.name} (${item.amount})`);
          }
        }
      }
      if (storeLines.length > 0) {
        lines.push(store.store_name);
        lines.push(...storeLines);
      }
    }
    await navigator.clipboard.writeText(lines.join("\n"));
  }

  // Determine whether to show skeletons
  const showSkeletons =
    isLoading || (isStreaming && groceryList.length === 0);

  // Determine whether to show the item list
  const showItems =
    (isStreaming && groceryList.length > 0) ||
    (isComplete && groceryList.length > 0);

  // Determine whether to show empty state
  const showEmpty =
    screenState === "idle" ||
    (isComplete && groceryList.length === 0);

  // Determine whether Save CTA is enabled
  const saveEnabled = isComplete && groceryList.length > 0 && !isSaving;

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (screenState === "error") {
    return (
      <div data-testid="screen-grocery" className="min-h-screen flex flex-col">
        <div className="flex items-center justify-between px-3.5 pt-safe-top pb-3 border-b border-cream-deep">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-cream-deep cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-[14px] font-semibold text-ink">Grocery List</h1>
          <div className="w-9" />
        </div>
        <div className="px-3.5 pt-4 pb-3">
          <ErrorBanner
            message={error ?? "Something went wrong. Please try again."}
            onRetry={() => session?.sendMessage("retry")}
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div data-testid="screen-grocery" className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-safe-top pb-3 border-b border-cream-deep">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-cream-deep cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-[14px] font-semibold text-ink">Grocery List</h1>
        <div className="w-9" />
      </div>

      {/* Toolbar */}
      {showItems && (
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          {/* Buy-pill: shopping mode filter */}
          <button
            type="button"
            aria-pressed={buyPillActive}
            onClick={() => setBuyPillActive((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border-none cursor-pointer transition-colors ${
              buyPillActive
                ? "bg-jade text-white"
                : "bg-cream-deep text-ink-3"
            }`}
          >
            Hide checked
          </button>

          {/* Copy to notes */}
          <button
            type="button"
            aria-label="Copy to notes"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-full bg-cream-deep text-ink-3 text-[12px] font-semibold border-none cursor-pointer"
          >
            Copy to notes
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Save CTA */}
          <button
            type="button"
            aria-label="Save list"
            onClick={handleSave}
            disabled={!saveEnabled}
            className="px-4 py-1.5 rounded-full bg-jade text-white text-[12px] font-semibold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving…" : "Save list"}
          </button>
          {saveError && (
            <p className="text-[11px] text-persimmon mt-1 px-3.5">{saveError}</p>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Skeletons during loading / early streaming */}
        {showSkeletons && (
          <>
            <SkeletonSection />
            <SkeletonSection />
          </>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="flex items-center justify-center h-48">
            <p className="text-[13px] text-ink-3">No grocery list yet.</p>
          </div>
        )}

        {/* Item list */}
        {showItems &&
          groceryList.map((store) => (
            <StoreSection key={store.store_name} storeName={store.store_name}>
              {store.departments.map((dept) =>
                dept.items
                  .filter((item) => {
                    if (removedIds.has(item.id)) return false;
                    // Buy-pill: when active, hide checked items (shopping mode)
                    if (buyPillActive && checkedIds.has(item.id)) return false;
                    return true;
                  })
                  .map((item) => (
                    <ChecklistRow
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      subtitle={item.amount}
                      checked={checkedIds.has(item.id)}
                      onToggle={handleToggle}
                      onRemove={handleRemove}
                      aisle={dept.name}
                    />
                  ))
              )}
            </StoreSection>
          ))}
      </div>

    </div>
  );
}
