import { test, expect } from "@playwright/test";

test("smoke: home screen loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();
});
