// CRUD tests for SavedGroceryListScreen — verifies the screen persists
// add/remove/edit via updateSavedGroceryList with a 300ms debounce, and
// that toggling checked state stays local. Uses real timers for simplicity
// (debounce window is small, tests stay snappy).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { SavedGroceryListScreen } from "@/screens/SavedGroceryListScreen";
import type { SavedGroceryList } from "@/types/api";

vi.mock("@/services/api-client", () => ({
  getSavedGroceryList: vi.fn(),
  updateSavedGroceryList: vi.fn(),
}));

import {
  getSavedGroceryList,
  updateSavedGroceryList,
} from "@/services/api-client";

function makeList(): SavedGroceryList {
  return {
    id: "list-1",
    name: "Weekly Shop",
    stores: [
      {
        store_name: "Costco",
        departments: [
          {
            name: "Produce",
            items: [
              {
                id: "item-1",
                name: "Corn on the cob",
                amount: "12-pack",
                recipe_context: "for salad",
                checked: false,
              },
            ],
          },
        ],
      },
      {
        store_name: "Community Market",
        departments: [
          {
            name: "Produce",
            items: [
              {
                id: "item-2",
                name: "Cucumber",
                amount: "2",
                recipe_context: "for salad",
                checked: false,
              },
            ],
          },
        ],
      },
    ],
    created_at: "2026-04-12T00:00:00Z",
    updated_at: "2026-04-12T00:00:00Z",
  };
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/saved/list/list-1"]}>
      <Routes>
        <Route path="/saved/list/:id" element={<SavedGroceryListScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SavedGroceryListScreen — CRUD persistence", () => {
  it("renders list from getSavedGroceryList mock", async () => {
    vi.mocked(getSavedGroceryList).mockResolvedValue(makeList());
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );
    expect(screen.getByText("Cucumber")).toBeInTheDocument();
  });

  it("clicking a checkbox does NOT call updateSavedGroceryList", async () => {
    vi.mocked(getSavedGroceryList).mockResolvedValue(makeList());
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );

    const checkbox = screen.getByRole("checkbox", { name: /Toggle Corn on the cob/ });
    await user.click(checkbox);

    // Wait past the debounce window — still no PUT.
    await wait(400);
    expect(updateSavedGroceryList).not.toHaveBeenCalled();
  });

  it("adding a Costco item fires one PUT after debounce with the new item", async () => {
    const initial = makeList();
    vi.mocked(getSavedGroceryList).mockResolvedValue(initial);
    vi.mocked(updateSavedGroceryList).mockImplementation(async (_id, payload) => ({
      ...initial,
      stores: payload.stores ?? initial.stores,
      updated_at: "2026-04-13T00:00:00Z",
    }));

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );

    const addInput = screen.getByPlaceholderText("Add to Costco...");
    await user.type(addInput, "Eggs");
    await user.keyboard("{Enter}");

    // Optimistic render.
    expect(screen.getByText("Eggs")).toBeInTheDocument();
    // Before debounce fires, no PUT.
    expect(updateSavedGroceryList).not.toHaveBeenCalled();

    await waitFor(
      () => expect(updateSavedGroceryList).toHaveBeenCalledTimes(1),
      { timeout: 1000 },
    );

    const [calledId, calledPayload] = vi.mocked(updateSavedGroceryList).mock.calls[0]!;
    expect(calledId).toBe("list-1");
    const allNames = calledPayload.stores!.flatMap((s) =>
      s.departments.flatMap((d) => d.items.map((i) => i.name)),
    );
    expect(allNames).toContain("Eggs");

    // UI still shows it after server response.
    expect(screen.getByText("Eggs")).toBeInTheDocument();
  });

  it("removing an item fires a PUT without that item and UI updates", async () => {
    const initial = makeList();
    vi.mocked(getSavedGroceryList).mockResolvedValue(initial);
    vi.mocked(updateSavedGroceryList).mockImplementation(async (_id, payload) => ({
      ...initial,
      stores: payload.stores ?? initial.stores,
    }));

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );

    const removeBtn = screen.getByRole("button", { name: /Remove Corn on the cob/ });
    await user.click(removeBtn);

    expect(screen.queryByText("Corn on the cob")).not.toBeInTheDocument();

    await waitFor(
      () => expect(updateSavedGroceryList).toHaveBeenCalledTimes(1),
      { timeout: 1000 },
    );
    const [, payload] = vi.mocked(updateSavedGroceryList).mock.calls[0]!;
    const allNames = payload.stores!.flatMap((s) =>
      s.departments.flatMap((d) => d.items.map((i) => i.name)),
    );
    expect(allNames).not.toContain("Corn on the cob");
    expect(screen.queryByText("Corn on the cob")).not.toBeInTheDocument();
  });

  it("editing item text (click → type → Enter) fires a PUT with the new name", async () => {
    const initial = makeList();
    vi.mocked(getSavedGroceryList).mockResolvedValue(initial);
    vi.mocked(updateSavedGroceryList).mockImplementation(async (_id, payload) => ({
      ...initial,
      stores: payload.stores ?? initial.stores,
    }));

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Corn on the cob"));

    const input = screen.getByLabelText(/Edit Corn on the cob/);
    await user.clear(input);
    await user.type(input, "Sweet corn");
    await user.keyboard("{Enter}");

    expect(screen.getByText("Sweet corn")).toBeInTheDocument();

    await waitFor(
      () => expect(updateSavedGroceryList).toHaveBeenCalledTimes(1),
      { timeout: 1000 },
    );
    const [, payload] = vi.mocked(updateSavedGroceryList).mock.calls[0]!;
    const allNames = payload.stores!.flatMap((s) =>
      s.departments.flatMap((d) => d.items.map((i) => i.name)),
    );
    expect(allNames).toContain("Sweet corn");
    expect(allNames).not.toContain("Corn on the cob");
  });

  it("PUT rejection reverts state and shows an error toast", async () => {
    const initial = makeList();
    vi.mocked(getSavedGroceryList).mockResolvedValue(initial);
    vi.mocked(updateSavedGroceryList).mockRejectedValue(new Error("500 boom"));

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );

    const removeBtn = screen.getByRole("button", { name: /Remove Corn on the cob/ });
    await user.click(removeBtn);

    // Optimistic removal.
    expect(screen.queryByText("Corn on the cob")).not.toBeInTheDocument();

    await waitFor(
      () => expect(updateSavedGroceryList).toHaveBeenCalledTimes(1),
      { timeout: 1000 },
    );

    // Revert + error toast.
    await waitFor(() =>
      expect(screen.getByText("Corn on the cob")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("error-toast")).toBeInTheDocument();
  });
});
