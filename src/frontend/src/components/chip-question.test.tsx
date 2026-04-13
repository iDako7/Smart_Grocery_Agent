// ChipQuestion component tests — TDD RED → GREEN
// Written FIRST before implementation exists.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ClarifyQuestion } from "@/types/sse";

// ChipQuestion is not yet implemented — these tests will fail (RED).
import { ChipQuestion } from "@/components/chip-question";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeQuestion(
  overrides: Partial<ClarifyQuestion> = {}
): ClarifyQuestion {
  return {
    id: "q1",
    text: "What's your cooking setup?",
    selection_mode: "single",
    options: [
      { label: "A", is_exclusive: false },
      { label: "B", is_exclusive: false },
      { label: "C", is_exclusive: false },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T1: single mode — selecting B deselects A
// ---------------------------------------------------------------------------

describe("ChipQuestion — single mode", () => {
  it("test_chip_question_single_mode_selecting_b_deselects_a", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const question = makeQuestion({ selection_mode: "single" });

    const { rerender } = render(
      <ChipQuestion question={question} selected={["A"]} onChange={onChange} />
    );

    // A is currently selected; click B
    await user.click(screen.getByTestId("chip-q1-B"));
    expect(onChange).toHaveBeenCalledWith(["B"]);

    // Re-render with B selected; click A
    onChange.mockClear();
    rerender(
      <ChipQuestion question={question} selected={["B"]} onChange={onChange} />
    );
    await user.click(screen.getByTestId("chip-q1-A"));
    expect(onChange).toHaveBeenCalledWith(["A"]);
  });

  it("clicking the already-selected chip deselects it (array becomes empty)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const question = makeQuestion({ selection_mode: "single" });

    render(
      <ChipQuestion question={question} selected={["A"]} onChange={onChange} />
    );

    await user.click(screen.getByTestId("chip-q1-A"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("selected chip has aria-pressed=true", () => {
    const question = makeQuestion({ selection_mode: "single" });
    render(
      <ChipQuestion question={question} selected={["A"]} onChange={() => {}} />
    );
    expect(screen.getByTestId("chip-q1-A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chip-q1-B")).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// T2: multi mode — A and B both selectable
// ---------------------------------------------------------------------------

describe("ChipQuestion — multi mode", () => {
  it("test_chip_question_multi_mode_a_and_b_both_selectable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const question = makeQuestion({ selection_mode: "multi" });

    const { rerender } = render(
      <ChipQuestion question={question} selected={[]} onChange={onChange} />
    );

    // Click A — should add A
    await user.click(screen.getByTestId("chip-q1-A"));
    expect(onChange).toHaveBeenCalledWith(["A"]);

    // Re-render with A already selected; click B — should add B alongside A
    onChange.mockClear();
    rerender(
      <ChipQuestion question={question} selected={["A"]} onChange={onChange} />
    );
    await user.click(screen.getByTestId("chip-q1-B"));
    expect(onChange).toHaveBeenCalledWith(["A", "B"]);
  });

  it("clicking a selected chip in multi mode toggles it off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const question = makeQuestion({ selection_mode: "multi" });

    render(
      <ChipQuestion question={question} selected={["A", "B"]} onChange={onChange} />
    );

    await user.click(screen.getByTestId("chip-q1-A"));
    expect(onChange).toHaveBeenCalledWith(["B"]);
  });
});

// ---------------------------------------------------------------------------
// T3: multi + is_exclusive — exclusive option clears others
// ---------------------------------------------------------------------------

describe("ChipQuestion — multi mode exclusive option", () => {
  it("test_chip_question_multi_mode_exclusive_option_clears_others", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const question = makeQuestion({
      id: "dietary",
      selection_mode: "multi",
      options: [
        { label: "A", is_exclusive: false },
        { label: "B", is_exclusive: false },
        { label: "None", is_exclusive: true },
      ],
    });

    render(
      <ChipQuestion
        question={question}
        selected={["A", "B"]}
        onChange={onChange}
      />
    );

    // Click "None" — exclusive option should clear A and B
    await user.click(screen.getByTestId("chip-dietary-None"));
    expect(onChange).toHaveBeenCalledWith(["None"]);
  });

  // ---------------------------------------------------------------------------
  // T4: multi + is_exclusive — non-exclusive clears the exclusive
  // ---------------------------------------------------------------------------

  it("test_chip_question_multi_mode_selecting_non_exclusive_clears_exclusive", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const question = makeQuestion({
      id: "dietary",
      selection_mode: "multi",
      options: [
        { label: "A", is_exclusive: false },
        { label: "B", is_exclusive: false },
        { label: "None", is_exclusive: true },
      ],
    });

    render(
      <ChipQuestion
        question={question}
        selected={["None"]}
        onChange={onChange}
      />
    );

    // Click "A" — non-exclusive should clear "None"
    await user.click(screen.getByTestId("chip-dietary-A"));
    expect(onChange).toHaveBeenCalledWith(["A"]);
  });
});

// ---------------------------------------------------------------------------
// Disabled state
// ---------------------------------------------------------------------------

describe("ChipQuestion — disabled", () => {
  it("chips are disabled when disabled=true", () => {
    const question = makeQuestion({ selection_mode: "single" });
    render(
      <ChipQuestion
        question={question}
        selected={[]}
        onChange={() => {}}
        disabled={true}
      />
    );
    const chipA = screen.getByTestId("chip-q1-A");
    expect(chipA).toBeDisabled();
  });

  it("chips are enabled by default (disabled=false)", () => {
    const question = makeQuestion({ selection_mode: "single" });
    render(
      <ChipQuestion question={question} selected={[]} onChange={() => {}} />
    );
    expect(screen.getByTestId("chip-q1-A")).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Renders question text
// ---------------------------------------------------------------------------

describe("ChipQuestion — renders question text", () => {
  it("renders the question text as a label", () => {
    const question = makeQuestion({ text: "What's your cooking setup?" });
    render(
      <ChipQuestion question={question} selected={[]} onChange={() => {}} />
    );
    expect(screen.getByText("What's your cooking setup?")).toBeInTheDocument();
  });

  it("renders all option labels as buttons", () => {
    const question = makeQuestion();
    render(
      <ChipQuestion question={question} selected={[]} onChange={() => {}} />
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
