import { test, expect } from "@playwright/test";
import { registerAccount, uniqueEmail, PASSWORD, dismissTour } from "./helpers";

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

  // First dashboard visit: the product tour introduces the console, then gets
  // out of the way. It must not come back on later visits in this browser.
  await dismissTour(page, true);

  // …and the Getting-started card names the real setup state (nothing is
  // assumed done because the wizard was skipped).
  const gettingStarted = page.locator('section[aria-labelledby="getting-started-title"]');
  await expect(gettingStarted).toBeVisible();
  await expect(gettingStarted.getByText(/\d+\/8 set up/)).toBeVisible();

  // The dashboard belongs to the registered business…
  // <Greeting> picks the salutation from the *browser's* clock, so pinning one
  // greeting made this pass only before noon local. Assert the name and that a
  // real time-of-day greeting resolved — which is what the heading promises.
  await expect(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Taylor$/ }),
  ).toBeVisible();
  await expect(page.getByText(business, { exact: true }).first()).toBeVisible();
  const growthCard = page.locator('section[aria-labelledby="growth-title"]');
  // …with a truthful unavailable score and nothing waiting for a reply…
  await expect(growthCard.getByText("Not available", { exact: true })).toBeVisible();
  await expect(growthCard.getByRole("img", { name: /0 of 100/ })).toHaveCount(0);
  await expect(page.getByText("You are clear for the week", { exact: true })).toBeVisible();
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
  await expect(page.getByText(business, { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  // Seen once, not nagging: the tour stays closed on the second visit.
  await expect(page.getByRole("dialog", { name: /Your dashboard/ })).toHaveCount(0);
});
