import { test, expect } from "@playwright/test";
import { scanQr, rateExperience, reviewBox, collectDraftTexts, DRAFT_TONES } from "./helpers";

/**
 * Compliance invariants for the two-screen customer flow:
 * - every star rating reaches the same review box and the same public link;
 * - suggested wording is a starting point the customer can always edit or replace;
 * - writing from scratch is always one tap away;
 * - private feedback never hides the public Google review link.
 */
test.describe("customer review flow (demo workspace)", () => {
  test("a fresh scan lands on one screen that explains itself and keeps the Google link", async ({ page }) => {
    await scanQr(page, "harbourview");
    await expect(page.getByRole("heading", { name: /Thanks for choosing/ })).toBeVisible();
    await expect(page.getByText(/About a minute/)).toBeVisible();
    // The three questions are all on this screen — no wizard to click through.
    await expect(page.getByRole("heading", { name: "What did you come in for?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Services" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Rate your experience" })).toBeVisible();
    // The explainer is never a gate: the public link is on the first screen too.
    await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
    // Nothing is required before rating — the continue button only waits for a star.
    await expect(page.getByRole("button", { name: "Tap a star to continue" })).toBeDisabled();
  });

  test("the customer can pick more than one service", async ({ page }) => {
    await scanQr(page, "harbourview");
    const services = page.getByRole("group", { name: "Services" });
    await services.getByRole("button", { name: "Injury rehab", exact: true }).click();
    await services.getByRole("button", { name: "Manual therapy", exact: true }).click();
    await expect(services.getByRole("button", { name: "Injury rehab", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(services.getByRole("button", { name: "Manual therapy", exact: true })).toHaveAttribute("aria-pressed", "true");
    // Tapping again clears just that one.
    await services.getByRole("button", { name: "Manual therapy", exact: true }).click();
    await expect(services.getByRole("button", { name: "Manual therapy", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(services.getByRole("button", { name: "Injury rehab", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("what-stood-out chips are grouped under each service the customer picked", async ({ page }) => {
    await scanQr(page, "harbourview");
    const services = page.getByRole("group", { name: "Services" });
    await services.getByRole("button", { name: "Injury rehab", exact: true }).click();
    await services.getByRole("button", { name: "Manual therapy", exact: true }).click();
    await services.getByRole("button", { name: "Exercise programs", exact: true }).click();
    // Chips only appear once there is a rating to attach them to.
    await expect(page.getByRole("group", { name: "What stood out", exact: true })).toBeHidden();
    await page.getByRole("radio", { name: "5 stars" }).click();
    // Two physio services share a vocabulary, so they share one labelled row;
    // the exercise programme gets its own; the industry's general row follows.
    await expect(page.getByRole("group", { name: "What stood out about Injury rehab & Manual therapy" })).toBeVisible();
    await expect(page.getByRole("group", { name: "What stood out about Exercise programs" })).toBeVisible();
    await expect(page.getByRole("group", { name: "What stood out overall" })).toBeVisible();
    // A chip is never repeated across the rows.
    const labels = await page.getByRole("group", { name: "What stood out", exact: true }).getByRole("button").allInnerTexts();
    const normalised = labels.map((label) => label.trim().toLowerCase());
    expect(new Set(normalised).size).toBe(normalised.length);
  });

  test("the writing screen is one box, a Copy button and one Google button", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 5, ["Injury rehab", "Manual therapy"]);
    await expect(reviewBox(page)).toBeVisible();
    // The services the customer picked are echoed back, so the wording is checkable.
    const told = page.getByLabel("What you told us");
    await expect(told).toContainText("Injury rehab");
    await expect(told).toContainText("Manual therapy");
    // Three tones to switch between, plus a blank page — all in the same box.
    const texts = await collectDraftTexts(page);
    expect(new Set(texts).size).toBe(DRAFT_TONES.length);
    for (const text of texts) expect(text.toLowerCase()).toContain("injury rehab and manual therapy");
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
    await expect(page.getByRole("list", { name: "How posting works" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Copy & open Google" })).toBeVisible();
    await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
  });

  test("Copy puts the wording on the clipboard and says so", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are a Chromium API");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await scanQr(page, "harbourview");
    await rateExperience(page, 5, "Injury rehab");
    await expect(reviewBox(page)).not.toHaveValue("");
    const expected = (await reviewBox(page).inputValue()).trim();
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect(page.getByText(/Paste it into the Google review box/)).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.trim()).toBe(expected);
    // Once copied, the Google button says what is left to do.
    await expect(page.getByRole("link", { name: "Open Google & paste" })).toBeVisible();
  });

  for (const stars of [1, 2, 3, 4, 5] as const) {
    test(`${stars}-star path reaches the same review box`, async ({ page }) => {
      await scanQr(page, "harbourview");
      await rateExperience(page, stars);

      // Either suggested wording or the blank box — both are the same
      // surface, and both keep the public Google link visible.
      await expect(
        page.getByRole("heading", {
          name: /Your review is ready|Your review, in your own words/,
        }),
      ).toBeVisible();
      await expect(reviewBox(page)).toBeVisible();
      await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
      await expect(page.getByText(/available for every rating/i)).toBeVisible();
    });
  }

  test("suggested wording is editable and can always be replaced with your own", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 5);

    const box = reviewBox(page);
    await expect(box).toBeVisible();
    // An edit lands in the box directly — there is no separate edit mode.
    await box.fill("My own sentence about the visit.");
    await expect(box).toHaveValue("My own sentence about the visit.");

    const ownWords = page.getByRole("radio", { name: "Write my own" });
    // When drafts rendered, the escape hatch must be present and must work.
    if (await ownWords.isVisible().catch(() => false)) {
      await expect(page.getByText(/edit it so it's your own words/i)).toBeVisible();
      await ownWords.click();
      await expect(box).toHaveValue("");
      // And the suggestion is still there, untouched by the blank page.
      await page.getByRole("radio", { name: DRAFT_TONES[0] }).click();
      await expect(box).toHaveValue("My own sentence about the visit.");
    }
  });

  test("clarity assistance starts from customer-authored text", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 5);

    const ownWords = page.getByRole("radio", { name: "Write my own" });
    if (await ownWords.isVisible().catch(() => false)) await ownWords.click();

    const review = reviewBox(page);
    await review.fill("staff were kind and helpful");
    await page.getByRole("button", { name: "Improve clarity only" }).click();
    await expect(review).toHaveValue("Staff were kind and helpful.");
    await expect(page.getByText(/nothing was added or changed|clarity improved/i)).toBeVisible();
  });

  test("changing your answers keeps what you already picked", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 4, "Injury rehab");
    await page.getByRole("button", { name: "Change my answers" }).click();
    await expect(page.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("group", { name: "Services" }).getByRole("button", { name: "Injury rehab", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("private feedback remains optional and keeps the public path visible", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 2);
    await page.getByRole("button", { name: "Send private feedback instead" }).click();

    const publicLink = page.locator('[data-compliance="public-google-link"]');
    await expect(publicLink).toBeVisible();
    const feedback = page.getByLabel("Your private feedback");
    await feedback.fill("The wait was long and nobody checked in on me.");
    await page.getByRole("button", { name: "Send private feedback" }).click();

    await expect(page.getByRole("heading", { name: /the owner will see this/i })).toBeVisible();
    await expect(publicLink).toBeVisible();
  });
});
