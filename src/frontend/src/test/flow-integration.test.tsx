import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";

import { HomeScreen } from "@/screens/HomeScreen";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { GroceryScreen } from "@/screens/GroceryScreen";
import { ScenarioProvider } from "@/context/scenario-context";
import { SessionProvider } from "@/context/session-context";
import { createMockChatService } from "./test-utils";

function renderFullApp(options?: { chatService?: ReturnType<typeof createMockChatService>["service"]; initialPath?: string }) {
  return render(
    <ScenarioProvider>
      <SessionProvider chatService={options?.chatService}>
        <MemoryRouter initialEntries={[options?.initialPath ?? "/"]}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/clarify" element={<ClarifyScreen />} />
            <Route path="/recipes" element={<RecipesScreen />} />
            <Route path="/grocery" element={<GroceryScreen />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ScenarioProvider>
  );
}

// ---------------------------------------------------------------------------
// Flow 1 — Clarify chip resolution
// ---------------------------------------------------------------------------

describe("Flow 1 — Clarify chip resolution", () => {
  it("resolves chips and sends correct message", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderFullApp({ chatService: mock.service, initialPath: "/clarify" });

    // Click "All of the above" → all setup chips selected
    await user.click(screen.getByRole("button", { name: "All of the above" }));
    expect(screen.getByRole("button", { name: "Oven" }).className).toContain("bg-shoyu");
    expect(screen.getByRole("button", { name: "Stovetop" }).className).toContain("bg-shoyu");

    // Deselect "Oven" → "All of the above" deselects
    await user.click(screen.getByRole("button", { name: "Oven" }));
    expect(screen.getByRole("button", { name: "All of the above" }).className).not.toContain("bg-shoyu");

    // Click "Halal" → "None" deselects
    await user.click(screen.getByRole("button", { name: "Halal" }));
    expect(screen.getByRole("button", { name: "None" }).className).not.toContain("bg-shoyu");

    // Click "Looks good"
    await user.click(screen.getByText(/Looks good, show recipes/));

    expect(mock.serviceFn).toHaveBeenCalled();
    const msg = mock.serviceFn.mock.calls[0][0] as string;
    expect(msg).toContain("Outdoor grill");
    expect(msg).toContain("Stovetop");
    expect(msg).not.toContain("All of the above");
    expect(msg).toContain("Halal");
    expect(msg).not.toContain("None");
  });
});

// ---------------------------------------------------------------------------
// Flow 2 — Recipe swap then build list
// ---------------------------------------------------------------------------

describe("Flow 2 — Recipe swap then build list", () => {
  it("swaps a recipe and navigates to grocery", async () => {
    const user = userEvent.setup();
    renderFullApp({ initialPath: "/recipes" });

    // Swap recipe 0
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    await user.click(screen.getByLabelText("Pick Asian Slaw"));

    expect(screen.getByText("Asian Slaw")).toBeInTheDocument();

    // Navigate to grocery
    await user.click(screen.getByText(/Build list/i));
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Flow 3 — Double swap independence
// ---------------------------------------------------------------------------

describe("Flow 3 — Double swap independence", () => {
  it("swapping two slots updates independently", async () => {
    const user = userEvent.setup();
    renderFullApp({ initialPath: "/recipes" });

    // Swap recipe 0
    let tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    await user.click(screen.getByLabelText("Pick Asian Slaw"));

    // Swap recipe 1
    tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[1]);
    await user.click(screen.getByLabelText("Pick Grilled Veggie Skewers"));

    expect(screen.getByText("Asian Slaw")).toBeInTheDocument();
    expect(screen.getByText("Grilled Veggie Skewers")).toBeInTheDocument();
    expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Flow 4 — Full navigation Home → Clarify → Recipes → Grocery
// ---------------------------------------------------------------------------

describe("Flow 4 — Full navigation", () => {
  it("navigates Home → Clarify → Recipes → Grocery", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderFullApp({ chatService: mock.service });

    // Home screen
    const input = screen.getByPlaceholderText(/BBQ for 8/i);
    await user.click(input);
    await user.type(input, "BBQ for 8");
    await user.keyboard("{Enter}");

    // Should navigate to /clarify
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();

    // Click "Looks good, show recipes"
    await user.click(screen.getByText(/Looks good, show recipes/));
    expect(screen.getByTestId("screen-recipes")).toBeInTheDocument();

    // Click "Build list"
    await user.click(screen.getByText(/Build list/i));
    expect(screen.getByTestId("screen-grocery")).toBeInTheDocument();
  });
});
