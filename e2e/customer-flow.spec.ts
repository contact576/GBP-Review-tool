import { test, expect } from "@playwright/test";
import { scanQr, draftCard, collectDraftTexts } from "./helpers";

/**
 * The QR → review loop on the seeded demo workspace (slug "harbourview").
 * Runs on BOTH the desktop and mobile projects — this is the phone-first
 * customer surface.
 *
 * Compliance invariants exercised here:
 *  - 1–3★ private-feedback path ALWAYS shows the public Google review link
 *    (data-compliance="public-google-link") — no review gating.
 *  - 4★ drafts never use 5★-only superlatives.
 */

const SUPERLATIVES = /perfect|flawless|exceeded|incredible|best .* ever/i;

test.describe("customer review flow (demo workspace)", () => {
  test("5★ path: attribute chips → three distinct drafts → Copy & open Google", async ({
    page,
  }) => {
    await scanQr(page, "harbourview");
    await expect(
      page.getByRole("heading", { name: /How was your visit to Harbourview Physiotherapy/ }),
    ).toBeVisible();

    await page.getByRole("radio", { name: "5 stars" }).click();

    // Attribute chips appear (industry catalog: physiotherapy).
    await expect(page.getByRole("heading", { name: "What did you love?" })).toBeVisible();
    await page.getByRole("button", { name: "Clear explanations" }).click();
    await page.getByRole("button", { name: "Friendly staff" }).click();
    await page.getByRole("button", { name: "Write my review" }).click();

    // Three draft cards with three different texts.
    await expect(page.getByRole("heading", { name: /Pick your favourite/ })).toBeVisible();
    const texts = await collectDraftTexts(page);
    expect(new Set(texts).size).toBe(3);

    // Every draft names the business; the chosen attributes are woven in.
    for (const text of texts) expect(text).toContain("Harbourview");
    const combined = texts.join(" ").toLowerCase();
    expect(
      combined.includes("clear explanations") || combined.includes("friendly staff"),
    ).toBe(true);

    // Selecting a different card highlights it.
    const detailed = draftCard(page, "Detailed & specific");
    await detailed.click();
    await expect(detailed).toHaveClass(/ring-2/);

    // The mega CTA is present for the happy path.
    await expect(page.getByRole("button", { name: "Copy & open Google" })).toBeVisible();
  });

  test("2★ path: private feedback with the public Google link always visible", async ({
    page,
  }) => {
    await scanQr(page, "harbourview");
    await page.getByRole("radio", { name: "2 stars" }).click();

    // Private feedback form appears…
    await expect(page.getByText(/Tell us what went wrong/)).toBeVisible();
    const feedbackBox = page.getByPlaceholder(/What happened\?/);
    await expect(feedbackBox).toBeVisible();

    // …AND the public Google review link is STILL visible (no gating).
    const publicLink = page.locator('[data-compliance="public-google-link"]');
    await expect(publicLink).toBeVisible();
    await expect(
      publicLink.getByRole("link", { name: /Leave a Google review/ }),
    ).toBeVisible();

    // Submit private feedback.
    await feedbackBox.fill("The wait was long and nobody checked in on me.");
    await page.getByRole("button", { name: "Send private feedback" }).click();

    // Thank-you state still shows the ungated public link.
    // getByRole avoids a strict-mode collision with Next's route announcer,
    // which mirrors the h1 text in a role=alert live region.
    await expect(page.getByRole("heading", { name: /the owner will see this/ })).toBeVisible();
    await expect(publicLink).toBeVisible();
    await expect(
      publicLink.getByRole("link", { name: /Leave a Google review/ }),
    ).toBeVisible();
  });

  test("4★ path: drafts stay measured — no 5★-only superlatives", async ({ page }) => {
    await scanQr(page, "harbourview");
    await page.getByRole("radio", { name: "4 stars" }).click();

    await expect(page.getByRole("heading", { name: "What did you love?" })).toBeVisible();
    await page.getByRole("button", { name: "On time" }).click();
    await page.getByRole("button", { name: "Write my review" }).click();

    await expect(page.getByRole("heading", { name: /Pick your favourite/ })).toBeVisible();
    const texts = await collectDraftTexts(page);
    expect(new Set(texts).size).toBe(3);
    for (const text of texts) {
      expect(text).toContain("Harbourview");
      expect(text).not.toMatch(SUPERLATIVES);
    }
  });
});
