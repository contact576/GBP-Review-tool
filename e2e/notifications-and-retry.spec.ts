import { test, expect } from "@playwright/test";
import { enterDemo } from "./helpers";

/**
 * Two surfaces that used to be dead ends:
 *
 * - A notification described something and led nowhere.
 * - A request that failed to deliver removed that customer from the eligible
 *   list forever, with no way to try the other channel.
 */

/**
 * The demo workspace is shared and mutable, so each test starts from the seed.
 * Without this, a rerun (or a retry) would inherit the previous run's read
 * notifications and assert against a state that no longer exists.
 */
async function enterFreshDemo(page: Parameters<typeof enterDemo>[0]): Promise<void> {
  await enterDemo(page, "Owner");
  // Wait for the reset action's own response rather than for the banner to
  // settle: the seed is in place the moment the server answers, and that is
  // what the assertions below depend on.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.ok(), { timeout: 30_000 }),
    page.getByRole("button", { name: "Reset demo data" }).click(),
  ]);
}

test.describe("notifications lead somewhere", () => {
  test("each notification links to the screen holding the record, and opening one leaves the rest unread", async ({
    page,
  }) => {
    await enterFreshDemo(page);
    await page.goto("/app/notifications");

    // The seeded workspace has two unread notifications.
    await expect(page.getByText("2 unread")).toBeVisible();

    // A review notification carries a destination affordance, not just text.
    const reviewRow = page.getByRole("link", { name: /New 5.*review detected/ });
    await expect(reviewRow).toBeVisible();
    await expect(reviewRow).toContainText("Open reviews");

    // Private feedback points at the screen that actually holds it.
    const feedbackRow = page.getByRole("link", { name: /Private feedback needs attention/ });
    await expect(feedbackRow).toContainText("Open private feedback");

    // A milestone points at Milestones.
    await expect(page.getByRole("link", { name: /Milestone: 25 reviews/ })).toContainText(
      "Open milestones",
    );

    // Following one lands on the right screen.
    await reviewRow.click();
    await page.waitForURL("**/app/reviews");
    await expect(page.getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();

    // The one followed is now read; the other unread one still is not, because
    // opening a single item must not clear the list.
    await page.goto("/app/notifications");
    await expect(page.getByText("1 unread")).toBeVisible();
  });

  test("mark all read clears the badge", async ({ page }) => {
    await enterFreshDemo(page);
    await page.goto("/app/notifications");
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByText("All caught up")).toBeVisible();
  });
});

test.describe("a request that never arrived can be sent again", () => {
  test("the failed request has its own tab and a send-again path on the other channel", async ({
    page,
  }) => {
    await enterFreshDemo(page);
    await page.goto("/app/requests");

    // Delivery failures are no longer filed under "Suppressed".
    const failedTab = page.getByRole("tab", { name: /Didn't arrive/ });
    await expect(failedTab).toBeVisible();
    await failedTab.click();

    // The row offers a retry.
    const sendAgain = page.getByRole("button", { name: "Send again" }).first();
    await expect(sendAgain).toBeVisible();
    await sendAgain.click();

    // The composer opens aimed at that customer, explaining what happened.
    await expect(page.getByRole("heading", { name: "Send a review request" })).toBeVisible();
    await expect(page.getByText(/Their last request went out by/)).toBeVisible();

    // The note above only renders for a preselected retry customer — the old
    // composer excluded such customers entirely, so this is the whole fix.
  });
});
