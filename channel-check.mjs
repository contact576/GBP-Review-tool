/**
 * Smoke-check for the two channel surfaces added in this change:
 * Settings → Channels (email sender setup) and /app/whatsapp (bulk WhatsApp
 * asks). Enters the demo workspace so it never touches real tenant data.
 *
 *   node channel-check.mjs http://127.0.0.1:3210
 */
import { chromium } from "@playwright/test";

const base = (process.argv[2] || "http://127.0.0.1:3210").replace(/\/$/, "");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));

async function check(label, path, assertions) {
  const res = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const status = res?.status() ?? 0;
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(1200);
  const body = await page.textContent("body");
  const errored = /Application error|Something went wrong|Internal Server Error/i.test(body ?? "");
  const missing = assertions.filter((text) => !(body ?? "").includes(text));
  const ok = status < 400 && !errored && missing.length === 0;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} ${status} ${page.url().replace(base, "")}` +
      (missing.length ? `\n        missing copy: ${missing.join(" | ")}` : ""),
  );
  return ok;
}

console.log(`[channel-check] ${base}\n`);

// Enter the demo workspace as owner.
await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 180_000 });
const demoButton = page.getByRole("button", { name: "Demo: Owner" });
await demoButton.waitFor({ state: "visible", timeout: 180_000 });
await page.waitForTimeout(2500); // let React hydrate before the click counts
await demoButton.click();
try {
  await page.waitForURL(/\/app(\/|$)/, { timeout: 180_000 });
} catch (err) {
  console.log("FAIL  demo sign-in — still at", page.url());
  console.log([...new Set(problems)].join("\n") || "(no browser errors captured)");
  await page.screenshot({ path: "check-signin-fail.png", fullPage: true });
  await browser.close();
  process.exit(1);
}
console.log("PASS  demo sign-in\n");

let allOk = true;

allOk = (await check("settings → channels", "/app/settings/channels", [
  "Email",
  "WhatsApp",
  "SMS",
])) && allOk;

// The email panel is interactive: the form must reveal both providers. It starts
// expanded when no sender is connected yet, so only click when it is collapsed —
// clicking unconditionally closes it and every provider assertion below fails.
if (!(await page.getByText("My own mailbox (SMTP)").isVisible().catch(() => false))) {
  await page.getByRole("button", { name: /Connect a sender|Edit sender/ }).first().click();
  await page.waitForTimeout(300);
}
const hasSmtp = await page.getByText("My own mailbox (SMTP)").isVisible();
const hasResend = await page.getByText("Resend API key").first().isVisible();
console.log(`${hasSmtp && hasResend ? "PASS" : "FAIL"}  email provider options`);
allOk = hasSmtp && hasResend && allOk;

await page.getByText("Resend API key").first().click();
const hasKeyField = await page.getByPlaceholder("re_...").isVisible();
console.log(`${hasKeyField ? "PASS" : "FAIL"}  resend key field`);
allOk = hasKeyField && allOk;

await page.screenshot({ path: "check-channels.png", fullPage: true });

allOk = (await check("whatsapp sender", "/app/whatsapp", [
  "Ask on WhatsApp",
  "Who are you asking?",
  "How this works",
])) && allOk;

// Walk step 1 → step 2 and confirm the merge tags actually render.
await page.getByRole("button", { name: "Select all shown" }).click();
await page.getByRole("button", { name: "Write the message" }).click();
await page.waitForTimeout(400);
const composeBody = (await page.textContent("body")) ?? "";
const composeOk =
  composeBody.includes("Write the message") &&
  composeBody.includes("Preview") &&
  composeBody.includes("{{link}}");
console.log(`${composeOk ? "PASS" : "FAIL"}  whatsapp compose step`);
allOk = composeOk && allOk;

// The preview must have substituted the tags, not printed them raw.
const previewText = (await page.locator("aside pre").first().textContent()) ?? "";
const previewOk = previewText.includes("https://foundly.app/r/") && !previewText.includes("{{");
console.log(`${previewOk ? "PASS" : "FAIL"}  whatsapp preview merge`);
allOk = previewOk && allOk;

await page.screenshot({ path: "check-whatsapp.png", fullPage: true });

if (problems.length) {
  console.log(`\n[browser errors]\n${[...new Set(problems)].join("\n")}`);
}
console.log(`\n${allOk && problems.length === 0 ? "ALL CHECKS PASSED" : "CHECKS FAILED"}`);
await browser.close();
process.exit(allOk && problems.length === 0 ? 0 : 1);
