/**
 * Feature verification against real Google data — rank grid, QR redirect,
 * embeddable widget, and the public /score lookup.
 *
 *   node feature-check.mjs <base-url> <owner-email> <owner-password>
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const base = (process.argv[2] || "https://foundly-phi.vercel.app").replace(/\/$/, "");
const email = process.argv[3] || "demo@foundly.local";
const password = process.argv[4] || "FoundlyDemo2026x";

const dbUrl = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

let failures = 0;
const ok = (m, d = "") => console.log(`  PASS  ${m}${d ? ` — ${d}` : ""}`);
const bad = (m, d) => { failures++; console.error(`  FAIL  ${m} — ${d}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

try {
  console.log(`\n[features] ${base}\n`);

  const wsRow = await sql`SELECT workspace_id FROM app_user WHERE lower(email) = ${email.toLowerCase()}`;
  const ws = wsRow[0]?.workspace_id;
  if (!ws) { bad("workspace", "owner not found"); throw new Error("no workspace"); }

  // ── 1. Public QR redirect (no session) ──────────────────
  console.log("1. QR redirect");
  const qr = await sql`SELECT slug, label FROM qr_asset WHERE workspace_id = ${ws} LIMIT 1`;
  if (qr.length === 0) {
    bad("qr asset", "no qr_asset rows for this tenant");
  } else {
    const guest = await browser.newContext();
    const gp = await guest.newPage();
    const res = await gp.goto(`${base}/q/${qr[0].slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const landed = new URL(gp.url()).pathname;
    (res?.status() ?? 0) < 400 && landed !== `/q/${qr[0].slug}`
      ? ok("QR redirected", `/q/${qr[0].slug} -> ${landed}`)
      : bad("QR redirect", `HTTP ${res?.status()} landed ${landed}`);
    const scans = await sql`SELECT scans, page_opens FROM qr_asset WHERE workspace_id = ${ws} AND slug = ${qr[0].slug}`;
    scans[0]?.scans > 0 ? ok("scan counted", `scans=${scans[0].scans}`) : bad("scan counter", "not incremented");
    await guest.close();
  }

  // ── 2. Public embeddable widget ─────────────────────────
  console.log("\n2. Public widget");
  const wsSlug = await sql`SELECT slug FROM qr_asset WHERE workspace_id = ${ws} LIMIT 1`;
  if (wsSlug.length) {
    const guest = await browser.newContext();
    const gp = await guest.newPage();
    const res = await gp.goto(`${base}/w/${wsSlug[0].slug}`, { waitUntil: "networkidle", timeout: 60_000 });
    const txt = await gp.locator("body").innerText().catch(() => "");
    if ((res?.status() ?? 0) >= 400) {
      bad("widget", `HTTP ${res?.status()}`);
    } else if (/4\.8|Priority Plumbing/.test(txt)) {
      ok("widget shows real Google data", txt.replace(/\s+/g, " ").slice(0, 70));
    } else {
      bad("widget", `rendered but no real data: ${txt.replace(/\s+/g, " ").slice(0, 80)}`);
    }
    // The widget must remain frameable; everything else must not.
    const h = res?.headers() ?? {};
    !h["x-frame-options"]
      ? ok("widget is frameable (no X-Frame-Options)")
      : bad("widget framing", `X-Frame-Options: ${h["x-frame-options"]} would block embedding`);
    await guest.close();
  }

  // ── 3. Public score lookup (real Places) ────────────────
  console.log("\n3. Public /score lookup");
  const guest2 = await browser.newContext();
  const sp = await guest2.newPage();
  await sp.goto(`${base}/score`, { waitUntil: "networkidle", timeout: 90_000 });
  await sp.waitForTimeout(5000);
  const input = sp.locator('input[type="text"], input[type="search"], input:not([type])').first();
  if (await input.count()) {
    await input.fill("Priority Plumbing & Drains Toronto");
    // The lookup only fires on submit. This used to fill the field and wait,
    // which measured nothing at all — the tool sat on its idle screen for nine
    // seconds and the run reported a product failure that did not exist.
    await sp.getByRole("button", { name: /get my free score|re-run score/i }).first().click();
    // Scan animation is ~3.5s, then the reveal upgrades to real Places data.
    await sp.waitForFunction(
      () => /Local Growth Score/i.test(document.body.innerText),
      { timeout: 60_000 },
    ).catch(() => {});
    await sp.waitForTimeout(6000);
    const txt = await sp.locator("body").innerText();
    // Review counts move, so match the rating and the "real listing" footnote
    // rather than a frozen total.
    const realFootnote = /from your public Google listing/i.test(txt);
    /4\.[6-9]/.test(txt) && realFootnote
      ? ok("score lookup returned real Google data")
      : bad("score lookup", `no real data: ${txt.replace(/\s+/g, " ").slice(120, 320)}`);
  } else {
    bad("score lookup", "no search input on /score");
  }
  await guest2.close();

  // ── 4. Rank grid — a real Places scan ───────────────────
  console.log("\n4. Rank grid (real Places scan)");
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(6000);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !/\/sign-in/.test(u.pathname), { timeout: 120_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  if (/\/sign-in/.test(new URL(page.url()).pathname)) {
    bad("owner sign-in", "could not authenticate");
  } else {
    await page.goto(`${base}/app/rank-grid`, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(4000);
    const body = await page.locator("body").innerText();
    if (/available on Pro|upgrade/i.test(body)) {
      bad("rank grid", "paywalled despite pro tier");
    } else {
      const kw = page.locator('input[type="text"], input:not([type])').first();
      if (!(await kw.count())) {
        bad("rank grid", "no keyword input found");
      } else {
        await kw.fill("emergency plumber");
        const run = page.getByRole("button", { name: /run|scan|start/i }).first();
        await run.click();
        // A real 3x3/5x5 scan issues several live Places queries.
        await page.waitForFunction(
          () => !/scanning|running/i.test(document.body.innerText),
          { timeout: 180_000 },
        ).catch(() => {});
        await page.waitForTimeout(6000);
        const after = await page.locator("body").innerText();
        const scans = await sql`SELECT rank_scans FROM dataset_meta WHERE workspace_id = ${ws}`;
        const stored = Array.isArray(scans[0]?.rank_scans) ? scans[0].rank_scans.length : 0;
        stored > 0
          ? ok("rank scan stored", `${stored} scan(s) in dataset_meta`)
          : bad("rank scan", `nothing stored — page says: ${after.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
  }
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}

console.log(failures === 0 ? "\n[features] ALL FEATURES VERIFIED\n" : `\n[features] ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
