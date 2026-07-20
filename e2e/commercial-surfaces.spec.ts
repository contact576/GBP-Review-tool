import { expect, test } from "@playwright/test";
import { enterDemo } from "./helpers";

test.describe("commercial surfaces", () => {
  test("premium dashboard renders the executive score and Google performance cards", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await enterDemo(page, "Owner");

    await expect(page.getByRole("heading", { name: "Your local growth this month" })).toBeVisible();
    await expect(page.getByText("Local Growth Score", { exact: true })).toBeVisible();
    await expect(page.getByText("Profile views", { exact: true })).toBeVisible();
    await expect(page.getByText("Customer actions", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("agency admin can simulate a selected branded-report delivery", async ({ page }) => {
    await enterDemo(page, "Agency", "/agency");
    await page.goto("/agency/reports");

    await expect(page.getByRole("heading", { name: "Client reports" })).toBeVisible();
    const send = page.getByRole("button", { name: /^Send \d+$/ });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText(/Demo delivery simulated for \d+ client/)).toBeVisible();
  });

  test("rank grid discloses its Google Places source and scan economics", async ({ page }) => {
    await enterDemo(page, "Owner");
    await page.goto("/app/rank-grid");

    await expect(page.getByRole("heading", { level: 1, name: "Rank Grid Pro" })).toBeVisible();
    await expect(page.getByText(/Source: Google Places Text Search/)).toBeVisible();
    await expect(page.getByText(/Scan cost: 25 checks/)).toBeVisible();
    await expect(page.getByText(/relevance-ranked Google Places visibility/).first()).toBeVisible();
  });
});
