import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, useParams } from "react-router";
import { ChecklistRow } from "@/components/checklist-row";
import { StoreSection } from "@/components/store-section";
import { Toast } from "@/components/toast";
import { getSavedGroceryList, updateSavedGroceryList } from "@/services/api-client";
import type { SavedGroceryList } from "@/types/api";
import type { GroceryStore, GroceryDepartment, GroceryItem } from "@/types/sse";

type StoreKind = "costco" | "market";

function storeKind(storeName: string): StoreKind {
  return storeName.toLowerCase().includes("costco") ? "costco" : "market";
}

function flattenItems(
  list: SavedGroceryList,
  kind: StoreKind,
): Array<{ item: GroceryItem }> {
  const out: Array<{ item: GroceryItem }> = [];
  for (const store of list.stores) {
    if (storeKind(store.store_name) !== kind) continue;
    for (const dept of store.departments) {
      for (const item of dept.items) {
        out.push({ item });
      }
    }
  }
  return out;
}

function countItems(list: SavedGroceryList): number {
  let n = 0;
  for (const s of list.stores) for (const d of s.departments) n += d.items.length;
  return n;
}

function addItemToStores(
  stores: GroceryStore[],
  kind: StoreKind,
  newItem: GroceryItem,
): GroceryStore[] {
  const idx = stores.findIndex((s) => storeKind(s.store_name) === kind);
  if (idx === -1) {
    const newStore: GroceryStore = {
      store_name: kind === "costco" ? "Costco" : "Market",
      departments: [{ name: "Other", items: [newItem] }],
    };
    return [...stores, newStore];
  }
  const store = stores[idx]!;
  let newDepartments: GroceryDepartment[];
  if (store.departments.length === 0) {
    newDepartments = [{ name: "Other", items: [newItem] }];
  } else {
    newDepartments = store.departments.map((d, i) =>
      i === 0 ? { ...d, items: [...d.items, newItem] } : d,
    );
  }
  const next = [...stores];
  next[idx] = { ...store, departments: newDepartments };
  return next;
}

function removeItemFromStores(stores: GroceryStore[], itemId: string): GroceryStore[] {
  return stores.map((s) => ({
    ...s,
    departments: s.departments.map((d) => ({
      ...d,
      items: d.items.filter((it) => it.id !== itemId),
    })),
  }));
}

function updateItemInStores(
  stores: GroceryStore[],
  itemId: string,
  patch: Partial<GroceryItem>,
): GroceryStore[] {
  return stores.map((s) => ({
    ...s,
    departments: s.departments.map((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    })),
  }));
}

export function SavedGroceryListScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  // `list` is the source of truth for rendering. Server round-trips mutate it.
  const [list, setList] = useState<SavedGroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  // Checked state is local-only — not persisted to the backend.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [addCostco, setAddCostco] = useState("");
  const [addMarket, setAddMarket] = useState("");
  const [copyCount, setCopyCount] = useState(0);
  const [copyFailed, setCopyFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [pending, setPending] = useState(false);

  // Debounce: coalesce rapid mutations into one PUT.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of the most recent server-confirmed list; revert target on error.
  const lastCommittedRef = useRef<SavedGroceryList | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSavedGroceryList(id)
      .then((data) => {
        setList(data);
        lastCommittedRef.current = data;
      })
      .catch(() => setList(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const schedulePersist = useCallback(
    (nextList: SavedGroceryList) => {
      if (!id) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        setPending(true);
        updateSavedGroceryList(id, { stores: nextList.stores })
          .then((updated) => {
            setList(updated);
            lastCommittedRef.current = updated;
          })
          .catch((err: unknown) => {
            // Revert to last server-confirmed snapshot.
            if (lastCommittedRef.current) {
              setList(lastCommittedRef.current);
            }
            const message = err instanceof Error ? err.message : "Update failed";
            setErrorMsg(message);
            setErrorNonce((n) => n + 1);
          })
          .finally(() => setPending(false));
      }, 300);
    },
    [id],
  );

  function mutate(nextList: SavedGroceryList) {
    setList(nextList);
    schedulePersist(nextList);
  }

  function handleToggle(itemId: string) {
    // Toggle is local-only — intentionally no PUT.
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleRemove(itemId: string) {
    if (!list) return;
    const nextList: SavedGroceryList = {
      ...list,
      stores: removeItemFromStores(list.stores, itemId),
    };
    setChecked((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    mutate(nextList);
  }

  function handleAdd(kind: StoreKind, value: string) {
    if (!list) return;
    const val = value.trim();
    if (!val) return;
    const newItem: GroceryItem = {
      id: crypto.randomUUID(),
      name: val,
      amount: "",
      recipe_context: "",
      checked: false,
    };
    const nextList: SavedGroceryList = {
      ...list,
      stores: addItemToStores(list.stores, kind, newItem),
    };
    mutate(nextList);
  }

  function handleAddCostco() {
    handleAdd("costco", addCostco);
    setAddCostco("");
  }

  function handleAddMarket() {
    handleAdd("market", addMarket);
    setAddMarket("");
  }

  function handleEdit(itemId: string, newName: string) {
    if (!list) return;
    const nextList: SavedGroceryList = {
      ...list,
      stores: updateItemInStores(list.stores, itemId, { name: newName }),
    };
    mutate(nextList);
  }

  async function handleCopyToNotes() {
    if (!list) return;
    const allItems = [...flattenItems(list, "costco"), ...flattenItems(list, "market")];
    const text = allItems.map(({ item }) => `[ ] ${item.name}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopyCount((c) => c + 1);
    } catch {
      setCopyFailed(true);
      setCopyCount((c) => c + 1);
    }
  }

  const costcoItems = list ? flattenItems(list, "costco") : [];
  const marketItems = list ? flattenItems(list, "market") : [];
  const totalItems = list ? countItems(list) : 0;
  const storeCount = list
    ? new Set(list.stores.map((s) => storeKind(s.store_name))).size
    : 0;

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
      {(location.state as { justSaved?: boolean } | null)?.justSaved && <Toast message="Saved!" testId="saved-toast" />}
      {copyCount > 0 && <Toast key={copyCount} message={copyFailed ? "Copy failed" : "Copied!"} testId="copied-toast" />}
      {errorMsg && <Toast key={`err-${errorNonce}`} message={errorMsg} testId="error-toast" />}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <span data-testid="loading-indicator" className="text-[13px] text-ink-2">
            Loading...
          </span>
        </div>
      )}

      {/* Not found state */}
      {!loading && !list && (
        <div className="flex flex-1 items-center justify-center">
          <span data-testid="not-found-message" className="text-[13px] text-ink-2">
            List not found.
          </span>
        </div>
      )}

      {/* Content */}
      {!loading && list && (
        <>
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
                <span className="text-apricot">✶</span>{" "}
                {new Date(list.created_at).toLocaleDateString()}
              </div>
              <h1 className="text-[20px] font-bold tracking-tight text-ink leading-[1.15]">
                {list.name} <span className="text-persimmon">list</span>.
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-2">
                {totalItems} items · {storeCount} stores
                {pending && (
                  <span data-testid="pending-indicator" className="ml-2 text-ink-3">
                    · saving…
                  </span>
                )}
              </p>
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
            {costcoItems.map(({ item }) => (
              <ChecklistRow
                key={item.id}
                id={item.id}
                name={item.name}
                subtitle={item.amount || undefined}
                checked={checked.has(item.id)}
                onToggle={handleToggle}
                onRemove={handleRemove}
                onEdit={handleEdit}
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
            {marketItems.map(({ item }) => (
              <ChecklistRow
                key={item.id}
                id={item.id}
                name={item.name}
                subtitle={item.amount || undefined}
                checked={checked.has(item.id)}
                onToggle={handleToggle}
                onRemove={handleRemove}
                onEdit={handleEdit}
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
        </>
      )}

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
