// ExpandableRecipe component tests — UAT fix for issue #69 (instructions scroll)
// TDD RED: written before the fix is applied.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpandableRecipe } from "@/components/expandable-recipe";

describe("ExpandableRecipe — instructions block CSS classes", () => {
  it("instructions container uses whitespace-pre-wrap (not bare whitespace-pre)", async () => {
    const user = userEvent.setup();
    render(
      <ExpandableRecipe
        name="Kung Pao Chicken"
        meta="30 min · serves 4"
        detail={"Step 1: heat oil\nStep 2: add chicken\nStep 3: this is a very long line that would overflow horizontally if whitespace-pre were used instead of whitespace-pre-wrap"}
      />
    );

    // Expand the component
    const toggleBtn = screen.getByRole("button", { name: /kung pao chicken/i });
    await user.click(toggleBtn);

    // The detail block should now be visible
    const detailBlock = screen.getByText(/Step 1: heat oil/);

    // Must have whitespace-pre-wrap
    expect(detailBlock.className).toMatch(/whitespace-pre-wrap/);

    // Must NOT have overflow-x-auto
    expect(detailBlock.className).not.toMatch(/overflow-x-auto/);

    // Must NOT have bare whitespace-pre token (word-boundary check:
    // whitespace-pre-wrap contains "whitespace-pre" as substring so we
    // check the class list does not contain the bare token as a separate class)
    const classes = detailBlock.className.split(/\s+/);
    expect(classes).not.toContain("whitespace-pre");
  });
});
