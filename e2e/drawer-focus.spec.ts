import { expect, test, type Locator, type Page } from "@playwright/test";
import { dismissTour, enterDemo } from "./helpers";

/**
 * Regression guard for the add-customer drawer losing the caret.
 *
 * `Drawer` traps focus in an effect. That effect used to list `onClose` in its
 * dependencies — and every caller passes `onClose` as an inline arrow, so its
 * identity changed on every parent render. One keystroke re-rendered the
 * parent, the effect tore down (restoring focus to the opener, *outside* the
 * drawer) and re-ran (focusing the first control in the panel). The field kept
 * exactly one character and you had to click back in for the next one.
 *
 * Typing a whole value into each field is the assertion: if focus escapes, the
 * field holds a single character.
 */
async function typeFully(page: Page, field: Locator, value: string): Promise<void> {
  await field.click();
  await page.keyboard.type(value, { delay: 15 });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(value);
}

test.describe("add-customer drawer", () => {
  test("keeps the caret in the field while name, email and phone are typed", async ({ page }) => {
    await enterDemo(page, "Owner");
    await dismissTour(page);
    await page.goto("/app/customers");

    await page.getByRole("button", { name: /^Add customer$/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "Add customer" });
    await expect(drawer).toBeVisible();

    await typeFully(page, drawer.getByLabel("Customer's name"), "Maya Rodriguez");
    await typeFully(page, drawer.getByPlaceholder("name@example.com"), "maya@riverside.ca");
    await typeFully(page, drawer.getByPlaceholder("(555) 010-2030"), "5550102030");
  });
});
