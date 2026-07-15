import { test, expect } from "@playwright/test";
import { registerAccount, uniqueEmail, PASSWORD } from "./helpers";

/**
 * Real registration: a fresh account gets an EMPTY workspace (no demo data
 * leakage), and credentials round-trip through sign-out / sign-in.
 */

test("register → skip onboarding → truthful empty dashboard → sign out/in round-trip", async ({
  page,
}) => {
  const email = uniqueEmail("register");
  const business = "Bluebird Counseling";

  await registerAccount(page, {
    name: "Taylor Reed",
    email,
    business,
    industryKey: "professional_services",
  });

  // Onboarding step 1 rendered; skip straight to the app.
  await expect(
    page.getByRole("heading", { name: /Find your business on Google/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Do this later" }).click();
  await page.waitForURL("**/app");

  // The dashboard belongs to the registered business…
  await expect(page.getByText("Good to see you, Taylor")).toBeVisible();
  const hero = page.locator(".on-hero");
  await expect(hero).toContainText(business);
  // …with truthful zero states (score 0, nothing to reply to)…
  await expect(hero).toContainText("0 of 100");
  await expect(page.getByText(/All caught up/)).toBeVisible();
  // …and ZERO demo leakage: no Harbourview data, no demo banner.
  await expect(page.getByText(/Harbourview/)).toHaveCount(0);
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);

  // Sign out from the sidebar.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);

  // Wrong password is rejected with a visible error.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Wrong99999");
  await page.getByRole("button", { name: "Sign in" }).click();
  // (getByText, not getByRole("alert") — Next's route announcer is also role=alert)
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/sign-in");

  // Correct credentials sign back in to the same workspace.
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");
  await expect(page.locator(".on-hero")).toContainText(business);
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});
