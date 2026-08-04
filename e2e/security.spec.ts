import { test, expect } from "@playwright/test";
import { enterDemo } from "./helpers";

test.describe("security boundaries", () => {
  test("unsigned legacy role cookies are rejected", async ({ context, page }) => {
    await context.addCookies([
      {
        name: "foundly_session",
        value: "platform_admin",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/admin");
    await page.waitForURL(/\/sign-in/);
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("paid owner AI and deep health routes reject anonymous callers", async ({ request }) => {
    const reply = await request.post("/api/ai/reply-draft", {
      data: { reviewText: "Great", rating: 5, business: "Example" },
    });
    expect(reply.status()).toBe(401);

    const deepHealth = await request.get("/api/health?deep=1");
    expect(deepHealth.status()).toBe(403);
  });

  // The review APIs are token-only, so the CSRF origin guard runs FIRST: a
  // POST without a same-origin Origin is refused before the token is even read.
  // Both facts matter, so both are asserted.
  const sameOrigin = { origin: "http://localhost:3200" };

  test("customer review editing requires a valid review token", async ({ request }) => {
    const crossOrigin = await request.post("/api/ai/review-edit", {
      data: { token: "not-a-real-token", text: "The staff were helpful." },
    });
    expect(crossOrigin.status()).toBe(403);

    const response = await request.post("/api/ai/review-edit", {
      headers: sameOrigin,
      data: { token: "not-a-real-token", text: "The staff were helpful." },
    });
    expect(response.status()).toBe(404);
  });

  test("customer review drafting requires a valid review token", async ({ request }) => {
    const crossOrigin = await request.post("/api/ai/review-draft", {
      data: { token: "not-a-real-token", rating: 5, attributes: ["Helpful"] },
    });
    expect(crossOrigin.status()).toBe(403);

    const response = await request.post("/api/ai/review-draft", {
      headers: sameOrigin,
      data: { token: "not-a-real-token", rating: 5, attributes: ["Helpful"] },
    });
    expect(response.status()).toBe(404);
  });

  test("monitoring and generated image delivery fail closed without valid signatures", async ({ request }) => {
    const monitor = await request.get("/api/cron/monitor");
    expect(monitor.status()).toBe(401);

    const asset = await request.get("/api/public/content-assets/asset_1234567890abcdef12345678");
    expect(asset.status()).toBe(404);
  });

  test("authenticated consoles receive browser security policy headers", async ({ page }) => {
    await enterDemo(page, "Owner");
    const response = await page.goto("/app");
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  });
});
