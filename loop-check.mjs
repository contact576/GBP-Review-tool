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
    // The add-customer dialog's inputs carry no `name` attribute, so they are
    // addressed by placeholder. These fills used to be wrapped in
    // `.catch(() => {})`, which turned a selector miss into an empty form and
    // then a confusing "customer not in Postgres" failure two steps later —
    // the check reported a product bug that did not exist. Fail loudly here
    // instead: if the dialog changes, the message should say so.
    // Scope to the dialog. Page-level "Add customer" / "Import CSV" controls sit
    // behind it with matching accessible names, and a loose page-wide match
    // picked the trigger instead of the submit — the form never submitted and
    // the failure surfaced as a bogus "not in Postgres" two steps later.
    const dialog = page.locator('[role="dialog"]');
    const form = (await dialog.count()) ? dialog : page;
    const nameField = form.getByPlaceholder(/customer's name|full name/i).first();
    const emailField = form.getByPlaceholder(/name@example\.com|email/i).first();
    if (!(await nameField.count()) || !(await emailField.count())) {
      bad("add-customer dialog", "name/email fields not found — dialog markup changed");
      continue;
    }
    await nameField.fill(c.name);
    await emailField.fill(c.email);
    // Consent is required before a request may be sent.
    for (const box of await form.locator('[role="checkbox"]').all()) {
      const near = await box.evaluate((el) => (el.parentElement?.textContent || "").trim());
      if (/consent|permission|agree/i.test(near) && (await box.getAttribute("aria-checked")) === "false") {
        await box.click();
      }
    }
    const saveBtn = form.getByRole("button", { name: /^add customer$|^save$|^create$/i }).last();
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
      // The chooser is a native <select> ("Only customers you haven't asked yet
      // appear here"), not clickable text — and the confirm button must be
      // scoped to the dialog, since the page behind it carries the same label.
      const sendDialog = page.locator('[role="dialog"]');
      const scope = (await sendDialog.count()) ? sendDialog : page;
      const chooser = scope.locator("select").first();
      if (await chooser.count()) {
        await chooser.selectOption({ label: c.name }).catch(async () => {
          // Fall back to matching on the option text if the label differs.
          await chooser.selectOption({ index: 1 }).catch(() => {});
        });
        await page.waitForTimeout(800);
      }
      const confirm = scope.getByRole("button", { name: /^send request$|^send$|^confirm$/i }).last();
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

    // ── Clear the service step, which comes before the stars ─
    // Any workspace whose industry has services (i.e. nearly all of them) opens
    // on "What did you come to {business} for?". The rating control does not
    // exist until this step is answered, so skipping it here used to surface as
    // "found 0 star controls".
    const serviceOption = gp.getByRole("button", { name: /^skip this$/i }).first();
    if (await serviceOption.count()) {
      // Pick a real service when one is offered — it exercises the grounding
      // path that feeds the draft — otherwise skip.
      const firstService = gp
        .locator('button[aria-pressed], [role="button"]')
        .filter({ hasNotText: /^skip this$/i })
        .first();
      if (await firstService.count()) await firstService.click().catch(() => {});
      else await serviceOption.click();
      await gp.waitForTimeout(2500);
      // If a real service was chosen the flow may still need a confirm/continue.
      const cont = gp.getByRole("button", { name: /^continue$|^next$/i }).first();
      if (await cont.count()) { await cont.click().catch(() => {}); await gp.waitForTimeout(2000); }
      // Still on the service step? Take the explicit skip.
      if (await gp.getByRole("button", { name: /^skip this$/i }).first().count()) {
        await gp.getByRole("button", { name: /^skip this$/i }).first().click().catch(() => {});
        await gp.waitForTimeout(2500);
      }
    }

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

    // Picking a rating reveals the "what stood out?" chips on the SAME step,
    // gated behind Continue. The drafts and the private-feedback option live on
    // the step after, so without this the run never sees either.
    const continueBtn = gp.getByRole("button", { name: /^continue$/i }).first();
    if (await continueBtn.count()) {
      await continueBtn.click().catch(() => {});
      await gp.waitForTimeout(4000);
    }

    const afterRating = await gp.locator("body").innerText();
    if (c.rating >= 4) {
      // High rating must offer the public Google path.
      /google/i.test(afterRating)
        ? ok("high rating offers the Google path")
        : bad("high rating", "no Google path offered");
    } else {
      // Low rating must OFFER private feedback — as an option, not a diversion.
      // The product deliberately puts 1-3★ on the same path as everyone else and
      // keeps the public Google link visible (review gating breaks Google policy
      // and FTC guidance), so the textarea is behind an opt-in control rather
      // than presented automatically. Open it first, then assert.
      const openPrivate = gp
        .getByRole("button", { name: /private|feedback|tell (us|them)|what went wrong/i })
        .first();
      if ((await openPrivate.count()) && !(await gp.locator("textarea").count())) {
        await openPrivate.click().catch(() => {});
        await gp.waitForTimeout(2500);
      }
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
        bad("low rating", "no private-feedback option offered anywhere on the page");
      }
      // A low rating must still be OFFERED the public Google review link.
      //
      // This assertion used to be inverted — it failed the run whenever the
      // Google path appeared at 1-3★, which would have pushed someone to
      // implement exactly the review gating the product forbids. Hiding the
      // public link from unhappy customers breaks Google's policy and FTC
      // guidance, so components/review/PublicGoogleReviewLink.tsx renders it
      // unconditionally and carries data-compliance for this check to find.
      // What must NOT happen is a low rating being auto-posted or nudged; the
      // private-feedback path above proves the honest route is offered too.
      (await gp.locator('[data-compliance="public-google-link"]').count())
        ? ok("low rating still offered the public Google link (no review gating)")
        : bad("review gating", "public Google link hidden from a 1-3★ customer");
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
