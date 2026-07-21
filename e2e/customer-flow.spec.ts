import { test, expect } from "@playwright/test";
import { scanQr } from "./helpers";

/**
 * Compliance invariants:
 * - every star rating reaches the same customer-authored review screen;
 * - no AI-written review variants or keyword prompts are offered;
 * - private feedback never hides the public Google review link.
 */
test.describe("customer review flow (demo workspace)", () => {
  for (const stars of [1, 2, 3, 4, 5] as const) {
    test(`${stars}-star path reaches the same authentic writing surface`, async ({ page }) => {
      await scanQr(page, "harbourview");
      await page.getByRole("radio", { name: `${stars} star${stars === 1 ? "" : "s"}` }).click();

      await expect(
        page.getByRole("heading", { name: "Share your experience in your own words" }),
      ).toBeVisible();
      await expect(page.getByLabel("Your Google review in your own words")).toBeVisible();
      await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();
      await expect(page.getByText(/available for every rating/i)).toBeVisible();
    });
  }

  test("clarity assistance starts from customer-authored text", async ({ page }) => {
    await scanQr(page, "harbourview");
    await page.getByRole("radio", { name: "5 stars" }).click();
    const review = page.getByLabel("Your Google review in your own words");
    await review.fill("staff were kind and helpful");
    await page.getByRole("button", { name: "Improve clarity only" }).click();
    await expect(review).toHaveValue("Staff were kind and helpful.");
    await expect(page.getByText(/nothing was added or changed|clarity improved/i)).toBeVisible();
  });

  test("private feedback remains optional and keeps the public path visible", async ({ page }) => {
    await scanQr(page, "harbourview");
    await page.getByRole("radio", { name: "2 stars" }).click();
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
