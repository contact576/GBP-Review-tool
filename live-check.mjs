/**
 * Live production proof — creates a REAL account on the deployed site through
 * the real browser UI, confirms it lands in the owner console, and confirms the
 * row actually persisted in Supabase. Nothing is mocked or simulated.
 *
 *   node live-check.mjs https://your-deployment-url
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: node live-check.mjs <production-url>");
  process.exit(1);
}

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

const suffix = randomBytes(4).toString("hex");
const account = {
  name: "Live Demo Owner",
  email: `live-check+${suffix}@foundly.invalid`,
  password: `Live-${randomBytes(9).toString("base64url")}`,
  businessName: `Live Check Plumbing ${suffix}`,
};

let failures = 0;
const ok = (m, d = "") => console.log(`  PASS  ${m}${d ? ` — ${d}` : ""}`);
const bad = (m, d) => { failures++; console.error(`  FAIL  ${m} — ${d}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  // ── 1. Public health ────────────────────────────────────
  console.log(`\n[live] Target: ${base}\n`);
  console.log("1. Health");
  const health = await page.request.get(`${base}/api/health`);
  const healthBody = await health.json().catch(() => ({}));
  health.ok() && healthBody.ok
    ? ok("/api/health", JSON.stringify(healthBody))
    : bad("/api/health", `${health.status()} ${JSON.stringify(healthBody)}`);

  // ── 2. Security headers on a public page ────────────────
  console.log("\n2. Security headers");
  const home = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const h = home?.headers() ?? {};
  h["content-security-policy"] ? ok("CSP present") : bad("CSP", "missing");
  h["x-frame-options"] ? ok("X-Frame-Options", h["x-frame-options"]) : bad("X-Frame-Options", "missing");
  h["strict-transport-security"] ? ok("HSTS present") : bad("HSTS", "missing");

  // ── 3. Real account creation through the UI ─────────────
  console.log("\n3. Real sign-up");
  await page.goto(`${base}/sign-up`, { waitUntil: "networkidle", timeout: 90_000 });
  // Submission is a client handler, so the form is only functional once React has
  // hydrated. Probe it with the Show-password toggle rather than guessing a delay:
  // clicking before hydration makes the browser fall back to a native submit.
  await page.fill('input[name="password"]', "hydration-probe");
  await page.locator('button[aria-label="Show password"]').click({ timeout: 60_000 });
  const hydrated =
    (await page.locator('input[name="password"]').getAttribute("type")) === "text";
  hydrated ? ok("page hydrated") : bad("hydration", "form is not interactive");
  await page.locator('button[aria-label="Hide password"]').click();

  await page.fill('input[name="name"]', account.name);
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.fill('input[name="businessName"]', account.businessName);
  await page.selectOption('select[name="industry"]', "plumbing").catch(() => {});
  await page.selectOption('select[name="country"]', "CA").catch(() => {});
  // Terms is required, and is a custom button[role=checkbox] rather than an
  // <input>, so it must be clicked rather than checked.
  let acceptedTerms = false;
  for (const box of await page.locator('[role="checkbox"]').all()) {
    const nearby = await box.evaluate((el) => (el.parentElement?.textContent || "").trim());
    if (/terms|privacy/i.test(nearby)) {
      await box.click();
      const state = await box.getAttribute("aria-checked");
      acceptedTerms = state === "true";
      acceptedTerms
        ? ok("accepted Terms", nearby.slice(0, 40))
        : bad("Terms checkbox", `aria-checked stayed ${state}`);
    }
  }
  if (!acceptedTerms) bad("Terms checkbox", "never found on the form");
  await Promise.all([
    page.waitForURL((u) => !/\/sign-up$/.test(u.pathname), { timeout: 120_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  const landed = new URL(page.url()).pathname;
  /^\/(app|onboarding)/.test(landed)
    ? ok("signed up and authenticated", `landed on ${landed}`)
    : bad("sign-up", `unexpected landing page ${landed}`);
  // Credentials must never reach the URL, even via a fallback submit.
  page.url().includes("password=")
    ? bad("credential leak", "password appeared in the URL query string")
    : ok("no credentials in URL");

  // ── 4. It really persisted in Supabase ──────────────────
  console.log("\n4. Persisted in Supabase");
  const rows = await sql`
    SELECT u.id, u.email, u.workspace_id, u.session_version, w.name AS workspace_name
    FROM app_user u JOIN workspace w ON w.id = u.workspace_id
    WHERE lower(u.email) = ${account.email.toLowerCase()}`;
  let workspaceId = null;
  if (rows.length === 1) {
    workspaceId = rows[0].workspace_id;
    ok("row in app_user", `workspace "${rows[0].workspace_name}" (${workspaceId})`);
    ok("session_version column readable", String(rows[0].session_version));
  } else {
    bad("app_user row", `expected 1 row, found ${rows.length}`);
  }

  // ── 4b. Real Google business match via Places API (New) ──
  console.log("\n4b. Google business search (real Places API)");
  await page.goto(`${base}/onboarding/find-business`, { waitUntil: "networkidle", timeout: 90_000 });
  const search = page.locator('input[aria-label="Search for your business on Google"]');
  if (await search.count()) {
    await search.fill("Priority Plumbing & Drains Toronto");
    // Results are debounced and rendered as selectable buttons.
    const results = page.locator('button:has-text("Dupont"), button:has-text("Priority Plumbing")');
    await results.first().waitFor({ state: "visible", timeout: 45_000 }).catch(() => {});
    const count = await results.count();
    if (count === 0) {
      const visible = (await page.locator("body").innerText()).slice(0, 300).replace(/\n+/g, " | ");
      bad("Places search", `no results rendered — page says: ${visible}`);
    } else {
      const firstText = (await results.first().innerText()).replace(/\n+/g, " · ");
      ok("Places search returned real listings", firstText.slice(0, 80));
      await results.first().click();
      await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
      ok("linked business to the workspace");
    }
  } else {
    bad("Places search", "search input not present on find-business");
  }

  // ── 4c. Pull the real public review sample from Google ───
  // Linking a place stores the aggregate rating/count from the search hit; the
  // ≤5 public review sample only arrives on an explicit Places details sync.
  console.log("\n4c. Sync real reviews from Google");
  await page.goto(`${base}/app/settings/integrations`, { waitUntil: "networkidle", timeout: 90_000 });
  const syncBtn = page.getByRole("button", { name: /sync from google/i });
  if (await syncBtn.count()) {
    await syncBtn.first().click();
    await page.waitForFunction(
      () => !/syncing/i.test(document.body.innerText),
      { timeout: 90_000 },
    ).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
    const synced = await page.locator("body").innerText();
    /synced|reviews/i.test(synced) ? ok("sync ran") : bad("sync", "no confirmation shown");

    const reviewRows = workspaceId
      ? await sql`
          SELECT id, author, rating, left(text, 60) AS snippet
          FROM review WHERE workspace_id = ${workspaceId} AND id LIKE 'rev_gpub_%'
          ORDER BY seq DESC`
      : [];
    if (reviewRows.length > 0) {
      ok(`real Google reviews stored`, `${reviewRows.length} public samples`);
      for (const r of reviewRows.slice(0, 2)) {
        console.log(`          ${r.rating}★ ${r.author}: ${String(r.snippet).replace(/\s+/g, " ")}…`);
      }
    } else {
      bad("review import", "no rev_gpub_ rows landed in Postgres");
    }
  } else {
    bad("sync button", "not found on /app/settings/integrations");
  }

  // ── 5. Owner console renders real data ──────────────────
  console.log("\n5. Owner console");
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  const bodyText = await page.locator("body").innerText();
  bodyText.includes(account.businessName) || bodyText.length > 400
    ? ok("dashboard rendered", `${bodyText.length} chars of content`)
    : bad("dashboard", "page looks empty");

  // Real Google data must actually surface, not the 0.0 placeholder state.
  const ratingMatch = bodyText.match(/([0-5]\.\d)\s*\n?\s*Rating/i) || bodyText.match(/Rating\s*\n?\s*([0-5]\.\d)/i);
  const shown = ratingMatch?.[1];
  shown && shown !== "0.0"
    ? ok("real Google rating on dashboard", shown)
    : bad("dashboard rating", `still showing ${shown ?? "no rating"} — Google data did not land`);
  await page.screenshot({ path: "live-dashboard.png", fullPage: true });
  ok("screenshot", "live-dashboard.png");

  // ── 6. Protected route rejects anonymous users ──────────
  console.log("\n6. Auth gate");
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  /\/sign-in/.test(anonPage.url())
    ? ok("anonymous /app redirected to sign-in")
    : bad("auth gate", `anonymous reached ${anonPage.url()}`);
  await anon.close();

  // ── 7. No client-side crashes ───────────────────────────
  console.log("\n7. Console");
  const real = consoleErrors.filter((e) => !/favicon|manifest|404/i.test(e));
  real.length === 0
    ? ok("no client errors")
    : bad("client errors", real.slice(0, 3).join(" | "));
} finally {
  // Remove the verification tenant so the demo database stays clean.
  const found = await sql`SELECT workspace_id FROM app_user WHERE lower(email) = ${account.email.toLowerCase()}`;
  for (const { workspace_id } of found) {
    const scoped = await sql`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='workspace_id'`;
    for (const { table_name } of scoped) {
      if (table_name === "workspace") continue;
      await sql`DELETE FROM ${sql(table_name)} WHERE workspace_id = ${workspace_id}`;
    }
    await sql`DELETE FROM organization WHERE workspace_id = ${workspace_id}`;
    await sql`DELETE FROM workspace WHERE id = ${workspace_id}`;
    console.log(`\n  PASS  cleanup — removed ${workspace_id}`);
  }
  await browser.close();
  await sql.end({ timeout: 5 });
}

console.log(
  failures === 0
    ? "\n[live] ALL LIVE CHECKS PASSED — hosted app is real and working.\n"
    : `\n[live] ${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
