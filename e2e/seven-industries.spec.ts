import { test, expect, type Page } from "@playwright/test";
import {
  registerAccount,
  uniqueEmail,
  captureCustomer,
  rateExperience,
} from "./helpers";

/**
 * The 7-industry scenario matrix (desktop): each scenario registers a fresh
 * account, captures a customer through the staff PWA, verifies the request
 * pipeline, then follows the location QR from Studio into a live customer
 * review page with the same policy-safe, customer-authored experience.
 *
 * Note: the sign-up Industry select has no direct "renovation" option (it
 * offers "Contractor / renovation" = general_contractor). The renovation
 * scenario therefore registers as general_contractor and switches to
 * "Renovation" via the onboarding business-type picker — which is the
 * product's own flow for refining the industry.
 */

interface Scenario {
  industryKey: string;
  business: string;
  /** Retained scenario vocabulary used elsewhere in the industry catalog. */
  attribute: string;
  /** Sign-up select value when it differs from the target industry. */
  signupKey?: string;
  /** Business-type picker chip to click after sign-up. */
  pickerLabel?: string;
  /** Complete the whole 5★ customer journey for this one. */
  fullFlow?: boolean;
}

const SCENARIOS: Scenario[] = [
  { industryKey: "restaurant", business: "Trattoria Nova", attribute: "Great food" },
  { industryKey: "physiotherapy", business: "Northshore Physio", attribute: "Clear explanations" },
  {
    industryKey: "renovation",
    business: "Oakline Renovations",
    attribute: "Quality work",
    signupKey: "general_contractor",
    pickerLabel: "Renovation",
  },
  { industryKey: "real_estate", business: "Harbor Realty Group", attribute: "Knows the market" },
  { industryKey: "salon", business: "Velvet & Vine Salon", attribute: "Loved the result" },
  {
    industryKey: "auto_repair",
    business: "Redline Auto Works",
    attribute: "Honest diagnosis",
    fullFlow: true,
  },
  { industryKey: "cafe", business: "Fig & Fern Cafe", attribute: "Great coffee" },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read the location QR slug from the Studio short-URL line. */
async function studioSlug(page: Page): Promise<string> {
  await page.goto("/app/studio");
  await expect(page.getByText("Front desk QR").first()).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toContain("/q/");
  const match = body.match(/\/q\/([a-z0-9][a-z0-9-]*)/);
  expect(match, "Studio should show a /q/<slug> short URL").toBeTruthy();
  return match![1]!;
}

for (const s of SCENARIOS) {
  test(`${s.industryKey}: ${s.business} — register → capture → request → authentic review flow`, async ({
    page,
  }) => {
    // 1. Fresh account with this industry.
    await registerAccount(page, {
      name: "Morgan Vega",
      email: uniqueEmail(s.industryKey),
      business: s.business,
      industryKey: s.signupKey ?? s.industryKey,
    });

    // 1b. Refine industry via the onboarding picker when sign-up lacks it.
    if (s.pickerLabel) {
      await page.goto("/onboarding/business-type");
      await page.getByRole("button", { name: s.pickerLabel }).click();
      await expect(page.getByText(/attribute catalog for/)).toContainText(s.pickerLabel);
    }

    // 2. Staff PWA capture with service consent.
    const customerName = `Casey ${s.business.split(" ")[0]}`;
    await captureCustomer(page, customerName, uniqueEmail(`cust-${s.industryKey}`));

    // 3. The request shows up in the desktop ledger with a real status + consent
    //    basis. The requests list is the shared Table primitive at desktop width,
    //    so each request is a semantic table row (customer · channel · consent ·
    //    rating · sent · status); the consent basis renders as a "Service" badge.
    await page.goto("/app/requests");
    const row = page.getByRole("row").filter({ hasText: customerName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Sent|Failed/);
    await expect(row).toContainText("Service");

    // 4. Studio exposes the location QR + short /q/ URL.
    const slug = await studioSlug(page);

    // 5. Scanning the QR mints a live review session for THIS business, and the
    //    panel opens on the service question naming that business.
    await page.goto(`/q/${slug}`);
    await page.waitForURL(/\/r\/[A-Za-z0-9_]+/);
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`What did you come to ${escapeRegex(s.business)} for`),
      }),
    ).toBeVisible();

    // 6. Every industry offers its own service list, then the same rating step.
    await rateExperience(page, 5);
    await expect(page.locator('[data-compliance="public-google-link"]')).toBeVisible();

    // 7. For auto_repair, run the full 5★ journey to the thank-you page using
    //    the customer's own words rather than any suggested wording.
    if (s.fullFlow) {
      const ownWords = page.getByRole("button", { name: /Write my own/ });
      if (await ownWords.isVisible().catch(() => false)) await ownWords.click();
      await page.getByLabel("Your Google review in your own words").fill(
        "The team explained the work clearly and treated me with respect.",
      );
      await page.getByRole("link", { name: "Copy my words & open Google" }).click();
      await page.waitForURL(/\/thanks/);
      await expect(page.getByText(/Thank you/i)).toBeVisible();
    }
  });
}
