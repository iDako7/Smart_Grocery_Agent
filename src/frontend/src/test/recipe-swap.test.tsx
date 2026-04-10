import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { renderWithSession } from "./test-utils";

function renderRecipes() {
  return renderWithSession(<RecipesScreen />, { initialPath: "/recipes" });
}

// ---------------------------------------------------------------------------
// Swap cycling
// ---------------------------------------------------------------------------

describe("RecipesScreen — swap cycling", () => {
  it("picking an alternative replaces the recipe in that slot", async () => {
    const user = userEvent.setup();
    renderRecipes();

    // Open swap panel for recipe 0 ("Korean BBQ Pork Belly")
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);

    // Pick "Asian Slaw"
    await user.click(screen.getByLabelText("Pick Asian Slaw"));

    // Slot 0 should now show "Asian Slaw", not "Korean BBQ Pork Belly"
    expect(screen.getByText("Asian Slaw")).toBeInTheDocument();
    expect(screen.queryByText("Korean BBQ Pork Belly")).not.toBeInTheDocument();
  });

  it("displaced recipe appears in alternatives on next swap", async () => {
    const user = userEvent.setup();
    renderRecipes();

    // Swap recipe 0: pick Asian Slaw
    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    await user.click(screen.getByLabelText("Pick Asian Slaw"));

    // Open swap panel on slot 0 again
    const tryButtonsAfter = screen.getAllByText(/try another/i);
    await user.click(tryButtonsAfter[0]);

    // "Korean BBQ Pork Belly" should be in alternatives, "Asian Slaw" should not
    expect(screen.getByLabelText("Pick Korean BBQ Pork Belly")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pick Asian Slaw")).not.toBeInTheDocument();
  });

  it('"keep the original" closes panel without changing recipe', async () => {
    const user = userEvent.setup();
    renderRecipes();

    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);

    await user.click(screen.getByText(/keep the original/i));

    // Panel closed, recipe unchanged
    expect(screen.queryByText("TRY INSTEAD")).not.toBeInTheDocument();
    expect(screen.getByText("Korean BBQ Pork Belly")).toBeInTheDocument();
  });

  it("swapping two different slots updates independently", async () => {
    const user = userEvent.setup();
    renderRecipes();

    // Swap recipe 0: pick Asian Slaw
    let tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    await user.click(screen.getByLabelText("Pick Asian Slaw"));

    // Swap recipe 1: pick from remaining alternatives
    tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[1]);
    await user.click(screen.getByLabelText("Pick Grilled Veggie Skewers"));

    // Both slots updated
    expect(screen.getByText("Asian Slaw")).toBeInTheDocument();
    expect(screen.getByText("Grilled Veggie Skewers")).toBeInTheDocument();
  });

  it("swap on recipe 0 does not affect recipe 1 and 2", async () => {
    const user = userEvent.setup();
    renderRecipes();

    const tryButtons = screen.getAllByText(/try another/i);
    await user.click(tryButtons[0]);
    await user.click(screen.getByLabelText("Pick Asian Slaw"));

    // Recipes 1 and 2 unchanged
    expect(screen.getByText("Grilled Corn & Cucumber Salad")).toBeInTheDocument();
    expect(screen.getByText("Classic Smash Burgers")).toBeInTheDocument();
  });
});
