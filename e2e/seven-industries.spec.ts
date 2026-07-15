import { test, expect, type Page } from "@playwright/test";
import {
  registerAccount,
  uniqueEmail,
  captureCustomer,
  collectDraftTexts,
} from "./helpers";

/**
 * The 7-industry scenario matrix (desktop): each scenario registers a fresh
 * account, captures a customer through the staff PWA, verifies the request
 * pipeline, then follows the location QR from Studio into a live customer
 * review page with industry-correct attribute chips.
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
  /** Industry-specific attribute chip expected on the customer review page. */
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
  test(`${s.industryKey}: ${s.business} — register → capture → request → QR scan → industry chips`, async ({
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

    // 3. The request shows up with a real status.
    await page.goto("/app/requests");
    const row = page.locator("div.rounded-card").filter({ hasText: customerName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Sent");
    await expect(row).toContainText("Service consent");

    // 4. Studio exposes the location QR + short /q/ URL.
    const slug = await studioSlug(page);

    // 5. Scanning the QR mints a live review session for THIS business.
    await page.goto(`/q/${slug}`);
    await page.waitForURL(/\/r\/[A-Za-z0-9_]+/);
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`How was your visit to ${escapeRegex(s.business)}`),
      }),
    ).toBeVisible();

    // 6. 5★ reveals industry-specific attribute chips from the catalog.
    await page.getByRole("radio", { name: "5 stars" }).click();
    await expect(page.getByRole("heading", { name: "What did you love?" })).toBeVisible();
    await expect(page.getByRole("button", { name: s.attribute })).toBeVisible();

    // 7. For auto_repair, run the full 5★ journey to the thank-you page.
    if (s.fullFlow) {
      await page.getByRole("button", { name: s.attribute }).click();
      await page.getByRole("button", { name: "Fair pricing" }).click();
      await page.getByRole("button", { name: "Write my review" }).click();

      await expect(page.getByRole("heading", { name: /starting point/ })).toBeVisible();
      const texts = await collectDraftTexts(page);
      expect(new Set(texts).size).toBe(3);
      for (const text of texts) expect(text).toContain(s.business);
      const combined = texts.join(" ").toLowerCase();
      expect(combined).toContain(s.attribute.toLowerCase());

      await page.getByRole("button", { name: "Copy & open Google" }).click();
      await page.waitForURL(/\/thanks/);
      await expect(page.getByText(/You just made/)).toBeVisible();
    }
  });
}
