/**
 * Route crawl — visits every static route on a deployment as a signed-in owner
 * and reports anything that 500s, renders an error boundary, or throws in the
 * browser. Role-gated redirects are recorded, not treated as failures.
 *
 *   node crawl-check.mjs https://foundly-phi.vercel.app demo@foundly.local 'password'
 */
import { chromium } from "@playwright/test";

const base = (process.argv[2] || "https://foundly-phi.vercel.app").replace(/\/$/, "");
const email = process.argv[3] || "demo@foundly.local";
const password = process.argv[4] || "FoundlyDemo2026x";

const PUBLIC_ROUTES = [
  "/", "/pricing", "/agencies", "/score", "/setup", "/sign-in", "/sign-up",
  "/forgot-password", "/resources", "/q-expired", "/trial/start",
  "/legal/terms", "/legal/privacy",
  "/resources/aeo-guide", "/for/plumbing",
];

/**
 * Routes whose 404 is the correct answer, not a fault. /setup is the
 * platform-admin setup checklist: it deliberately calls notFound() for everyone
 * else so it leaks no existence signal (security finding V2), and the crawl
 * signs in as an owner.
 */
const EXPECTED_404 = new Set(["/setup"]);

const OWNER_ROUTES = [
  "/app", "/app/this-week", "/app/reviews", "/app/requests", "/app/customers",
  "/app/campaigns", "/app/campaigns/new", "/app/analytics", "/app/benchmark",
  "/app/visibility", "/app/rank-grid", "/app/profile", "/app/studio", "/app/report",
  "/app/milestones", "/app/notifications", "/app/trial-ending",
  "/app/settings", "/app/settings/billing", "/app/settings/business",
  "/app/settings/channels", "/app/settings/consent", "/app/settings/integrations",
  "/app/settings/locations", "/app/settings/team",
];

const ONBOARDING_ROUTES = [
  "/onboarding/business-type", "/onboarding/find-business", "/onboarding/connect",
  "/onboarding/channels", "/onboarding/team", "/onboarding/qr-kit",
  "/onboarding/finish",
];

const STAFF_ROUTES = ["/staff", "/staff/leaderboard", "/staff/qr"];
const AGENCY_ROUTES = ["/agency", "/agency/clients", "/agency/economics", "/agency/reports", "/agency/white-label"];
const ADMIN_ROUTES = ["/admin", "/admin/audit", "/admin/billing", "/admin/delivery", "/admin/durability", "/admin/flags", "/admin/fraud", "/admin/tenants"];

const ERROR_MARKERS = [
  "Application error", "a client-side exception",
  "Internal Server Error", "This page could not be found",
  "Unhandled Runtime Error", "500",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const problems = [];
const redirects = [];
const consoleErrors = new Map();
let current = "";
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/favicon|manifest|net::ERR_ABORTED|404/i.test(t)) return;
  if (!consoleErrors.has(current)) consoleErrors.set(current, []);
  consoleErrors.get(current).push(t.slice(0, 160));
});
page.on("pageerror", (e) => {
  if (!consoleErrors.has(current)) consoleErrors.set(current, []);
  consoleErrors.get(current).push(String(e).slice(0, 160));
});

async function visit(route, { expectAuth = false } = {}) {
  current = route;
  let status = 0;
  try {
    const res = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = res?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  } catch (err) {
    problems.push(`${route} — navigation failed: ${String(err).slice(0, 90)}`);
    return;
  }
  const landed = new URL(page.url()).pathname;
  const text = await page.locator("body").innerText().catch(() => "");

  if (status >= 500) {
    problems.push(`${route} — HTTP ${status}`);
    return;
  }
  if (status === 404) {
    if (EXPECTED_404.has(route)) {
      console.log(`  ok  ${route} (404 — correctly gated)`);
      return;
    }
    problems.push(`${route} — HTTP 404`);
    return;
  }
  const marker = ERROR_MARKERS.find((m) => text.includes(m) && m !== "500");
  if (marker) {
    problems.push(`${route} — error page: "${marker}"`);
    return;
  }
  if (text.trim().length < 60) {
    problems.push(`${route} — rendered almost nothing (${text.trim().length} chars)`);
    return;
  }
  if (landed !== route) {
    redirects.push(`${route} -> ${landed}`);
    if (expectAuth && /\/sign-in/.test(landed)) {
      problems.push(`${route} — signed-in user bounced to sign-in (session lost?)`);
    }
    return;
  }
  console.log(`  ok  ${route}`);
}

// ── Sign in ───────────────────────────────────────────────
console.log(`\n[crawl] ${base} as ${email}`);
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(6000); // let the client form hydrate
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await Promise.all([
  page.waitForURL((u) => !/\/sign-in/.test(u.pathname), { timeout: 120_000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
const signedInAt = new URL(page.url()).pathname;
if (/\/sign-in/.test(signedInAt)) {
  console.error("\n[crawl] FATAL: could not sign in — aborting");
  await browser.close();
  process.exit(1);
}
console.log(`[crawl] signed in -> ${signedInAt}\n`);

for (const [label, routes, opts] of [
  ["owner", OWNER_ROUTES, { expectAuth: true }],
  ["onboarding", ONBOARDING_ROUTES, { expectAuth: true }],
  ["staff", STAFF_ROUTES, { expectAuth: true }],
  ["agency", AGENCY_ROUTES, { expectAuth: true }],
  ["admin", ADMIN_ROUTES, { expectAuth: true }],
  ["public", PUBLIC_ROUTES, {}],
]) {
  console.log(`── ${label} ──`);
  for (const r of routes) await visit(r, opts);
}

console.log("\n──────── RESULTS ────────");
console.log(`routes visited : ${[...OWNER_ROUTES, ...ONBOARDING_ROUTES, ...STAFF_ROUTES, ...AGENCY_ROUTES, ...ADMIN_ROUTES, ...PUBLIC_ROUTES].length}`);

if (redirects.length) {
  console.log(`\nredirects (${redirects.length}) — expected for role/plan gates:`);
  for (const r of redirects) console.log("  ", r);
}
if (consoleErrors.size) {
  console.log(`\nconsole errors on ${consoleErrors.size} route(s):`);
  for (const [route, errs] of consoleErrors) {
    console.log(`   ${route}`);
    for (const e of [...new Set(errs)].slice(0, 2)) console.log(`      ${e}`);
  }
}
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log("  ✗", p);
} else {
  console.log("\nNo broken routes.");
}

await browser.close();
process.exit(problems.length ? 1 : 0);
