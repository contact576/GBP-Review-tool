/**
 * Ops console flow — signs in as a platform admin, checks the overview is
 * measured (live numbers, not "Not measured"), finds a tenant in the roster,
 * opens it, verifies the owner console renders with the support banner, and
 * returns to /admin.
 *
 *   node admin-flow-check.mjs https://foundly-phi.vercel.app shri@gmail.com 'password' "PPC Guru"
 */
import { chromium } from "@playwright/test";

const base = (process.argv[2] || "https://foundly-phi.vercel.app").replace(/\/$/, "");
const email = process.argv[3];
const password = process.argv[4];
const tenantName = process.argv[5] || "PPC Guru";
if (!email || !password) { console.error("usage: node admin-flow-check.mjs <base> <email> <password> [tenant]"); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });

async function step(name, fn) {
  try { await fn(); console.log("  ok ", name); }
  catch (e) { problems.push(`${name}: ${e.message.split("\n")[0]}`); console.log("  ✗  ", name, "—", e.message.split("\n")[0]); }
}

await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(4000);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await Promise.all([
  page.waitForURL((u) => !/\/sign-in/.test(u.pathname), { timeout: 120_000 }),
  page.click('button[type="submit"]'),
]);
console.log(`[flow] signed in -> ${new URL(page.url()).pathname}`);

await step("overview reports live numbers instead of Not measured", async () => {
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("h1").first().waitFor({ timeout: 60_000 });
  const body = await page.textContent("body");
  if (!/Live/i.test(body)) throw new Error("no live-telemetry badge");
  if (/Monitoring not connected — platform health/i.test(body)) throw new Error("still unmeasured");
});

await step(`tenant roster lists ${tenantName}`, async () => {
  await page.goto(`${base}/admin/tenants`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("table").first().waitFor({ timeout: 60_000 });
  const body = await page.textContent("body");
  if (!body.includes(tenantName)) throw new Error(`${tenantName} not in roster`);
});

await step("billing and delivery pages are measured", async () => {
  for (const r of ["/admin/billing", "/admin/delivery", "/admin/durability"]) {
    await page.goto(`${base}${r}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("h1").first().waitFor({ timeout: 60_000 });
    const body = await page.textContent("body");
    if (/This page hit a problem/i.test(body)) throw new Error(`${r}: error boundary`);
    if (!/Live/i.test(body)) throw new Error(`${r}: not live`);
  }
});

await step("fraud page is measured and names the detectors that ran", async () => {
  await page.goto(`${base}/admin/fraud`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("h1").first().waitFor({ timeout: 60_000 });
  const body = await page.textContent("body");
  if (/Fraud detection not connected/i.test(body)) throw new Error("fraud page still unmeasured");
  if (!/Velocity anomaly · running/i.test(body)) throw new Error("velocity detector not reported as running");
  if (!/Same device · not run/i.test(body)) throw new Error("same-device honesty line missing");
});

await step("audit page reads every tenant's ledger", async () => {
  await page.goto(`${base}/admin/audit`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("h1").first().waitFor({ timeout: 60_000 });
  const body = await page.textContent("body");
  if (!/Scope · all tenants/i.test(body)) throw new Error("audit page is not platform-wide");
});

await step(`tenant detail page opens for ${tenantName}`, async () => {
  await page.goto(`${base}/admin/tenants`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const link = page.locator('a[href^="/admin/tenants/"]', { hasText: tenantName }).first();
  await link.waitFor({ timeout: 60_000 });
  await Promise.all([
    page.waitForURL((u) => /^\/admin\/tenants\/.+/.test(u.pathname), { timeout: 120_000 }),
    link.click(),
  ]);
  await page.locator("h1").first().waitFor({ timeout: 60_000 });
  const body = await page.textContent("body");
  if (/This page hit a problem/i.test(body)) throw new Error("tenant page hit the error boundary");
  for (const needle of ["Subscription", "Users", "Delete tenant", "Extend trial"]) {
    if (!body.includes(needle)) throw new Error(`tenant page missing "${needle}"`);
  }
});

await step("Open tenant enters the tenant's owner console with the support banner", async () => {
  await page.goto(`${base}/admin/tenants`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const row = page.locator("tr", { hasText: tenantName }).first();
  await row.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/app", { timeout: 120_000 }),
    row.locator("button", { hasText: /Open tenant/i }).click(),
  ]);
  const banner = page.locator('[data-testid="agency-acting-banner"]');
  await banner.waitFor({ timeout: 60_000 });
  const text = await banner.textContent();
  if (!/support/i.test(text)) throw new Error(`banner: ${text}`);
});

await step("owner pages render as the tenant", async () => {
  for (const r of ["/app/reviews", "/app/settings/business"]) {
    const res = await page.goto(`${base}${r}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    if (!res || res.status() >= 400) throw new Error(`${r}: HTTP ${res?.status()}`);
    await page.locator("main, h1").first().waitFor({ timeout: 60_000 });
    if (new URL(page.url()).pathname !== r) throw new Error(`${r}: redirected to ${new URL(page.url()).pathname}`);
  }
});

await step("the ops console stays reachable while inside the tenant", async () => {
  await page.goto(`${base}/admin/tenants`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL((u) => u.pathname === "/admin/tenants", { timeout: 60_000 });
  await page.locator("table").first().waitFor({ timeout: 60_000 });
});

await step("Back to admin ends the support session", async () => {
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const banner = page.locator('[data-testid="agency-acting-banner"]');
  await banner.waitFor({ timeout: 60_000 });
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/admin", { timeout: 120_000 }),
    banner.locator("button").click(),
  ]);
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 60_000 });
});

await browser.close();
console.log(`\nproblems: ${problems.length}${problems.length ? "\n  " + problems.join("\n  ") : ""}`);
process.exit(problems.length ? 1 : 0);
