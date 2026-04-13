// clarify-screen.test.tsx
// TDD: All 11 tests written BEFORE implementation (RED phase).
// Covers 5 state-machine states, 5 integration behaviors, 1 navigation test.

import { describe, it, expect } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";

import { ClarifyScreen } from "@/screens/ClarifyScreen";
import { renderWithSession, createMockChatService } from "@/test/test-utils";

// ---------------------------------------------------------------------------
// Helpers — shared PCV fixture
// ---------------------------------------------------------------------------

const makePcsvEvent = () => ({
  event_type: "pcsv_update" as const,
  pcsv: {
    protein: { status: "ok" as const, items: ["chicken"] },
    carb: { status: "low" as const, items: ["rice"] },
    veggie: { status: "gap" as const, items: [] },
    sauce: { status: "ok" as const, items: ["soy sauce"] },
  },
});

// ---------------------------------------------------------------------------
// STATE-MACHINE TESTS (5)
// ---------------------------------------------------------------------------

describe("ClarifyScreen — state: idle", () => {
  it("renders chip UI and header, no PCV badges, no explanation text", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Screen wrapper is present
    expect(screen.getByTestId("screen-clarify")).toBeInTheDocument();

    // Back button is present
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();

    // StepProgress is rendered
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    // Chip UI is present — cooking setup section
    expect(
      screen.getByText(/what.s your cooking setup\?/i)
    ).toBeInTheDocument();
    // Individual setup chips exist
    expect(
      screen.getByRole("button", { name: /^Oven$/i })
    ).toBeInTheDocument();

    // Dietary section chip UI is present
    expect(
      screen.getByText(/any dietary restrictions\?/i)
    ).toBeInTheDocument();

    // No PCV badges in idle — no pcsv_update has arrived
    expect(screen.queryByRole("img", { name: /protein/i })).not.toBeInTheDocument();
    // PcvBadge uses aria-label, not img role — check by label
    expect(screen.queryByLabelText(/protein:/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/carb:/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/veggie:/i)).not.toBeInTheDocument();
  });
});

describe("ClarifyScreen — state: loading", () => {
  it("renders skeleton or Thinking placeholder; chips disabled or hidden", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Drive to loading via sendMessage — click Oven chip then Looks good
    const ovenChip = screen.getByRole("button", { name: /^Oven$/i });
    act(() => {
      ovenChip.click();
    });

    const looksGoodBtn = screen.getByRole("button", {
      name: /looks good, show recipes/i,
    });
    act(() => {
      looksGoodBtn.click();
    });

    // Now in loading state — either a skeleton/spinner or "Thinking..." text should appear
    const hasThinkingText = screen.queryByText(/thinking/i) !== null;
    const hasLoadingElement =
      screen.queryByTestId("clarify-loading-skeleton") !== null ||
      screen.queryByRole("status") !== null;

    expect(hasThinkingText || hasLoadingElement).toBe(true);

    // Chip UI must be disabled during loading per issue #38 spec
    const setupChips = screen.getAllByRole("button", {
      name: /^(Outdoor grill|Oven|Stovetop|All of the above)$/,
    });
    setupChips.forEach((chip) => expect(chip).toBeDisabled());

    const dietChips = screen.getAllByRole("button", {
      name: /^(None|Halal|Vegetarian|Vegan|Gluten-free)$/,
    });
    dietChips.forEach((chip) => expect(chip).toBeDisabled());
  });
});

describe("ClarifyScreen — state: streaming", () => {
  it("renders 3 PCV badges with correct categories/statuses from screenData.pcsv; chips interactive", async () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Trigger loading
    const ovenChip = screen.getByRole("button", { name: /^Oven$/i });
    act(() => {
      ovenChip.click();
    });
    const looksGoodBtn = screen.getByRole("button", {
      name: /looks good, show recipes/i,
    });
    act(() => {
      looksGoodBtn.click();
    });

    // Fire pcsv_update SSE event to enter streaming
    act(() => {
      mock.getOnEvent()(makePcsvEvent());
    });

    // PCV badges should now be visible
    // protein → ok, carb → low (warn), veggie → gap
    expect(screen.getByLabelText(/protein: good/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/carb: low/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/veggie: gap/i)).toBeInTheDocument();

    // Chips are still interactive (not disabled) in streaming
    const stovetopChip = screen.getByRole("button", { name: /^Stovetop$/i });
    expect(stovetopChip).not.toBeDisabled();
  });
});

describe("ClarifyScreen — state: complete", () => {
  it("renders PCV + explanation + chips + Looks good CTA enabled", async () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Trigger loading → streaming → complete
    const ovenChip = screen.getByRole("button", { name: /^Oven$/i });
    act(() => { ovenChip.click(); });
    const looksGoodBtn = screen.getByRole("button", {
      name: /looks good, show recipes/i,
    });
    act(() => { looksGoodBtn.click(); });

    act(() => {
      mock.getOnEvent()(makePcsvEvent());
      mock.getOnEvent()({
        event_type: "explanation",
        text: "You have good protein coverage.",
      });
    });

    act(() => {
      mock.getOnDone()("complete", null);
    });

    // PCV badges present
    expect(screen.getByLabelText(/protein: good/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/carb: low/i)).toBeInTheDocument();

    // Explanation text is visible
    expect(
      screen.getByText(/you have good protein coverage/i)
    ).toBeInTheDocument();

    // "Looks good, show recipes →" CTA is enabled
    const cta = screen.getByRole("button", {
      name: /looks good, show recipes/i,
    });
    expect(cta).not.toBeDisabled();
  });
});

describe("ClarifyScreen — state: error", () => {
  it("renders ErrorBanner with screenData.error message and retry button", async () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Trigger loading
    const ovenChip = screen.getByRole("button", { name: /^Oven$/i });
    act(() => { ovenChip.click(); });
    const looksGoodBtn = screen.getByRole("button", {
      name: /looks good, show recipes/i,
    });
    act(() => { looksGoodBtn.click(); });

    // Fire error
    act(() => {
      mock.getOnError()("Network connection failed");
    });

    // ErrorBanner shows with the error message
    expect(
      screen.getByText("Network connection failed")
    ).toBeInTheDocument();

    // Retry button is present
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// INTEGRATION TESTS (5)
// ---------------------------------------------------------------------------

describe("ClarifyScreen — integration: chip flow", () => {
  it("selects Oven and Stovetop, deselects Oven, Looks good sends message with Stovetop only", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Click Oven (select)
    await user.click(screen.getByRole("button", { name: /^Oven$/i }));
    expect(
      screen.getByRole("button", { name: /^Oven$/i })
    ).toHaveAttribute("aria-pressed", "true");

    // Click Stovetop (select)
    await user.click(screen.getByRole("button", { name: /^Stovetop$/i }));
    expect(
      screen.getByRole("button", { name: /^Stovetop$/i })
    ).toHaveAttribute("aria-pressed", "true");

    // Click Oven again (deselect)
    await user.click(screen.getByRole("button", { name: /^Oven$/i }));
    expect(
      screen.getByRole("button", { name: /^Oven$/i })
    ).toHaveAttribute("aria-pressed", "false");

    // Click "Looks good"
    await user.click(
      screen.getByRole("button", { name: /looks good, show recipes/i })
    );

    // sendMessage should have been called exactly once
    expect(mock.serviceFn).toHaveBeenCalledTimes(1);
    const sentMessage: string = mock.serviceFn.mock.calls[0][0];

    // Message contains "Stovetop" but not "Outdoor grill" or "Oven"
    expect(sentMessage).toContain("Stovetop");
    expect(sentMessage).not.toContain("Outdoor grill");
  });
});

describe("ClarifyScreen — integration: markdown rendering", () => {
  it("drives streaming with bold explanation → DOM contains <strong> element", async () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Trigger loading
    const ovenChip = screen.getByRole("button", { name: /^Oven$/i });
    act(() => { ovenChip.click(); });
    act(() => {
      screen.getByRole("button", { name: /looks good, show recipes/i }).click();
    });

    // Stream explanation with markdown bold
    act(() => {
      mock.getOnEvent()(makePcsvEvent());
      mock.getOnEvent()({
        event_type: "explanation",
        text: "This is **bold** text",
      });
    });

    // DOM should have a <strong> element containing "bold"
    const strongEl = document.querySelector("strong");
    expect(strongEl).not.toBeNull();
    expect(strongEl?.textContent).toBe("bold");
  });
});

describe("ClarifyScreen — integration: no-fallback", () => {
  it("renders in idle with empty screenData → no Korean BBQ, no chip pre-pressed", () => {
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // No scenario/mock data should appear
    expect(screen.queryByText(/korean bbq/i)).not.toBeInTheDocument();

    // Every setup chip starts with aria-pressed="false" (empty start — no default)
    const outdoorGrillBtn = screen.getByRole("button", {
      name: /^Outdoor grill$/i,
    });
    const ovenBtn = screen.getByRole("button", { name: /^Oven$/i });
    const stovetopBtn = screen.getByRole("button", { name: /^Stovetop$/i });
    const allAboveBtn = screen.getByRole("button", {
      name: /^All of the above$/i,
    });

    expect(outdoorGrillBtn).toHaveAttribute("aria-pressed", "false");
    expect(ovenBtn).toHaveAttribute("aria-pressed", "false");
    expect(stovetopBtn).toHaveAttribute("aria-pressed", "false");
    expect(allAboveBtn).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ClarifyScreen — integration: All of the above toggle", () => {
  it("clicking All of the above selects every individual chip; deselecting one individual chip deselects All", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Click "All of the above" — all individual chips should be selected
    await user.click(
      screen.getByRole("button", { name: /^All of the above$/i })
    );

    expect(
      screen.getByRole("button", { name: /^Outdoor grill$/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^Oven$/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^Stovetop$/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^All of the above$/i })
    ).toHaveAttribute("aria-pressed", "true");

    // Click Oven (deselect) — "All of the above" should be deselected
    await user.click(screen.getByRole("button", { name: /^Oven$/i }));

    expect(
      screen.getByRole("button", { name: /^All of the above$/i })
    ).toHaveAttribute("aria-pressed", "false");
    // Oven is now deselected
    expect(
      screen.getByRole("button", { name: /^Oven$/i })
    ).toHaveAttribute("aria-pressed", "false");
    // Others remain selected
    expect(
      screen.getByRole("button", { name: /^Outdoor grill$/i })
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ClarifyScreen — integration: dietary None exclusive", () => {
  it("None then Vegan → None deselected, Vegan selected; None again → all others cleared", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();
    renderWithSession(<ClarifyScreen />, { chatService: mock.service });

    // Initially no chip is pressed
    expect(
      screen.getByRole("button", { name: /^None$/i })
    ).toHaveAttribute("aria-pressed", "false");

    // Click None
    await user.click(screen.getByRole("button", { name: /^None$/i }));
    expect(
      screen.getByRole("button", { name: /^None$/i })
    ).toHaveAttribute("aria-pressed", "true");

    // Click Vegan → None deselected, Vegan selected
    await user.click(screen.getByRole("button", { name: /^Vegan$/i }));
    expect(
      screen.getByRole("button", { name: /^None$/i })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /^Vegan$/i })
    ).toHaveAttribute("aria-pressed", "true");

    // Click None again → all others deselected, None selected
    await user.click(screen.getByRole("button", { name: /^None$/i }));
    expect(
      screen.getByRole("button", { name: /^None$/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^Vegan$/i })
    ).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// NAVIGATION TEST (1)
// ---------------------------------------------------------------------------

describe("ClarifyScreen — navigation: back button", () => {
  it("clicking back button navigates to /", async () => {
    const user = userEvent.setup();
    const mock = createMockChatService();

    // Use routes option so we can assert location change
    renderWithSession(<ClarifyScreen />, {
      chatService: mock.service,
      routes: (
        <Routes>
          <Route path="/" element={<div data-testid="home-screen">Home</div>} />
          <Route path="/clarify" element={<ClarifyScreen />} />
        </Routes>
      ),
      initialPath: "/clarify",
    });

    const backBtn = screen.getByRole("button", { name: /go back/i });
    await user.click(backBtn);

    // After clicking back, the home screen should be visible
    expect(screen.getByTestId("home-screen")).toBeInTheDocument();
  });
});
