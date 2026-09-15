import { test, expect } from "@playwright/test";
import { enterDemo } from "./helpers";

/**
 * AI Visibility across engines. The demo workspace ships a four-engine
 * snapshot in which one engine is deliberately not connected, so the page has
 * to show agreement, disagreement, and an honest "not asked" side by side.
 */
test.describe("AI Visibility across engines", () => {
  test("headline, per-engine cards, grid and share of voice come from the stored answers", async ({
    page,
  }) => {
    await enterDemo(page, "Owner");
    await page.goto("/app/visibility");

    // Headline counts checked answers across every engine that answered.
    await expect(page.getByText("Named in 12 of 17 AI answers")).toBeVisible();
    await expect(page.getByText("3 of 4 engines were asked", { exact: false })).toBeVisible();

    // Every engine has a card; the unconnected one says so and carries no verdict.
    await expect(page.getByRole("heading", { name: "How each engine answered" })).toBeVisible();
    await expect(page.getByText("GOOGLE_AI_API_KEY is not set").first()).toBeVisible();
    await expect(page.getByText("Not asked").first()).toBeVisible();

    // The grid has one column per engine and a legend that separates the four states.
    const grid = page.getByRole("table", { name: /Which AI engines named the business/ });
    await expect(grid).toBeVisible();
    for (const engine of ["ChatGPT", "Claude", "Google Gemini", "Perplexity"]) {
      await expect(grid.getByRole("columnheader", { name: new RegExp(engine) })).toBeVisible();
    }
    await expect(page.getByText("Not asked — engine not connected")).toBeVisible();
    await expect(page.getByText("Asked, no usable answer")).toBeVisible();

    // Share of voice ranks the business among the rivals the answers named.
    await expect(page.getByRole("heading", { name: /You rank #1 of/ })).toBeVisible();
    await expect(page.getByText("Riverside Physio & Rehab").first()).toBeVisible();

    // The run control lists every engine and, in the demo, refuses to spend
    // live API calls whatever keys the server happens to hold.
    await expect(page.getByRole("button", { name: "Run check" })).toBeDisabled();
    await expect(page.getByText(/This is the demo workspace, which shows a saved sample/)).toBeVisible();
    for (const engine of ["ChatGPT", "Claude", "Google Gemini", "Perplexity"]) {
      await expect(page.getByTitle(/Model:|is not set|Not connected/).filter({ hasText: engine })).toBeVisible();
    }
  });
});
