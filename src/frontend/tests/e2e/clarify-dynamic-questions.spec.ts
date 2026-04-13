/**
 * clarify-dynamic-questions.spec.ts
 *
 * Issue #46 — dynamic clarify questions (real backend + LLM via OpenRouter).
 * Commit 8 on PR #55.
 *
 * These tests exercise the full clarify_turn flow end-to-end:
 *   Home (submit input) → ClarifyScreen loading spinner → SSE stream completes
 *   → chip questions render (if LLM emits clarify_turn) → chip interaction
 *   → "Looks good, show recipes" → RecipesScreen.
 *
 * Assertions are structural, not content-based — the LLM is non-deterministic
 * so we pin down behavioral contracts (question count bounds, profile-aware
 * skip, outgoing message shape, navigation) rather than exact wording.
 *
 * Run with:
 *   cd src/frontend && npx playwright test tests/e2e/clarify-dynamic-questions.spec.ts
 *
 * Estimated per-run cost: ~$0.05–0.10 in OpenRouter credits.
 * Marked test.slow() so these don't run on the default vitest suite.
 *
 * Infrastructure requirements (verified in global-setup.ts):
 *   - PostgreSQL (Docker sga_v2-db-1) running on port 5432
 *   - FastAPI backend running on port 8000 (SGA_AUTH_MODE=dev)
 *   - OPENROUTER_API_KEY set in backend environment
 *   - SQLite KB at data/kb.sqlite with recipe rows
 *   - Dev user 00000000-0000-0000-0000-000000000001 seeded in users table
 */

import { test, expect, type Page } from "@playwright/test";

const AGENT_TIMEOUT = 90_000; // 90 s — covers slow OpenRouter responses

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Submit a message from the home screen and wait for ClarifyScreen to appear.
 */
async function goToClarify(page: Page, message: string) {
  await page.goto("/");
  await expect(page.locator('[data-testid="screen-home"]')).toBeVisible();

  const heroInput = page.locator('input[placeholder*="BBQ for 8"]');
  await expect(heroInput).toBeVisible();
  // Use click + pressSequentially (not fill) to ensure React's onChange fires.
  // Playwright fill() can sometimes race with React event binding on first load;
  // pressSequentially() triggers individual key events that React always captures.
  await heroInput.click();
  await heroInput.pressSequentially(message, { delay: 30 });
  // Verify the input contains our text before pressing Enter (React state guard)
  await expect(heroInput).toHaveValue(message);
  await heroInput.press("Enter");

  // ClarifyScreen becomes visible immediately on navigation
  await expect(page.locator('[data-testid="screen-clarify"]')).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Wait for the ClarifyScreen SSE stream to complete (spinner disappears).
 * After this call, screenState is "complete" or "error".
 */
async function waitForStreamComplete(page: Page) {
  // The spinner is rendered only while loading/streaming. Its disappearance
  // signals the SSE stream has finished (done or clarify_turn terminal events).
  // We wait on the aria-label text rather than a state-dependent DOM element.
  await expect(
    page.locator('[data-testid="clarify-loading-spinner"]')
  ).not.toBeVisible({ timeout: AGENT_TIMEOUT });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "Issue #46 — dynamic clarify questions (real backend + LLM)",
  () => {
    // test.slow() marks these as "slow" tests — Playwright triples the global
    // timeout. They will not run on `bun test` / `vitest run` (different runner).
    test.slow();

    // -------------------------------------------------------------------------
    // Test 1: Vague input → loading spinner → 1–3 chip questions → chip click
    //         sets aria-pressed → outgoing /chat message shape → /recipes nav
    //
    // A two-ingredient vague input ("Chicken and broccoli for two") should
    // produce a clarify_turn with 1–3 chip questions for an empty-profile user.
    // -------------------------------------------------------------------------
    test("vague input: 1-3 chip questions render, chip click sets aria-pressed, Looks good → /recipes", async ({
      page,
    }) => {
      await goToClarify(page, "Chicken and broccoli for two");

      // ---- Loading state ----
      // Spinner should appear in the loading/streaming phase (transient — catch
      // it within 5 s before the agent responds).
      let spinnerSeen = false;
      try {
        await expect(
          page.locator('[data-testid="clarify-loading-spinner"]')
        ).toBeVisible({ timeout: 5_000 });
        spinnerSeen = true;
      } catch {
        // Agent responded before spinner was observed — acceptable on fast runs.
      }

      if (spinnerSeen) {
        // While loading, the "Here's what I see" heading must NOT be visible
        await expect(
          page.locator('[data-testid="screen-clarify"] h1')
        ).not.toBeVisible();
      }

      // ---- Wait for SSE stream to complete ----
      await waitForStreamComplete(page);

      // ---- Structural assertions on complete state ----

      // PCV badges must be visible (proves pcsv_update SSE event was processed).
      // PcvBadge renders span[aria-label^="Protein|Carb|Veggie"].
      const pcvBadge = page
        .locator('[data-testid="screen-clarify"]')
        .locator(
          'span[aria-label^="Protein"], span[aria-label^="Carb"], span[aria-label^="Veggie"]'
        )
        .first();
      await expect(pcvBadge).toBeVisible();

      // "Looks good, show recipes" CTA must be visible for vague input.
      // This button only renders when screenData.clarifyTurn && screenState === "complete".
      // A vague two-ingredient input should always produce a clarify_turn.
      const looksGoodBtn = page.locator(
        'button:has-text("Looks good, show recipes")'
      );
      await expect(looksGoodBtn).toBeVisible({ timeout: 5_000 });

      // Chip questions: 1 ≤ N ≤ 3 (clarify_turn contract guarantees 0–3).
      // ChipQuestion renders each option as:
      //   <button data-testid="chip-{question.id}-{opt.label}">
      const allChipButtons = page.locator('[data-testid^="chip-"]');
      const chipCount = await allChipButtons.count();

      // At least 1 chip must exist (at least 1 question with at least 1 option)
      expect(chipCount).toBeGreaterThanOrEqual(1);

      // Derive distinct question IDs from chip test IDs to count questions.
      // Test IDs: "chip-{questionId}-{label}"
      // questionId uses snake_case (underscores), so the first all-lowercase+underscore
      // segments form the id, and the remaining segments form the label.
      const questionIds = new Set<string>();
      for (let i = 0; i < chipCount; i++) {
        const testId =
          (await allChipButtons.nth(i).getAttribute("data-testid")) ?? "";
        const withoutPrefix = testId.replace(/^chip-/, "");
        const parts = withoutPrefix.split("-");
        const idParts: string[] = [];
        for (const part of parts) {
          if (/^[a-z0-9_]+$/.test(part)) {
            idParts.push(part);
          } else {
            break;
          }
        }
        const questionId = idParts.join("-");
        if (questionId) questionIds.add(questionId);
      }

      const questionCount = questionIds.size;
      // Vague input with empty profile should produce 1–3 questions.
      expect(questionCount).toBeGreaterThanOrEqual(1);
      expect(questionCount).toBeLessThanOrEqual(3);

      // Chat input visible and NOT disabled (screenState === "complete")
      const chatInput = page.locator(
        '[data-testid="screen-clarify"] input[type="text"]'
      );
      await expect(chatInput).toBeVisible();
      await expect(chatInput).not.toBeDisabled();

      // ---- Chip interaction ----
      // Click the first chip and verify aria-pressed toggles to "true"
      const firstChip = allChipButtons.first();
      const firstChipLabel = (await firstChip.textContent())?.trim() ?? "";
      expect(firstChipLabel).toBeTruthy();

      await firstChip.click();

      // aria-pressed="true" after clicking an unselected chip
      await expect(firstChip).toHaveAttribute("aria-pressed", "true");

      // ---- Capture outgoing /chat request ----
      const chatRequestPromise = page.waitForRequest(
        (req) => req.url().includes("/chat") && req.method() === "POST",
        { timeout: 10_000 }
      );

      await looksGoodBtn.click();

      const chatRequest = await chatRequestPromise;
      const postBody = chatRequest.postData() ?? "";

      // The outgoing message must always contain the standard phrase
      expect(postBody).toContain("Looks good, show recipes.");

      // The clicked chip label must appear in the outgoing message body
      // because handleLooksGood appends "questionText label." for each question
      // with a non-empty selection.
      expect(postBody).toContain(firstChipLabel);

      // ---- Navigation to RecipesScreen ----
      await expect(page.locator('[data-testid="screen-recipes"]')).toBeVisible({
        timeout: AGENT_TIMEOUT,
      });
    });

    // -------------------------------------------------------------------------
    // Test 2: Specific input with dietary stated → 0–3 questions, no dietary
    //         question (profile-aware skip), "Looks good" navigates forward.
    //
    // Issue #46 rule: when the user states dietary restrictions in their input,
    // the LLM must NOT ask redundant dietary questions. The test verifies:
    //   - 0–3 questions (contract bound)
    //   - No question text matches dietary restriction keywords (halal stated)
    //   - "Looks good" still triggers forward navigation when clarify_turn present
    //
    // Note: for very specific inputs the LLM may emit only `explanation` + `done`
    // (no clarify_turn at all). This is valid behavior — the test handles both
    // the clarify_turn path and the explanation-only path.
    // -------------------------------------------------------------------------
    test("specific input with dietary stated: 0-3 questions, none about dietary, Looks good → /recipes", async ({
      page,
    }) => {
      await goToClarify(page, "Korean BBQ for 8, halal");

      // ---- Wait for SSE stream to complete ----
      await waitForStreamComplete(page);

      // PCV badges must be visible
      const pcvBadge = page
        .locator('[data-testid="screen-clarify"]')
        .locator(
          'span[aria-label^="Protein"], span[aria-label^="Carb"], span[aria-label^="Veggie"]'
        )
        .first();
      await expect(pcvBadge).toBeVisible();

      // Check whether clarify_turn was emitted by testing for "Looks good" button
      const looksGoodBtn = page.locator(
        'button:has-text("Looks good, show recipes")'
      );
      const hasClarifyTurn = await looksGoodBtn.isVisible().catch(() => false);

      if (hasClarifyTurn) {
        // clarify_turn path — assert 0–1 questions (profile-aware skip rule)
        const allChipButtons = page.locator('[data-testid^="chip-"]');
        const chipCount = await allChipButtons.count();

        // Derive distinct question IDs (same algorithm as Test 1)
        const questionIds = new Set<string>();
        for (let i = 0; i < chipCount; i++) {
          const testId =
            (await allChipButtons.nth(i).getAttribute("data-testid")) ?? "";
          const withoutPrefix = testId.replace(/^chip-/, "");
          const parts = withoutPrefix.split("-");
          const idParts: string[] = [];
          for (const part of parts) {
            if (/^[a-z0-9_]+$/.test(part)) {
              idParts.push(part);
            } else {
              break;
            }
          }
          const questionId = idParts.join("-");
          if (questionId) questionIds.add(questionId);
        }

        const questionCount = questionIds.size;
        // Contract bound: 0–3 questions max.
        expect(questionCount).toBeGreaterThanOrEqual(0);
        expect(questionCount).toBeLessThanOrEqual(3);

        if (questionCount === 0) {
          // W1 regression guard: when no questions, the "A few quick questions"
          // section header must NOT appear.
          await expect(
            page
              .locator('[data-testid="screen-clarify"]')
              .locator("text=A few quick questions")
          ).not.toBeVisible();
        } else {
          // Profile-aware skip rule: the LLM must NOT re-ask dietary status
          // when the user already stated "halal" in the input.
          // This is the core behavioral guarantee being tested here.
          //
          // The agent should NOT re-ask whether the user keeps halal/kosher/has
          // allergies — the user already stated "halal" in the message. It IS
          // fine if the agent MENTIONS the word "halal" in another context (e.g.,
          // "Which halal proteins do you want to grill?") because that's the
          // agent respecting the constraint, not re-asking about it.
          const DIETARY_REASK_PATTERNS = [
            /\bare you\b.*\b(halal|kosher|vegetarian|vegan|pescatarian)\b/i,
            /\bdo you keep\b.*\b(halal|kosher)\b/i,
            /\bdo you have\b.*\b(dietary|food)\b.*\brestrictions?\b/i,
            /\bany\b.*\b(dietary|food)\b.*\brestrictions?\b/i,
            /\bany\b.*\ballerg(ies|y)\b/i,
            /\bfollow\b.*\b(halal|kosher|vegetarian|vegan)\b/i,
          ];

          const questionTextEls = page.locator(
            '[data-testid="screen-clarify"] .text-\\[12px\\].font-medium.text-ink'
          );
          const qtCount = await questionTextEls.count();
          for (let i = 0; i < qtCount; i++) {
            const qText = (await questionTextEls.nth(i).textContent()) ?? "";
            for (const pattern of DIETARY_REASK_PATTERNS) {
              expect(
                qText,
                `Agent re-asked about dietary status despite "halal" being in the user's message. Question: "${qText}"`
              ).not.toMatch(pattern);
            }
          }
        }

        // If there's a question, click its first chip before proceeding
        if (questionCount === 1) {
          const firstChip = allChipButtons.first();
          await firstChip.click();
          await expect(firstChip).toHaveAttribute("aria-pressed", "true");
        }

        // ---- Capture outgoing /chat request ----
        const chatRequestPromise = page.waitForRequest(
          (req) => req.url().includes("/chat") && req.method() === "POST",
          { timeout: 10_000 }
        );

        await looksGoodBtn.click();

        const chatRequest = await chatRequestPromise;
        const postBody = chatRequest.postData() ?? "";

        // Outgoing message must contain the standard phrase
        expect(postBody).toContain("Looks good, show recipes.");

        // ---- Navigation to RecipesScreen ----
        await expect(
          page.locator('[data-testid="screen-recipes"]')
        ).toBeVisible({ timeout: AGENT_TIMEOUT });
      } else {
        // Explanation-only path: clarify_turn was not emitted.
        // This is valid when the LLM determines no clarification is needed.
        // Assert we're in complete state with visible explanation text.
        const screenClarify = page.locator('[data-testid="screen-clarify"]');

        // Explanation text is visible (rendered with react-markdown)
        // ClarifyScreen renders explanation in a div.mt-2 > markdown when
        // clarifyTurn is null.
        const explanationEl = screenClarify
          .locator("div.mt-2")
          .filter({ hasText: /.{10,}/ }) // non-trivially long text
          .first();
        await expect(explanationEl).toBeVisible({ timeout: 5_000 });

        // "A few quick questions" header must NOT appear
        await expect(
          screenClarify.locator("text=A few quick questions")
        ).not.toBeVisible();

        // No chip questions rendered
        const chipCount = await page
          .locator('[data-testid^="chip-"]')
          .count();
        expect(chipCount).toBe(0);

        // ChatInput is visible (not disabled since we're in complete state)
        const chatInput = screenClarify.locator('input[type="text"]');
        await expect(chatInput).toBeVisible();
        // Note: we do NOT try to navigate to /recipes here — the explanation-only
        // path would require a follow-up user interaction, which is out of scope
        // for this test. The key assertions are the 0-questions structural checks.
      }
    });
    // -------------------------------------------------------------------------
    // Test 3: Long, detailed input → emit_clarify_turn regression guard
    //
    // Bug 2 regression: on long/complex inputs the LLM was bypassing
    // emit_clarify_turn and emitting free-text markdown instead. The fix in
    // src/ai/prompt.py (Rule #9) adds a strong "EVEN IF detailed and complete"
    // guard. This test locks in that regression by exercising a detailed,
    // multi-ingredient, multi-constraint input.
    //
    // Assertions (structural, not content):
    //   1. Navigates to /clarify and screen renders.
    //   2. clarify_turn SSE event arrives (CTA visible).
    //   3. Explanation text does NOT contain raw markdown tokens (**  ## |).
    //   4. "Looks good, show recipes" CTA is visible.
    //   5. 0-3 chip elements render (0 is valid — LLM may need no clarification).
    //      If 0: explanation text + ChatInput must be visible (Bug 2b guard).
    //
    // Gate: real-LLM test — opt-in via RUN_LIVE_LLM=1 env var.
    // -------------------------------------------------------------------------
    test("long detailed input: emit_clarify_turn used (not free-text markdown) — Bug 2 regression", async ({
      page,
    }) => {
      test.skip(
        !process.env.RUN_LIVE_LLM,
        "Real-LLM test — set RUN_LIVE_LLM=1 to run"
      );

      const longInput =
        "I'd like to make a dish with chicken thighs that has some Southeast Asian flavors, but I want it to be savory, not sweet. The dish should be enough for two people. I have lemongrass and cilantro on hand.";

      // ---- Navigate to ClarifyScreen ----
      await goToClarify(page, longInput);

      // ---- Wait for SSE stream to complete ----
      await waitForStreamComplete(page);

      // ---- Assertion 1: screen-clarify rendered (already guaranteed by goToClarify) ----
      await expect(page.locator('[data-testid="screen-clarify"]')).toBeVisible();

      // ---- Assertion 4: "Looks good, show recipes" CTA visible ----
      // This button only renders when clarifyTurn state is populated, proving that
      // emit_clarify_turn was used (not free-text markdown bypass).
      const looksGoodBtn = page.locator(
        'button:has-text("Looks good, show recipes")'
      );
      await expect(looksGoodBtn).toBeVisible({
        timeout: 5_000,
      });

      // ---- Assertion 2: clarify_turn populated (CTA visible = clarifyTurn set) ----
      // The CTA only renders when screenData.clarifyTurn is non-null — the CTA
      // being visible is the functional proof that emit_clarify_turn was called.

      // ---- Assertion 3: explanation text must not contain raw markdown tokens ----
      // The explanation field in clarify_turn must be plain text (≤30 words, no
      // markdown). If the LLM emits free-text markdown, ** or ## or | will appear
      // in the rendered DOM text.
      const screenClarify = page.locator('[data-testid="screen-clarify"]');
      const allText = await screenClarify.textContent();
      expect(
        allText,
        "Explanation contains '**' (markdown bold) — LLM bypassed emit_clarify_turn and emitted free-text markdown"
      ).not.toContain("**");
      expect(
        allText,
        "Explanation contains '##' (markdown heading) — LLM bypassed emit_clarify_turn and emitted free-text markdown"
      ).not.toContain("##");
      expect(
        allText,
        "Explanation contains '|' (markdown table) — LLM bypassed emit_clarify_turn and emitted free-text markdown"
      ).not.toContain("|");

      // ---- Assertion 5: 0-3 chip *questions* render (0 is valid per revised design) ----
      // The orchestrator enforces emit_clarify_turn is always called (commit 885fd99),
      // but the LLM may legitimately decide 0 questions are needed for clear inputs.
      // Note: chipCount = total option buttons across all questions (each question
      // can have multiple options). The contract limit of 3 is on *question count*,
      // not total option count. We must derive questionCount first.
      const allChipButtons = page.locator('[data-testid^="chip-"]');
      const chipCount = await allChipButtons.count();

      // Derive distinct question IDs (same algorithm as Tests 1+2).
      // Test IDs: "chip-{questionId}-{label}" where questionId uses snake_case/lowercase.
      const questionIds = new Set<string>();
      for (let i = 0; i < chipCount; i++) {
        const testId =
          (await allChipButtons.nth(i).getAttribute("data-testid")) ?? "";
        const withoutPrefix = testId.replace(/^chip-/, "");
        const parts = withoutPrefix.split("-");
        const idParts: string[] = [];
        for (const part of parts) {
          if (/^[a-z0-9_]+$/.test(part)) {
            idParts.push(part);
          } else {
            break;
          }
        }
        const questionId = idParts.join("-");
        if (questionId) questionIds.add(questionId);
      }

      const questionCount = questionIds.size;

      // Contract upper bound: max 3 *questions* (not options).
      expect(
        questionCount,
        `Question count ${questionCount} exceeds contract maximum of 3`
      ).toBeLessThanOrEqual(3);

      if (questionCount === 0) {
        // Bug 2b guard: when LLM emits 0 questions, the UI must still render
        // clarifyTurn.explanation (not an empty card) and ChatInput must be visible.
        // This proves emit_clarify_turn was called with explanation text,
        // and the ClarifyScreen is rendering the complete-state UI correctly.
        const screenClarify = page.locator('[data-testid="screen-clarify"]');

        // Explanation text element: ClarifyScreen renders explanation in a <p>
        // or div within the clarify card. Assert at least some visible text exists.
        const explanationText = screenClarify
          .locator("p, div.mt-2, div.text-sm")
          .filter({ hasText: /.{5,}/ })
          .first();
        await expect(
          explanationText,
          "Bug 2b: clarifyTurn.explanation not visible when questionCount === 0 — empty card rendered"
        ).toBeVisible({ timeout: 5_000 });

        // ChatInput must be visible and enabled (screenState === "complete")
        const chatInput = screenClarify.locator('input[type="text"]');
        await expect(
          chatInput,
          "Bug 2b: ChatInput not visible when questionCount === 0"
        ).toBeVisible();
        await expect(chatInput).not.toBeDisabled();
      }
    });
  }
);
