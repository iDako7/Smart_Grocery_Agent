// recipe-info-sheet.tsx — bottom-sheet for full recipe detail (issue #57, Phase 3)
// Displays RecipeDetail fetched via getRecipeDetail() with loading / ready / error / not_found states.
// In-memory cache at module scope: same recipeId → instant render, no refetch.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/error-banner";
import { getRecipeDetail, RecipeNotFoundError } from "@/services/api-client";
import type { RecipeDetail } from "@/types/tools";
import { recipeCache } from "@/components/recipe-cache";

// ---------------------------------------------------------------------------
// Internal state machine
// ---------------------------------------------------------------------------

type SheetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; detail: RecipeDetail }
  | { status: "error" }
  | { status: "not_found" };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecipeInfoSheetProps {
  open: boolean;
  onClose: () => void;
  recipeId: string | null;
  lang: "en" | "zh";
}

// ---------------------------------------------------------------------------
// PCSV role chip
// ---------------------------------------------------------------------------

const PCSV_COLORS: Record<string, string> = {
  protein: "bg-shoyu text-cream",
  carb: "bg-apricot text-ink",
  veggie: "bg-matcha text-cream",
  sauce: "bg-cream-deep text-ink-2",
};

function PcsvChip({ role }: { role: string }) {
  return (
    <span
      className={`inline-block px-2 py-[2px] rounded-full text-[9.5px] font-semibold uppercase ${
        PCSV_COLORS[role] ?? "bg-cream-deep text-ink-2"
      }`}
    >
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecipeInfoSheet({
  open,
  onClose,
  recipeId,
  lang,
}: RecipeInfoSheetProps) {
  const [state, setState] = useState<SheetState>({ status: "idle" });

  // Track previous open+recipeId to derive state transitions during render
  // (React-approved pattern for adjusting state when props change).
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const currentKey = open && recipeId ? recipeId : null;

  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    if (!currentKey) {
      setState({ status: "idle" });
    } else if (recipeCache.has(currentKey)) {
      setState({ status: "ready", detail: recipeCache.get(currentKey)! });
    } else {
      setState({ status: "loading" });
    }
  }

  // Track current recipeId to avoid stale fetch updates
  const currentIdRef = useRef<string | null>(null);

  // fetchDetail — used by the retry button (event handler, not effect)
  const fetchDetail = useCallback((id: string) => {
    if (recipeCache.has(id)) {
      setState({ status: "ready", detail: recipeCache.get(id)! });
      return;
    }

    setState({ status: "loading" });
    currentIdRef.current = id;

    getRecipeDetail(id).then(
      (detail) => {
        if (currentIdRef.current !== id) return;
        recipeCache.set(id, detail);
        setState({ status: "ready", detail });
      },
      (err: unknown) => {
        if (currentIdRef.current !== id) return;
        const isNotFound =
          err instanceof RecipeNotFoundError ||
          (err instanceof Error && err.name === "RecipeNotFoundError");
        setState(isNotFound ? { status: "not_found" } : { status: "error" });
      }
    );
  }, []);

  // Effect: fetch non-cached recipes (no sync setState — loading state set during render above)
  useEffect(() => {
    if (!open || recipeId === null || recipeCache.has(recipeId)) return;
    currentIdRef.current = recipeId;
    let cancelled = false;

    getRecipeDetail(recipeId).then(
      (detail) => {
        if (cancelled) return;
        recipeCache.set(recipeId, detail);
        setState({ status: "ready", detail });
      },
      (err: unknown) => {
        if (cancelled) return;
        const isNotFound =
          err instanceof RecipeNotFoundError ||
          (err instanceof Error && err.name === "RecipeNotFoundError");
        setState(isNotFound ? { status: "not_found" } : { status: "error" });
      }
    );

    return () => { cancelled = true; };
  }, [open, recipeId]);

  // ---------------------------------------------------------------------------
  // Derive display values
  // ---------------------------------------------------------------------------

  const detail = state.status === "ready" ? state.detail : null;
  const primaryName =
    detail
      ? lang === "zh"
        ? (detail.name_zh ?? detail.name)
        : detail.name
      : "";
  const cjkSubtitle =
    detail && lang === "en" && detail.name_zh ? detail.name_zh : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-paper px-[22px] pt-[22px] pb-9 rounded-t-lg border-0 w-full max-h-[85dvh] overflow-y-auto"
      >
        {/* Drag handle */}
        <div
          className="w-9 h-1 bg-cream-deep rounded-full mx-auto mb-[18px]"
          aria-hidden="true"
        />

        {/* ---- Loading ---- */}
        {state.status === "loading" && (
          <div
            role="status"
            aria-label="Loading recipe details"
            className="flex items-center justify-center py-12"
          >
            {/* Simple spinner */}
            <span className="inline-block h-8 w-8 rounded-full border-4 border-cream-deep border-t-shoyu animate-spin" />
            <span className="sr-only">Loading…</span>
          </div>
        )}

        {/* ---- Not found ---- */}
        {state.status === "not_found" && (
          <p className="py-12 text-center text-[13px] text-ink-2">
            Recipe details unavailable.
          </p>
        )}

        {/* ---- Error ---- */}
        {state.status === "error" && (
          <div className="py-4">
            <ErrorBanner
              message="Could not load recipe details."
              onRetry={() => {
                if (recipeId) fetchDetail(recipeId);
              }}
            />
          </div>
        )}

        {/* ---- Ready ---- */}
        {state.status === "ready" && detail && (
          <>
            {/* Header row: name + AI badge */}
            <div className="flex items-start gap-2 flex-wrap">
              <SheetTitle className="text-[18px] font-bold tracking-tight text-ink">
                {primaryName}
              </SheetTitle>
              {detail.is_ai_generated && (
                <span className="mt-[3px] bg-apricot text-ink px-2 py-[3px] rounded-full text-[10px] font-semibold shrink-0">
                  AI-suggested
                </span>
              )}
            </div>

            {/* CJK subtitle (en mode only) */}
            {cjkSubtitle && (
              <p
                lang="zh"
                className="font-cjk text-[14px] font-medium text-ink-3 mt-1 tracking-[0.02em]"
              >
                {cjkSubtitle}
              </p>
            )}

            {/* Meta row */}
            <p className="mt-2 text-[12px] text-ink-2">
              {[
                detail.cuisine,
                detail.cooking_method,
                detail.effort_level,
                `${detail.time_minutes} min`,
                `serves ${detail.serves}`,
              ].join(" · ")}
            </p>

            {/* Flavor tags */}
            {detail.flavor_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {detail.flavor_tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-cream-deep text-ink-2 px-3 py-[5px] rounded-full text-[10.5px] font-semibold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Ingredients */}
            <section className="mt-4">
              <h3 className="text-[13px] font-semibold text-ink mb-2">
                Ingredients
              </h3>
              <ul className="space-y-2">
                {detail.ingredients.map((ing) => (
                  <li
                    key={ing.name}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-[13px] text-ink">{ing.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[12px] text-ink-2">{ing.amount}</span>
                      {ing.pcsv.map((role) => (
                        <PcsvChip key={role} role={role} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Instructions */}
            <section className="mt-4">
              <h3 className="text-[13px] font-semibold text-ink mb-2">
                Instructions
              </h3>
              <p className="text-[13px] leading-[1.55] text-ink-2 whitespace-pre-line">
                {detail.instructions}
              </p>
            </section>

            {/* Source link */}
            {detail.source_url && (
              <p className="mt-3">
                <a
                  href={detail.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-shoyu underline"
                >
                  View source
                </a>
              </p>
            )}
          </>
        )}

        {/* Close button — always rendered when sheet is open */}
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
