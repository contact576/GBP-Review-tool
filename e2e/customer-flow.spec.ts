import { test, expect } from "@playwright/test";
import { scanQr, rateExperience } from "./helpers";

/**
 * Compliance invariants for the service → experience → draft panel:
 * - every star rating reaches the same writing surface and the same public link;
 * - suggested wording is a starting point the customer can always edit or replace;
 * - writing from scratch is always one tap away;
 * - private feedback never hides the public Google review link.
 */
test.describe("customer review flow (demo workspace)", () => {
  test("a fresh scan opens on a welcome that explains the steps and keeps the Google link", async ({ page }) => {
    await page.goto("/q/harbourview");
    await page.waitForURL(/\/r\/[A-Za-z0-9_]+/);
    await expect(page.getByRole("heading", { name: /Thanks for choosing/ })).toBeVisible();
    await expect(page.getByText(/About a minute/)).toBeVisible();
    await expect(page.getByRole("list", { name: "How this works" })).toBeVisible();
    // The welcome is an explainer, never a gate: the public link is on it too.
    await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
    await page.getByRole("button", { name: "Start my review" }).click();
    await expect(page.getByRole("heading", { name: /What did you come to/ })).toBeVisible();
  });

  test("asks which service the visit was for before anything else", async ({ page }) => {
    await scanQr(page, "harbourview");
    await expect(page.getByRole("heading", { name: /What did you come to/ })).toBeVisible();
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible();
    // Skipping is always allowed — the service question is never a gate.
    await expect(page.getByRole("button", { name: "Skip this" })).toBeVisible();
  });

  test("experience chips follow the service the customer picked", async ({ page }) => {
    await scanQr(page, "harbourview");
    // Pick the first real service, rate, and the chips lead with ones about that service.
    const firstService = page.getByRole("group", { name: "Services" }).getByRole("button").first();
    const label = (await firstService.innerText()).trim();
    await firstService.click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: "5 stars" }).click();
    await expect(page.getByText(new RegExp(`Chips tuned to ${label.toLowerCase()}`, "i"))).toBeVisible();
    await expect(page.getByRole("group", { name: "What stood out" })).toBeVisible();
  });

  test("the writing step says what happens after the tap", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 5);
    await expect(page.getByRole("list", { name: "How posting works" })).toBeVisible();
    await page.getByRole("button", { name: "How does posting work?" }).click();
    const sheet = page.getByRole("dialog", { name: /what happens next/i });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Got it" }).click();
    await expect(sheet).toBeHidden();
    // Closing the explainer leaves the public link exactly where it was.
    await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
  });

  for (const stars of [1, 2, 3, 4, 5] as const) {
    test(`${stars}-star path reaches the same writing surface`, async ({ page }) => {
      await scanQr(page, "harbourview");
      await rateExperience(page, stars);

      // Either suggested wording or the blank editor — both are the same
      // surface, and both keep the public Google link visible.
      await expect(
        page.getByRole("heading", {
          name: /Here's a starting point|Share your experience in your own words/,
        }),
      ).toBeVisible();
      await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
      await expect(page.getByText(/available for every rating/i)).toBeVisible();
    });
  }

  test("suggested wording is editable and can always be replaced with your own", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 5);

    const ownWords = page.getByRole("button", { name: /Write my own/ });
    // When drafts rendered, the escape hatch must be present and must work.
    if (await ownWords.isVisible().catch(() => false)) {
      // Two paragraphs carry edit-it-yourself wording (the source disclaimer
      // and the "built from your answers" line), so scope to the first.
      await expect(
        page.getByText(/edit it so it's your own words|edit anything that isn't right/i).first(),
      ).toBeVisible();
      await ownWords.click();
    }
    await expect(page.getByLabel("Your Google review in your own words")).toBeVisible();
  });

  test("clarity assistance starts from customer-authored text", async ({ page }) => {
    await scanQr(page, "harbourview");
    await rateExperience(page, 5);

    const ownWords = page.getByRole("button", { name: /Write my own/ });
    if (await ownWords.isVisible().catch(() => false)) await ownWords.click();

    const review = page.getByLabel("Your Google review in your own words");
    await review.fill("staff were kind and helpful");
    await page.getByRole("button", { name: "Improve clarity only" }).click();
    await expect(review).toHaveValue("Staff were kind and helpful.");
    await expect(page.getByText(/nothing was added or changed|clarity improved/i)).toBeVisible();
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
