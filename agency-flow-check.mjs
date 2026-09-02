/**
 * Agency acting-as flow — signs in as an agency admin, opens a client
 * workspace from the client book, checks the owner console renders with the
 * "Managing … as …" banner, visits a few owner pages, and returns to the agency.
 *
 *   node agency-flow-check.mjs https://foundly-phi.vercel.app contact@ppcguru.ca 'password'
 */
import { chromium } from "@playwright/test";

const base = (process.argv[2] || "https://foundly-phi.vercel.app").replace(/\/$/, "");
const email = process.argv[3];
const password = process.argv[4];
if (!email || !password) { console.error("usage: node agency-flow-check.mjs <base> <email> <password>"); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
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

await step("agency dashboard lists clients", async () => {
  await page.goto(`${base}/agency`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const text = await page.textContent("body");
  if (!/Townhill/i.test(text)) throw new Error("Townhill not on dashboard");
});

let clientHref = null;
await step("client book has a Townhill row", async () => {
  await page.goto(`${base}/agency/clients`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const link = page.locator('a[href^="/agency/clients/"]', { hasText: /Townhill/i }).first();
  await link.waitFor({ timeout: 60_000 });
  clientHref = await link.getAttribute("href");
  if (!clientHref) throw new Error("no client link");
});

await step("open client workspace lands on /app with the acting banner", async () => {
  if (!clientHref) throw new Error("no client href from the previous step");
  await page.goto(`${base}${clientHref}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('button:has-text("Open client workspace")').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/app", { timeout: 120_000 }),
    page.click('button:has-text("Open client workspace")'),
  ]);
  await page.locator('[data-testid="agency-acting-banner"]').waitFor({ timeout: 60_000 });
  const banner = await page.locator('[data-testid="agency-acting-banner"]').textContent();
  if (!/Townhill/i.test(banner) || !/PPC Guru/i.test(banner)) throw new Error(`banner: ${banner}`);
});

for (const route of ["/app/reviews", "/app/visibility", "/app/rank-grid", "/app/settings/business"]) {
  await step(`owner page ${route} renders as the client`, async () => {
    const res = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
    if (new URL(page.url()).pathname !== route) throw new Error(`redirected to ${new URL(page.url()).pathname}`);
    await page.locator("main, h1").first().waitFor({ timeout: 60_000 });
    const body = await page.textContent("body");
    if (/This page hit a problem/i.test(body)) throw new Error("error boundary");
    if (!(await page.locator('[data-testid="agency-acting-banner"]').count())) throw new Error("banner missing");
  });
}

await step("the agency console stays reachable while acting, and reads the agency (not the client)", async () => {
  await page.goto(`${base}/agency/clients`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL((u) => u.pathname === "/agency/clients", { timeout: 60_000 });
  await page.locator("h1").first().waitFor({ timeout: 60_000 });
  const body = await page.textContent("body");
  if (!/Client book/i.test(body)) throw new Error("agency console did not render");
  if (!/Townhill/i.test(body)) throw new Error("client book lost its clients — it rendered the client's own agency blob");
});

await step("viewing the agency console did not end the acting session", async () => {
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('[data-testid="agency-acting-banner"]').waitFor({ timeout: 60_000 });
});

await step("Back to agency ends the acting session", async () => {
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/agency", { timeout: 120_000 }),
    page.click('[data-testid="agency-acting-banner"] button'),
  ]);
});

await step("back in the agency, /app is refused again", async () => {
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL((u) => u.pathname === "/agency", { timeout: 60_000 });
});

await browser.close();
const realConsole = consoleErrors.filter((t) => !/hydrat|#418|#423/i.test(t));
console.log(`\nproblems: ${problems.length}${problems.length ? "\n  " + problems.join("\n  ") : ""}`);
if (realConsole.length) console.log(`console errors: ${realConsole.length}\n  ${[...new Set(realConsole)].slice(0, 5).join("\n  ")}`);
process.exit(problems.length ? 1 : 0);
