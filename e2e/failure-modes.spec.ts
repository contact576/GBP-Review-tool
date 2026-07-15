import { test, expect } from "@playwright/test";
import { enterDemo, uniqueEmail } from "./helpers";

/**
 * Invalid inputs and dead ends: server-side validation errors surface as
 * visible alerts, consent gates block sends, and bogus QR/token URLs land on
 * calm, purpose-built pages (never a crash).
 */

async function fillSignUp(
  page: import("@playwright/test").Page,
  { email, password }: { email: string; password: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Jamie Ortiz");
  await page.getByLabel("Email").fill(email);
  await page.getByPlaceholder("Create a password").fill(password);
  await page.getByLabel("Business name").fill("Testable Co");
  await page.getByLabel("Industry").selectOption("cafe");
  await page.getByRole("checkbox", { name: /I agree to the Terms/i }).click();
  await page.getByRole("button", { name: "Create account" }).click();
}

test.describe("failure modes", () => {
  test("sign-up rejects an invalid email address", async ({ page }) => {
    // "user@invalid" passes native <input type=email> checks but fails the
    // server-side EMAIL_RE (requires a dotted domain).
    await fillSignUp(page, { email: "user@invalid", password: "Passw0rd123" });
    await expect(
      page.getByText("Please enter a valid email address."),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/sign-up");
  });

  test("sign-up rejects weak passwords (length, then composition)", async ({ page }) => {
    await fillSignUp(page, { email: uniqueEmail("weakpw"), password: "short1A" });
    await expect(
      page.getByText("Password must be at least 8 characters."),
    ).toBeVisible();

    // Long enough but no number -> composition rule.
    await page.getByPlaceholder("Create a password").fill("longpassword");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByText("Use at least one letter and one number."),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/sign-up");
  });

  test("staff capture is blocked without service consent", async ({ page }) => {
    await enterDemo(page, "Owner");
    await page.goto("/staff");

    await page.getByLabel("Who did you just help?").fill("Robin Doe");
    await page.getByLabel("Their email").fill("robin@example.com");

    // Consent box unticked: send is disabled and the guard message shows.
    const send = page.getByRole("button", { name: "Send review invite" });
    await expect(send).toBeDisabled();
    await expect(
      page.getByText("Service consent is required before you can send."),
    ).toBeVisible();

    // Ticking service consent unblocks the send.
    await page
      .getByRole("checkbox", { name: /agreed to receive messages about their visit/i })
      .click();
    await expect(send).toBeEnabled();
  });

  test("bogus QR slug lands on the calm /q-expired page", async ({ page }) => {
    await page.goto("/q/nope-nope");
    await page.waitForURL(/\/q-expired/);
    await expect(
      page.getByRole("heading", { name: /review code isn/ }),
    ).toBeVisible();
    await expect(page.getByText(/paused or replaced this code/)).toBeVisible();
  });

  test("unknown review token returns the 404 page", async ({ page }) => {
    const response = await page.goto("/r/not-a-token");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to home/ })).toBeVisible();
  });
});
