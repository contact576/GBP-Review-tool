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

/** Scan a QR slug and land on the tokenized customer review page. */
export async function scanQr(page: Page, slug: string): Promise<void> {
  await page.goto(`/q/${slug}`);
  await page.waitForURL(/\/r\/[A-Za-z0-9_]+/);
}

/** One AI draft card, located by its tone badge. */
export function draftCard(page: Page, tone: string) {
  return page.locator("div.rounded-card").filter({ hasText: tone });
}

export const DRAFT_TONES = [
  "Short & natural",
  "Detailed & specific",
  "Warm & conversational",
] as const;

/** Collect the three visible draft texts (asserts all three cards render). */
export async function collectDraftTexts(page: Page): Promise<string[]> {
  const texts: string[] = [];
  for (const tone of DRAFT_TONES) {
    const card = draftCard(page, tone);
    await expect(card).toBeVisible();
    texts.push((await card.locator("p").innerText()).trim());
  }
  return texts;
}
