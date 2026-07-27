/**
 * Core product loop — end-to-end on a live deployment, with real persistence.
 *
 *   ASK -> customer receives link -> rates -> Google path (4-5★)
 *                                          -> private feedback (1-3★)
 *
 * Email delivery is deliberately not required: sendRequestAction always creates
 * the request and its token, and delivery is best-effort. The token is read back
 * from Postgres and opened in a clean browser context, exactly as a customer
 * would receive it.
 *
 *   node loop-check.mjs <base-url> <owner-email> <owner-password>
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const base = (process.argv[2] || "https://foundly-phi.vercel.app").replace(/\/$/, "");
const email = process.argv[3] || "demo@foundly.local";
const password = process.argv[4] || "FoundlyDemo2026x";

const dbUrl = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

let failures = 0;
const ok = (m, d = "") => console.log(`  PASS  ${m}${d ? ` — ${d}` : ""}`);
const bad = (m, d) => { failures++; console.error(`  FAIL  ${m} — ${d}`); };

const browser = await chromium.launch();
const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await owner.newPage();

const tag = randomBytes(3).toString("hex");
const customers = [
  { name: `Happy Customer ${tag}`, email: `happy+${tag}@foundly.invalid`, rating: 5 },
  { name: `Unhappy Customer ${tag}`, email: `unhappy+${tag}@foundly.invalid`, rating: 2 },
];

let workspaceId = null;

try {
  console.log(`\n[loop] ${base}\n`);

  // ── Sign in as the owner ────────────────────────────────
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
    throw new Error("cannot continue without a session");
  }
  ok("owner signed in");

  const wsRow = await sql`SELECT workspace_id FROM app_user WHERE lower(email) = ${email.toLowerCase()}`;
  workspaceId = wsRow[0]?.workspace_id ?? null;
  if (!workspaceId) { bad("workspace lookup", "owner has no workspace"); throw new Error("no workspace"); }

  for (const c of customers) {
    console.log(`\n── ${c.rating}★ path: ${c.name}`);

    // ── Add the customer through the UI ──────────────────
    await page.goto(`${base}/app/customers`, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(3000);
    const addBtn = page.getByRole("button", { name: /add customer|new customer|add a customer/i }).first();
    if (!(await addBtn.count())) { bad("add customer", "no add-customer control on /app/customers"); break; }
    await addBtn.click();
    await page.waitForTimeout(1500);
    await page.fill('input[name="name"]', c.name).catch(() => {});
    await page.fill('input[name="email"]', c.email).catch(() => {});
    // Consent is required before a request may be sent.
    for (const box of await page.locator('[role="checkbox"]').all()) {
      const near = await box.evaluate((el) => (el.parentElement?.textContent || "").trim());
      if (/consent|permission|agree/i.test(near) && (await box.getAttribute("aria-checked")) === "false") {
        await box.click();
      }
    }
    const saveBtn = page.getByRole("button", { name: /save|add|create/i }).last();
    await saveBtn.click();
    await page.waitForTimeout(4000);

    const cRow = await sql`
      SELECT id FROM customer
      WHERE workspace_id = ${workspaceId} AND lower(email) = ${c.email.toLowerCase()}`;
    if (cRow.length === 0) { bad("customer persisted", `${c.email} not in Postgres`); continue; }
    ok("customer created", c.name);

    // ── Send the request, then read its token from Postgres ─
    await page.goto(`${base}/app/requests`, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(2500);
    const sendBtn = page.getByRole("button", { name: /send request|new request|ask for a review|request review/i }).first();
    if (await sendBtn.count()) {
      await sendBtn.click();
      await page.waitForTimeout(2000);
      // Pick this customer if a chooser appeared, then confirm.
      const chooser = page.getByText(c.name).first();
      if (await chooser.count()) await chooser.click().catch(() => {});
      const confirm = page.getByRole("button", { name: /send|confirm/i }).last();
      await confirm.click().catch(() => {});
      await page.waitForTimeout(5000);
    }

    const reqRow = await sql`
      SELECT token, status FROM review_request
      WHERE workspace_id = ${workspaceId} AND customer_id = ${cRow[0].id}
      ORDER BY seq DESC LIMIT 1`;
    if (reqRow.length === 0) {
      bad("review request", `no review_request row for ${c.name} — could not send from the UI`);
      continue;
    }
    const token = reqRow[0].token;
    ok("review request created", `status=${reqRow[0].status}`);

    // ── Open the link as the customer (clean context) ────
    const guest = await browser.newContext({ viewport: { width: 430, height: 900 } });
    const gp = await guest.newPage();
    const res = await gp.goto(`${base}/r/${token}`, { waitUntil: "networkidle", timeout: 90_000 });
    if ((res?.status() ?? 0) >= 400) {
      bad("customer review page", `HTTP ${res?.status()} on /r/${token}`);
      await guest.close();
      continue;
    }
    await gp.waitForTimeout(3000);
    const pageText = await gp.locator("body").innerText();
    pageText.length > 100 ? ok("review page rendered", `${pageText.length} chars`) : bad("review page", "empty");

    // ── Choose the star rating ───────────────────────────
    const starBtn = gp.getByRole("button", { name: new RegExp(`${c.rating}\\s*star|^${c.rating}$`, "i") }).first();
    if (await starBtn.count()) {
      await starBtn.click();
    } else {
      // Fall back to positional star controls.
      const stars = gp.locator('[role="radio"], button[aria-label*="star" i]');
      const n = await stars.count();
      if (n >= c.rating) await stars.nth(c.rating - 1).click();
      else { bad("star control", `found ${n} star controls, need ${c.rating}`); }
    }
    await gp.waitForTimeout(4000);

    const afterRating = await gp.locator("body").innerText();
    if (c.rating >= 4) {
      // High rating must offer the public Google path.
      /google/i.test(afterRating)
        ? ok("high rating offers the Google path")
        : bad("high rating", "no Google path offered");
    } else {
      // Low rating must collect private feedback instead of pushing to Google.
      const box = gp.locator("textarea").first();
      if (await box.count()) {
        await box.fill("Verification: the technician was late and did not call ahead.");
        const submit = gp.getByRole("button", { name: /send|submit|share/i }).last();
        await submit.click().catch(() => {});
        await gp.waitForTimeout(5000);
        const fb = await sql`
          SELECT rating, left(text, 50) AS snippet FROM private_feedback
          WHERE workspace_id = ${workspaceId} ORDER BY seq DESC LIMIT 1`;
        fb.length > 0
          ? ok("private feedback stored", `${fb[0].rating}★ "${fb[0].snippet}…"`)
          : bad("private feedback", "nothing stored in private_feedback");
      } else {
        bad("low rating", "no private-feedback textarea presented");
      }
      // A low rating must never be pushed to a public Google review.
      /leave.*google review|post.*google/i.test(afterRating)
        ? bad("low rating", "pushed the customer to a public Google review")
        : ok("low rating kept private (no Google push)");
    }

    // Rating must be recorded against the request.
    const finalReq = await sql`
      SELECT status, rating FROM review_request
      WHERE workspace_id = ${workspaceId} AND token = ${token}`;
    finalReq[0]?.rating
      ? ok("rating recorded on the request", `${finalReq[0].rating}★ status=${finalReq[0].status}`)
      : bad("rating", `not recorded (status=${finalReq[0]?.status})`);

    await guest.close();
  }
} finally {
  // Remove only the verification customers/requests/feedback.
  if (workspaceId) {
    for (const c of customers) {
      const rows = await sql`
        SELECT id FROM customer WHERE workspace_id = ${workspaceId} AND lower(email) = ${c.email.toLowerCase()}`;
      for (const { id } of rows) {
        await sql`DELETE FROM review_request WHERE workspace_id = ${workspaceId} AND customer_id = ${id}`;
        await sql`DELETE FROM customer_consent WHERE customer_id = ${id}`;
        await sql`DELETE FROM customer WHERE id = ${id}`;
      }
    }
    await sql`DELETE FROM private_feedback WHERE workspace_id = ${workspaceId} AND text LIKE 'Verification:%'`;
    console.log("\n  cleanup — verification customers removed");
  }
  await browser.close();
  await sql.end({ timeout: 5 });
}

console.log(failures === 0 ? "\n[loop] CORE LOOP VERIFIED\n" : `\n[loop] ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
