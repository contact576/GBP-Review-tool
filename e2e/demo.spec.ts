import { test, expect } from "@playwright/test";
import { enterDemo } from "./helpers";

/**
 * Demo entry + isolation: the demo is explicit, clearly labeled, populated
 * with the seeded Harbourview workspace, and exits cleanly back to sign-in.
 */

test.describe("demo mode", () => {
  test("owner demo: banner, seeded dashboard, seeded reviews, exit clears session", async ({
    page,
  }) => {
    await enterDemo(page, "Owner");

    // Non-dismissible demo banner on every authed surface.
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    await expect(page.getByTestId("demo-banner")).toContainText("Demo mode");

    // Dashboard hero: Harbourview score dial with seeded (non-zero) data.
    const hero = page.locator(".on-hero");
    await expect(hero).toBeVisible();
    await expect(hero).toContainText("Local Growth Score");
    await expect(hero).toContainText("Harbourview Physiotherapy");
    await expect(hero).toContainText("/ 100");

    // Seeded reviews render in the inbox.
    await page.goto("/app/reviews");
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    await expect(
      page.getByText("got me back on the ice").first(),
    ).toBeVisible();

    // Exit demo via the banner -> back to sign-in, session cleared.
    await page.getByRole("button", { name: "Exit demo" }).click();
    await page.waitForURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    // Authed surfaces are gated again.
    await page.goto("/app");
    await page.waitForURL(/\/sign-in/);
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("demo owner is blocked from the platform admin console", async ({ page }) => {
    await enterDemo(page, "Owner");
    await page.goto("/admin");
    // Middleware role gate: owner -> bounced to /app, never sees /admin.
    await page.waitForURL(/\/app$/);
    expect(new URL(page.url()).pathname).toBe("/app");
    await expect(page.locator(".on-hero")).toContainText("Local Growth Score");
  });
});
