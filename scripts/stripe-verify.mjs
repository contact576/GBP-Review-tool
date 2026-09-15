#!/usr/bin/env node
/**
 * Foundly — Stripe verify.
 *
 * Read-only. Confirms that every STRIPE_* env var the app reads resolves to a
 * live, correctly-shaped Stripe object, and that the webhook endpoint exists
 * with the right events. Prints a PASS/FAIL table and exits 1 on any FAIL so
 * it can gate a deploy.
 *
 * Usage:
 *   node scripts/stripe-verify.mjs --key sk_test_... --app-url https://foundly-phi.vercel.app
 *   vercel env pull .env.production.local && node scripts/stripe-verify.mjs --env-file .env.production.local
 *
 * Flags:
 *   --key <sk_...>      Stripe key (env STRIPE_SECRET_KEY, or from --env-file).
 *   --app-url <url>     Deployment origin, to look up the webhook endpoint (env APP_URL / NEXT_PUBLIC_APP_URL).
 *   --env-file <path>   Read STRIPE_* / APP_URL values from a KEY=value file instead of process.env.
 *   --json              Emit the checks as JSON instead of a table.
 *
 * What the app reads (lib/actions.ts startCheckoutAction + lib/billing/stripe.ts resolvePlanForPrice):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *   STRIPE_PRICE_{STARTER|GROWTH|MULTI|AGENCY}_{MONTHLY|ANNUAL}
 *   (a bare STRIPE_PRICE_<TIER> is accepted as a legacy monthly fallback — reported as WARN).
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  STRIPE_CATALOG,
  WEBHOOK_EVENTS,
  WEBHOOK_PATH,
  StripeError,
  formatMoney,
  keyMode,
  parseArgs,
  parseEnvFile,
  priceSpecs,
  renderTable,
  resolveAppUrl,
  resolveSecretKey,
  stripeClient,
} from "./stripe-lib.mjs";

function check(name, status, detail) {
  return { name, status, detail };
}

async function verifyPrice(stripe, spec, env) {
  const value = env[spec.envVar];
  const legacy = spec.interval === "monthly" ? env[`STRIPE_PRICE_${spec.tier.toUpperCase()}`] : undefined;
  const priceId = value || legacy;
  if (!priceId) {
    return check(spec.envVar, "FAIL", `not set — checkout for ${spec.tier}/${spec.interval} reports "connect billing"`);
  }
  let price;
  try {
    price = await stripe.get(`/prices/${encodeURIComponent(priceId)}`, { expand: ["product"] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return check(spec.envVar, "FAIL", `${priceId} — ${message}`);
  }
  const problems = [];
  if (!price.active) problems.push("price is archived");
  if (price.type !== "recurring") problems.push("not a recurring price");
  if (price.recurring?.interval !== spec.stripeInterval) {
    problems.push(`interval is ${price.recurring?.interval ?? "none"}, expected ${spec.stripeInterval}`);
  }
  if ((price.recurring?.interval_count ?? 1) !== 1) problems.push(`interval_count is ${price.recurring.interval_count}`);
  if (price.currency !== spec.currency) problems.push(`currency ${price.currency}, expected ${spec.currency}`);
  if (price.unit_amount !== spec.unitAmount) {
    problems.push(`amount ${formatMoney(price.unit_amount ?? 0, price.currency)}, catalog ${formatMoney(spec.unitAmount)}`);
  }
  const product = typeof price.product === "object" ? price.product : null;
  if (product) {
    if (product.active === false) problems.push("product is archived");
    const tierMeta = product.metadata?.foundly_tier;
    if (tierMeta && tierMeta !== spec.tier) problems.push(`product is tagged foundly_tier=${tierMeta}`);
    else if (!tierMeta) problems.push("product has no foundly_tier metadata (not created by the bootstrap)");
  }
  if (price.lookup_key && price.lookup_key !== spec.lookupKey) {
    problems.push(`lookup_key is ${price.lookup_key}, expected ${spec.lookupKey}`);
  }

  const summary = `${price.id}  ${formatMoney(price.unit_amount ?? 0, price.currency)}/${price.recurring?.interval ?? "?"}${product ? `  ${product.name}` : ""}`;
  if (problems.length) return check(spec.envVar, "FAIL", `${summary} — ${problems.join("; ")}`);
  if (!value && legacy) {
    return check(spec.envVar, "WARN", `${summary} — resolved via legacy STRIPE_PRICE_${spec.tier.toUpperCase()}; set ${spec.envVar} explicitly`);
  }
  return check(spec.envVar, "PASS", summary);
}

async function verifyWebhook(stripe, appUrl, env) {
  const checks = [];
  checks.push(
    env.STRIPE_WEBHOOK_SECRET
      ? env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")
        ? check("STRIPE_WEBHOOK_SECRET", "PASS", "set (value cannot be verified against Stripe — only a real event proves it)")
        : check("STRIPE_WEBHOOK_SECRET", "FAIL", "set but does not start with whsec_")
      : check("STRIPE_WEBHOOK_SECRET", "FAIL", "not set — every webhook is rejected with 400, so paid plans never activate"),
  );
  if (!appUrl) {
    checks.push(check("webhook endpoint", "WARN", "no --app-url / APP_URL given, so the endpoint was not looked up"));
    return checks;
  }
  const url = `${appUrl}${WEBHOOK_PATH}`;
  let endpoints;
  try {
    endpoints = await stripe.listAll("/webhook_endpoints");
  } catch (error) {
    checks.push(check("webhook endpoint", "FAIL", error instanceof Error ? error.message : String(error)));
    return checks;
  }
  const endpoint = endpoints.find((item) => item.url === url);
  if (!endpoint) {
    checks.push(check("webhook endpoint", "FAIL", `none registered for ${url} — run scripts/stripe-bootstrap.mjs`));
    return checks;
  }
  const events = endpoint.enabled_events ?? [];
  const missing = events.includes("*") ? [] : WEBHOOK_EVENTS.filter((event) => !events.includes(event));
  const extra = events.includes("*") ? [] : events.filter((event) => !WEBHOOK_EVENTS.includes(event));
  const problems = [];
  if (endpoint.status && endpoint.status !== "enabled") problems.push(`status ${endpoint.status}`);
  if (missing.length) problems.push(`missing events: ${missing.join(", ")}`);
  const summary = `${endpoint.id}  ${url}`;
  if (problems.length) checks.push(check("webhook endpoint", "FAIL", `${summary} — ${problems.join("; ")}`));
  else if (extra.length) checks.push(check("webhook endpoint", "WARN", `${summary} — also subscribed to unhandled: ${extra.join(", ")}`));
  else checks.push(check("webhook endpoint", "PASS", `${summary}  ${events.includes("*") ? "all events" : `${WEBHOOK_EVENTS.length} events`}`));
  return checks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let env = process.env;
  if (typeof args.flags["env-file"] === "string") {
    env = { ...process.env, ...parseEnvFile(readFileSync(args.flags["env-file"], "utf8")) };
  }

  const key = resolveSecretKey(args, env);
  const checks = [];
  if (!key) {
    checks.push(check("STRIPE_SECRET_KEY", "FAIL", "not set — stripeEnabled() is false; billing UI shows connect-billing states"));
    emit(checks, args);
    process.exit(1);
  }
  const mode = keyMode(key);
  const stripe = stripeClient(key);
  let account;
  try {
    account = await stripe.get("/account");
    checks.push(check("STRIPE_SECRET_KEY", "PASS", `${mode.toUpperCase()} key, account ${account.id}`));
  } catch (error) {
    checks.push(check("STRIPE_SECRET_KEY", "FAIL", `Stripe rejected the key: ${error instanceof Error ? error.message : String(error)}`));
    emit(checks, args);
    process.exit(1);
  }

  for (const spec of priceSpecs()) checks.push(await verifyPrice(stripe, spec, env));

  const appUrl = resolveAppUrl(args, env);
  checks.push(...(await verifyWebhook(stripe, appUrl, env)));

  emit(checks, args, { mode, appUrl });
  process.exit(checks.some((item) => item.status === "FAIL") ? 1 : 0);
}

function emit(checks, args, meta = {}) {
  if (args.flags.json) {
    process.stdout.write(`${JSON.stringify({ ...meta, checks }, null, 2)}\n`);
    return;
  }
  const lines = [];
  lines.push("Foundly Stripe verify");
  if (meta.mode) lines.push(`  mode     ${meta.mode.toUpperCase()}`);
  if (meta.appUrl) lines.push(`  app url  ${meta.appUrl}`);
  lines.push("");
  lines.push(renderTable(["Check", "Result", "Detail"], checks.map((item) => [item.name, item.status, item.detail])));
  lines.push("");
  const fails = checks.filter((item) => item.status === "FAIL").length;
  const warns = checks.filter((item) => item.status === "WARN").length;
  lines.push(
    fails
      ? `${fails} FAIL, ${warns} WARN — billing is not fully live. Fix the FAIL rows, redeploy, rerun.`
      : warns
        ? `0 FAIL, ${warns} WARN — billing works; tidy the WARN rows when convenient.`
        : `All ${checks.length} checks passed — checkout, portal and entitlement webhooks can go live.`,
  );
  lines.push("");
  lines.push(`Catalog (from scripts/stripe-lib.mjs, mirrored from lib/billing/plans.ts): ${Object.entries(STRIPE_CATALOG)
    .map(([tier, entry]) => `${tier} $${entry.monthly}/mo or $${entry.annualMonthly * 12}/yr`)
    .join(" · ")}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const message = error instanceof StripeError ? error.message : error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`\nERROR: ${message}\n`);
    process.exit(1);
  });
}
