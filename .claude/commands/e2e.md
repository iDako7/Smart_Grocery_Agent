---
description: Generate and run end-to-end tests with Playwright. Creates test journeys, runs tests, captures screenshots/videos/traces, and uploads artifacts.
---

# E2E Command

This command invokes the **e2e-runner** agent to generate, maintain, and execute end-to-end tests using Playwright.

## What This Command Does

1. **Generate Test Journeys** - Create Playwright tests for user flows
2. **Run E2E Tests** - Execute tests across browsers
3. **Capture Artifacts** - Screenshots, videos, traces on failures
4. **Upload Results** - HTML reports and JUnit XML
5. **Identify Flaky Tests** - Quarantine unstable tests

## When to Use

Use `/e2e` when:
- Testing critical user journeys (login, list management, AI suggestions)
- Verifying multi-step flows work end-to-end
- Testing UI interactions and navigation
- Validating integration between frontend and backend
- Preparing for production deployment

## How It Works

The e2e-runner agent will:

1. **Analyze user flow** and identify test scenarios
2. **Generate Playwright test** using Page Object Model pattern
3. **Run tests** across multiple browsers (Chrome, Firefox, Safari)
4. **Capture failures** with screenshots, videos, and traces
5. **Generate report** with results and artifacts
6. **Identify flaky tests** and recommend fixes

## Example Usage

```
User: /e2e Test the grocery list item management flow

Agent (e2e-runner):
# E2E Test Generation: Grocery List Item Management

## Test Scenario Identified

**User Journey:** Login → View Lists → Add Section → Add Items → Edit Item → Delete Item

**Test Coverage:**
1. Navigate to grocery list page
2. Create a new section
3. Add items to section
4. Edit an item
5. Delete an item (soft delete)
6. Verify list state

## Generated Test Code

```typescript
// e2e/grocery-list/item-management.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Grocery List Item Management', () => {
  test('user can add, edit, and delete items', async ({ page }) => {
    // 1. Navigate to grocery list
    await page.goto('/')
    await expect(page).toHaveTitle(/Grocery/)

    // 2. Create a new section
    await page.click('[data-testid="add-section"]')
    await page.fill('[data-testid="section-name"]', 'Produce')
    await page.click('[data-testid="save-section"]')
    await expect(page.locator('text=Produce')).toBeVisible()

    // 3. Add an item to the section
    await page.click('[data-testid="add-item"]')
    await page.fill('[data-testid="item-name"]', 'Apples')
    await page.click('[data-testid="save-item"]')

    // Wait for API response
    await page.waitForResponse(resp =>
      resp.url().includes('/api/v1/items') && resp.status() === 201
    )

    await expect(page.locator('text=Apples')).toBeVisible()

    // Take screenshot of list with item
    await page.screenshot({ path: 'artifacts/list-with-item.png' })

    // 4. Edit the item
    await page.click('[data-testid="edit-item"]')
    await page.fill('[data-testid="item-name"]', 'Green Apples')
    await page.click('[data-testid="save-item"]')
    await expect(page.locator('text=Green Apples')).toBeVisible()

    // 5. Delete the item (soft delete)
    await page.click('[data-testid="delete-item"]')
    await expect(page.locator('text=Green Apples')).not.toBeVisible()

    // Take screenshot of empty section
    await page.screenshot({ path: 'artifacts/section-after-delete.png' })
  })

  test('shows empty state when no items exist', async ({ page }) => {
    await page.goto('/')

    // Verify empty state
    await expect(page.locator('[data-testid="empty-list"]')).toBeVisible()
  })
})
```

## Running Tests

```bash
# Run the generated test
npx playwright test e2e/grocery-list/item-management.spec.ts

Running 2 tests using 2 workers

  ✓  [chromium] › item-management.spec.ts:5:3 › user can add, edit, and delete items (4.2s)
  ✓  [chromium] › item-management.spec.ts:47:3 › shows empty state when no items exist (1.3s)

  2 passed (5.7s)

Artifacts generated:
- artifacts/list-with-item.png
- artifacts/section-after-delete.png
- playwright-report/index.html
```

## Test Report

```
╔══════════════════════════════════════════════════════════════╗
║                    E2E Test Results                          ║
╠══════════════════════════════════════════════════════════════╣
║ Status:     ✅ ALL TESTS PASSED                              ║
║ Total:      2 tests                                          ║
║ Passed:     2 (100%)                                         ║
║ Failed:     0                                                ║
║ Flaky:      0                                                ║
║ Duration:   5.7s                                             ║
╚══════════════════════════════════════════════════════════════╝

Artifacts:
📸 Screenshots: 2 files
📹 Videos: 0 files (only on failure)
🔍 Traces: 0 files (only on failure)
📊 HTML Report: playwright-report/index.html

View report: npx playwright show-report
```

✅ E2E test suite ready for CI/CD integration!
```

## Test Artifacts

When tests run, the following artifacts are captured:

**On All Tests:**
- HTML Report with timeline and results
- JUnit XML for CI integration

**On Failure Only:**
- Screenshot of the failing state
- Video recording of the test
- Trace file for debugging (step-by-step replay)
- Network logs
- Console logs

## Viewing Artifacts

```bash
# View HTML report in browser
npx playwright show-report

# View specific trace file
npx playwright show-trace artifacts/trace-abc123.zip

# Screenshots are saved in artifacts/ directory
open artifacts/search-results.png
```

## Flaky Test Detection

If a test fails intermittently:

```
⚠️  FLAKY TEST DETECTED: e2e/grocery-list/item-management.spec.ts

Test passed 7/10 runs (70% pass rate)

Common failure:
"Timeout waiting for element '[data-testid="save-item"]'"

Recommended fixes:
1. Add explicit wait: await page.waitForSelector('[data-testid="save-item"]')
2. Increase timeout: { timeout: 10000 }
3. Check for race conditions in component
4. Verify element is not hidden by animation

Quarantine recommendation: Mark as test.fixme() until fixed
```

## Browser Configuration

Tests run on multiple browsers by default:
- ✅ Chromium (Desktop Chrome)
- ✅ Firefox (Desktop)
- ✅ WebKit (Desktop Safari)
- ✅ Mobile Chrome (optional)

Configure in `playwright.config.ts` to adjust browsers.

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/e2e.yml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npx playwright test

- name: Upload artifacts
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## SmartGroceryAssistant Critical Flows

Prioritize these E2E tests for SmartGroceryAssistant:

**🔴 CRITICAL (Must Always Pass):**
1. User can sign up and log in
2. User can create grocery list sections
3. User can add items to a section
4. User can edit and delete items (soft delete)
5. User can view their grocery lists
6. API Gateway correctly proxies requests with JWT auth

**🟡 IMPORTANT:**
1. AI suggestion flow (POST → queue → poll for result)
2. User profile updates
3. Search and filter items
4. Section reordering
5. Cross-service auth (JWT verified at gateway + downstream)
6. Mobile responsive layout

## Best Practices

**DO:**
- ✅ Use Page Object Model for maintainability
- ✅ Use data-testid attributes for selectors
- ✅ Wait for API responses, not arbitrary timeouts
- ✅ Test critical user journeys end-to-end
- ✅ Run tests before merging to main
- ✅ Review artifacts when tests fail

**DON'T:**
- ❌ Use brittle selectors (CSS classes can change)
- ❌ Test implementation details
- ❌ Run tests against production
- ❌ Ignore flaky tests
- ❌ Skip artifact review on failures
- ❌ Test every edge case with E2E (use unit tests)

## Important Notes

**CRITICAL for SmartGroceryAssistant:**
- E2E tests must have the full stack running (postgres, redis, rabbitmq + all services)
- Use `docker compose up` or `tilt up` to start the full stack before running E2E tests
- Tests that trigger AI suggestions need RabbitMQ and the AI worker running
- Use test user accounts, not real user data

## Integration with Other Commands

- Use `/plan` to identify critical journeys to test
- Use `/tdd` for unit tests (faster, more granular)
- Use `/e2e` for integration and user journey tests
- Use `/code-review` to verify test quality

## Related Agents

This command invokes the `e2e-runner` agent provided by ECC.

For manual installs, the source file lives at:
`agents/e2e-runner.md`

## Quick Commands

```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test e2e/grocery-list/item-management.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Debug test
npx playwright test --debug

# Generate test code
npx playwright codegen http://localhost:3000

# View report
npx playwright show-report
```
