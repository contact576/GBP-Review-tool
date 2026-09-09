import { expect, type Page } from "@playwright/test";

/** Unique-per-run email so every spec registers its own isolated account. */
export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const PASSWORD = "Passw0rd123";

export interface RegisterInput {
  name: string;
  email: string;
  password?: string;
  business: string;
  /** Value of the sign-up Industry <select>. */
  industryKey: string;
}

/** Full sign-up flow: lands on /onboarding/find-business. */
export async function registerAccount(page: Page, input: RegisterInput): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(input.name);
  await page.getByLabel("Email").fill(input.email);
  await page.getByPlaceholder("Create a password").fill(input.password ?? PASSWORD);
  await page.getByLabel("Business name").fill(input.business);
  await page.getByLabel("Industry").selectOption(input.industryKey);
  await page.getByRole("checkbox", { name: /I agree to the Terms/i }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/find-business");
}

/** Email + password sign-in from /sign-in (does not wait for a destination). */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Enter the clearly-labeled demo as a given role. */
export async function enterDemo(
  page: Page,
  role: "Owner" | "Agency" | "Admin" = "Owner",
  dest = "/app",
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: `Demo: ${role}` }).click();
  await page.waitForURL(`**${dest}`);
}

/** Staff PWA capture: name + email + service consent -> send -> success. */
export async function captureCustomer(
  page: Page,
  customerName: string,
  email: string,
): Promise<void> {
  await page.goto("/staff");
  await page.getByLabel("Who did you just help?").fill(customerName);
  await page.getByLabel("Their email").fill(email);
  await page
    .getByRole("checkbox", { name: /agreed to receive messages about their visit/i })
    .click();
  const send = page.getByRole("button", { name: "Send review invite" });
  await expect(send).toBeEnabled();
  await send.click();
  // Keyed environments show provider acceptance; keyless test environments
  // truthfully save the capture and expose delivery as unavailable.
  await expect(
    page.getByText(new RegExp(`^(Sent to|Saved for) ${customerName}$`)),
  ).toBeVisible();
}

/**
 * The product tour auto-starts on an account's first visit to the dashboard
 * (per browser). Close it when it is up so the page underneath is clickable;
 * pass `expectShown` to assert it really did appear.
 */
export async function dismissTour(page: Page, expectShown = false): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /Your dashboard|Tour/ });
  if (expectShown) await expect(dialog).toBeVisible();
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Close tour" }).click();
    await expect(dialog).toBeHidden();
  }
}

/** Scan a QR slug and land on the tokenized customer review page. */
export async function scanQr(page: Page, slug: string): Promise<void> {
  await page.goto(`/q/${slug}`);
  await page.waitForURL(/\/r\/[A-Za-z0-9_]+/);
}

/**
 * Answer the first screen — optionally pick one or more services, choose a
 * star rating — and continue to the review box. Leaves the page on the
 * writing screen (suggested wording in the box, or a blank box).
 */
export async function rateExperience(
  page: Page,
  stars: 1 | 2 | 3 | 4 | 5,
  services?: string | string[],
): Promise<void> {
  const picks = typeof services === "string" ? [services] : services ?? [];
  for (const service of picks) {
    await page.getByRole("group", { name: "Services" }).getByRole("button", { name: service, exact: true }).click();
  }
  await page.getByRole("radio", { name: `${stars} star${stars === 1 ? "" : "s"}` }).click();
  await page.getByRole("button", { name: "See my review" }).click();
}

export const DRAFT_TONES = [
  "Short & natural",
  "Detailed & specific",
  "Warm & conversational",
] as const;

/** The review box on the writing screen. */
export function reviewBox(page: Page) {
  return page.getByLabel("Your Google review in your own words");
}

/**
 * Read the three suggested wordings by selecting each tone in turn (asserts
 * all three are offered). Leaves the first tone selected.
 */
export async function collectDraftTexts(page: Page): Promise<string[]> {
  const texts: string[] = [];
  for (const tone of DRAFT_TONES) {
    const tab = page.getByRole("radio", { name: tone });
    await expect(tab).toBeVisible();
    await tab.click();
    texts.push((await reviewBox(page).inputValue()).trim());
  }
  await page.getByRole("radio", { name: DRAFT_TONES[0] }).click();
  return texts;
}
