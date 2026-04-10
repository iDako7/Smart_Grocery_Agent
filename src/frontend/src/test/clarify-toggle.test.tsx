import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { renderWithSession, createMockChatService } from "./test-utils";

function renderClarify(chatService?: ReturnType<typeof createMockChatService>["service"]) {
  return renderWithSession(<ClarifyScreen />, {
    chatService,
    initialPath: "/clarify",
  });
}

function getChip(name: string) {
  return screen.getByRole("button", { name });
}

function isSelected(button: HTMLElement) {
  return button.className.includes("bg-shoyu");
}

// ---------------------------------------------------------------------------
// Cooking setup: "All of the above" logic
// ---------------------------------------------------------------------------

describe("ClarifyScreen — cooking setup toggle", () => {
  it('click "All of the above" selects all individual options', async () => {
    const user = userEvent.setup();
    renderClarify();

    await user.click(getChip("All of the above"));

    expect(isSelected(getChip("Outdoor grill"))).toBe(true);
    expect(isSelected(getChip("Oven"))).toBe(true);
    expect(isSelected(getChip("Stovetop"))).toBe(true);
    expect(isSelected(getChip("All of the above"))).toBe(true);
  });

  it('deselecting one individual option also deselects "All of the above"', async () => {
    const user = userEvent.setup();
    renderClarify();

    await user.click(getChip("All of the above"));
    await user.click(getChip("Oven"));

    expect(isSelected(getChip("All of the above"))).toBe(false);
    expect(isSelected(getChip("Outdoor grill"))).toBe(true);
    expect(isSelected(getChip("Stovetop"))).toBe(true);
    expect(isSelected(getChip("Oven"))).toBe(false);
  });

  it('selecting all individual options auto-selects "All of the above"', async () => {
    const user = userEvent.setup();
    renderClarify();

    // "Outdoor grill" is pre-selected; select the other two
    await user.click(getChip("Oven"));
    await user.click(getChip("Stovetop"));

    expect(isSelected(getChip("All of the above"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dietary: "None" mutual exclusion
// ---------------------------------------------------------------------------

describe("ClarifyScreen — dietary toggle", () => {
  it('clicking "Halal" deselects "None"', async () => {
    const user = userEvent.setup();
    renderClarify();

    await user.click(getChip("Halal"));

    expect(isSelected(getChip("None"))).toBe(false);
    expect(isSelected(getChip("Halal"))).toBe(true);
  });

  it('clicking "None" clears other dietary selections', async () => {
    const user = userEvent.setup();
    renderClarify();

    await user.click(getChip("Halal"));
    await user.click(getChip("Vegetarian"));
    await user.click(getChip("None"));

    expect(isSelected(getChip("None"))).toBe(true);
    expect(isSelected(getChip("Halal"))).toBe(false);
    expect(isSelected(getChip("Vegetarian"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// "Looks good" resolves "All of the above" to individual names
// ---------------------------------------------------------------------------

describe("ClarifyScreen — looks good message resolution", () => {
  it('resolves "All of the above" to actual option names in the sent message', async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderClarify(mock.service);

    await user.click(getChip("All of the above"));
    await user.click(screen.getByText(/Looks good, show recipes/));

    expect(mock.serviceFn).toHaveBeenCalled();
    const msg = mock.serviceFn.mock.calls[0][0] as string;
    expect(msg).toContain("Outdoor grill");
    expect(msg).toContain("Oven");
    expect(msg).toContain("Stovetop");
    expect(msg).not.toContain("All of the above");
  });
});
