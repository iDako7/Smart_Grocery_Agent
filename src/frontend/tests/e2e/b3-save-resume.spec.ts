/**
 * b3-save-resume.spec.ts
 *
 * Issue #22 — B3: Save & Resume E2E verification.
 *
 * Tests use REAL servers and REAL OpenRouter API calls.
 * Agent responses take 10-60 seconds — long timeouts used throughout.
 *
 * Serial flow:
 *   Test 1: Home → Clarify → Recipes → Save plan → saved detail screen
 *   Test 2: Home → sidebar shows the saved plan from real API
 *   Test 3: Click sidebar plan → loads real data by ID
 *   Test 4: Page refresh on saved detail → data persists (re-fetched by ID)
 */

import { test, expect } from "@playwright/test";

const AGENT_TIMEOUT = 90_000; // 90s for LLM responses

// Shared state between serial tests
let savedPlanUrl: string;

test.describe.serial("B3: Save & Resume", () => {
  /**
   * Test 1: Full flow — Home → Clarify → Recipes → Save plan.
   * Verifies save calls real API and navigates to a real UUID-based URL.
   */
  test("Test 1: Save plan from Recipes screen via real API", async ({ page }) => {
    test.setTimeout(4 * AGENT_TIMEOUT); // generous timeout for multi-step flow

    await page.goto("/");
    await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();

    // Submit input
    const heroInput = page.locator('input[placeholder*="BBQ for 8"]');
    await heroInput.fill(
      "I have chicken thighs, rice, and vegetables for dinner for 2"
    );
    await heroInput.press("Enter");

    // Wait for ClarifyScreen
    await expect(page.locator('[data-testid="screen-clarify"]')).toBeVisible({
      timeout: 10_000,
    });

    // Wait for real PCV badges from agent
    const pcvBadge = page
      .locator('[data-testid="screen-clarify"]')
      .locator(
        'span[aria-label^="Protein"], span[aria-label^="Carb"], span[aria-label^="Veggie"]'
      )
      .first();
    await expect(pcvBadge).toBeVisible({ timeout: AGENT_TIMEOUT });

    // Navigate to Recipes
    const looksGoodBtn = page.locator(
      'button:has-text("Looks good, show recipes")'
    );
    await expect(looksGoodBtn).toBeVisible();
    await looksGoodBtn.click();

    await expect(page.locator('[data-testid="screen-recipes"]')).toBeVisible({
      timeout: 10_000,
    });

    // Wait for real recipe cards from agent
    const dishPill = page
      .locator('[data-testid="screen-recipes"]')
      .locator('div:has-text("DISH")')
      .first();
    await expect(dishPill).toBeVisible({ timeout: AGENT_TIMEOUT });

    // Click "Save plan" — now calls real POST /saved/meal-plans
    const savePlanBtn = page.locator('button:has-text("Save plan")');
    await expect(savePlanBtn).toBeEnabled({ timeout: 5_000 });
    await savePlanBtn.click();

    // Assert navigation to /saved/plan/{uuid} — NOT /saved/plan/1
    await page.waitForURL(/\/saved\/plan\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });
    savedPlanUrl = page.url();

    // Assert SavedMealPlanScreen loaded with real data
    await expect(
      page.locator('[data-testid="screen-saved-meal-plan"]')
    ).toBeVisible();

    // Assert "Saved!" toast
    await expect(page.locator('[data-testid="saved-toast"]')).toBeVisible({
      timeout: 5_000,
    });

    // Assert plan heading is visible (real data loaded, not "not found")
    const planHeading = page.locator(
      '[data-testid="screen-saved-meal-plan"] h1'
    );
    await expect(planHeading).toBeVisible({ timeout: 10_000 });

    // Assert at least one recipe row
    const recipeRow = page
      .locator('[data-testid="screen-saved-meal-plan"]')
      .locator("button[aria-expanded]")
      .first();
    await expect(recipeRow).toBeVisible();
  });

  /**
   * Test 2: Sidebar fetches real data from backend list endpoints.
   */
  test("Test 2: Sidebar shows the saved plan from real API", async ({
    page,
  }) => {
    test.setTimeout(30_000);

    await page.goto("/");
    await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();

    // Open sidebar
    const menuBtn = page.locator('button[aria-label="Open menu"]');
    await menuBtn.click();

    const sidebar = page.locator('[role="dialog"]');
    await expect(sidebar).toBeVisible({ timeout: 5_000 });

    // Sidebar fetches from GET /saved/meal-plans — should have at least the plan
    // we saved in Test 1. Wait for a button inside the sidebar (plan items are buttons).
    const planItem = sidebar
      .locator('button:not([aria-label="Close sidebar"])')
      .first();
    await expect(planItem).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Test 3: Click sidebar plan item → navigates to detail, loads real data by ID.
   */
  test("Test 3: Tap saved plan in sidebar loads real data", async ({
    page,
  }) => {
    test.setTimeout(30_000);

    await page.goto("/");

    // Open sidebar
    const menuBtn = page.locator('button[aria-label="Open menu"]');
    await menuBtn.click();

    const sidebar = page.locator('[role="dialog"]');
    await expect(sidebar).toBeVisible({ timeout: 5_000 });

    // Click first plan item
    const planItem = sidebar
      .locator('button:not([aria-label="Close sidebar"])')
      .first();
    await expect(planItem).toBeVisible({ timeout: 10_000 });
    await planItem.click();

    // Assert navigated to /saved/plan/{uuid}
    await page.waitForURL(/\/saved\/plan\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });

    // Assert real data loaded (not loading, not "not found")
    await expect(
      page.locator('[data-testid="screen-saved-meal-plan"]')
    ).toBeVisible();

    // Wait for loading to finish — heading appears when data is fetched
    const planHeading = page.locator(
      '[data-testid="screen-saved-meal-plan"] h1'
    );
    await expect(planHeading).toBeVisible({ timeout: 10_000 });
    const headingText = await planHeading.innerText();
    expect(headingText.length).toBeGreaterThan(0);

    // At least one recipe row
    const recipeRow = page
      .locator('[data-testid="screen-saved-meal-plan"]')
      .locator("button[aria-expanded]")
      .first();
    await expect(recipeRow).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Test 4: Page refresh re-fetches data from backend by ID (not router state).
   */
  test("Test 4: Page refresh preserves data (re-fetched by ID)", async ({
    page,
  }) => {
    test.setTimeout(30_000);

    // Navigate directly to the saved plan URL from Test 1
    expect(savedPlanUrl).toBeTruthy();
    await page.goto(savedPlanUrl);

    // Wait for data to load
    await expect(
      page.locator('[data-testid="screen-saved-meal-plan"]')
    ).toBeVisible({ timeout: 10_000 });

    const planHeading = page.locator(
      '[data-testid="screen-saved-meal-plan"] h1'
    );
    await expect(planHeading).toBeVisible({ timeout: 10_000 });

    // Reload the page
    await page.reload();

    // Data should re-appear (fetched from API by ID, not lost)
    await expect(
      page.locator('[data-testid="screen-saved-meal-plan"]')
    ).toBeVisible({ timeout: 10_000 });
    await expect(planHeading).toBeVisible({ timeout: 10_000 });

    const headingText = await planHeading.innerText();
    expect(headingText.length).toBeGreaterThan(0);

    const recipeRow = page
      .locator('[data-testid="screen-saved-meal-plan"]')
      .locator("button[aria-expanded]")
      .first();
    await expect(recipeRow).toBeVisible({ timeout: 10_000 });
  });
});
