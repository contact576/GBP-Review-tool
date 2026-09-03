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
  test("asks which service the visit was for before anything else", async ({ page }) => {
    await scanQr(page, "harbourview");
    await expect(page.getByRole("heading", { name: /What did you come to/ })).toBeVisible();
    // Skipping is always allowed — the service question is never a gate.
    await expect(page.getByRole("button", { name: "Skip this" })).toBeVisible();
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
