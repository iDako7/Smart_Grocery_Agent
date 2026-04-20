/**
 * issue-150-home-quick-start.spec.ts
 *
 * Issue #150 — Home Quick Start UX change.
 *
 * Clicking a Quick Start chip must pre-fill the hero input instead of
 * auto-navigating. The new "Next →" button remains disabled until the input
 * has non-empty content, then navigates to /clarify on click.
 *
 * This spec hits the frontend only — no backend or LLM calls required.
 */

import { test, expect } from "@playwright/test";

const INPUT_PLACEHOLDER_FRAGMENT = "BBQ for 8";

test.describe("Issue #150 — Home Quick Start pre-fill + Next gate", () => {
  test("Quick Start chip pre-fills the input and keeps the user on home", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();

    const next = page.getByRole("button", { name: /^next/i });
    await expect(next).toBeDisabled();

    await page.getByRole("button", { name: "Weekend BBQ" }).click();

    const heroInput = page.locator(`input[placeholder*="${INPUT_PLACEHOLDER_FRAGMENT}"]`);
    await expect(heroInput).toHaveValue("Weekend BBQ");

    // Still on home screen — no auto-navigation.
    await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();

    // Next is enabled now that the input is populated.
    await expect(next).toBeEnabled();
  });

  test("Next button navigates to /clarify and input can be edited before submit", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();

    await page.getByRole("button", { name: "Weeknight meals" }).click();

    const heroInput = page.locator(`input[placeholder*="${INPUT_PLACEHOLDER_FRAGMENT}"]`);
    await expect(heroInput).toHaveValue("Weeknight meals");

    await heroInput.pressSequentially(" for the family", { delay: 15 });
    await expect(heroInput).toHaveValue("Weeknight meals for the family");

    await page.getByRole("button", { name: /^next/i }).click();

    await expect(page.locator('[data-testid="screen-clarify"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});
