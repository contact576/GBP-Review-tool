#!/usr/bin/env node
/**
 * Foundly — Stripe bootstrap.
 *
 * Idempotently provisions everything the app's billing code expects to exist
 * in a Stripe account, then prints the env vars to paste into Vercel:
 *
 *   1. One Product per sellable tier   (found by metadata.foundly_tier)
 *   2. Monthly + annual recurring Price (found by lookup_key foundly_<tier>_<interval>)
 *   3. One webhook endpoint at {APP_URL}/api/webhooks/stripe subscribed to
 *      exactly the events lib/billing/reconcile.ts handles (skipped when one
 *      already exists for that URL — Stripe only reveals the signing secret
 *      at creation time, so an existing endpoint keeps its secret).
 *
 * Usage:
 *   npm run stripe:bootstrap -- --key sk_test_... --app-url https://foundly-phi.vercel.app
 *   STRIPE_SECRET_KEY=sk_live_... APP_URL=https://app.example npm run stripe:bootstrap
 *
 * Flags:
 *   --key <sk_...>        Stripe secret (or restricted) key. Env STRIPE_SECRET_KEY also works.
 *   --app-url <url>       Public origin of the deployment. Env APP_URL / NEXT_PUBLIC_APP_URL also work.
 *   --dry-run             Show what would be created; make no writes.
 *   --rotate-mismatched   When an existing price's amount/interval/currency no longer
 *                         matches the catalog, create a replacement, move the lookup_key
 *                         to it (transfer_lookup_key) and archive the old one. Without this
 *                         flag a mismatch is reported and the old price is left as-is.
 *   --skip-webhook        Do not touch webhook endpoints (e.g. when using `stripe listen` locally).
 *
 * Test and live keys are both supported — the mode is printed up front so you
 * always know which account you are writing to. Run once per mode.
 */

import { pathToFileURL } from "node:url";
import {
  CURRENCY,
  STRIPE_CATALOG,
  SELLABLE_TIERS,
  WEBHOOK_EVENTS,
  WEBHOOK_PATH,
  StripeError,
  formatMoney,
  keyMode,
  parseArgs,
  priceSpecs,
  resolveAppUrl,
  resolveSecretKey,
  stripeClient,
} from "./stripe-lib.mjs";

const MANAGED_BY = "foundly-stripe-bootstrap";

function log(line = "") {
  process.stdout.write(`${line}\n`);
}

function fail(message) {
  process.stderr.write(`\nERROR: ${message}\n`);
  process.exit(1);
}

/** The product for a tier, by metadata — never by name, which an operator may rename. */
async function ensureProduct(stripe, tier, options) {
  const products = await stripe.listAll("/products", { active: true });
  const existing = products.find((p) => p.metadata?.foundly_tier === tier);
  const catalog = STRIPE_CATALOG[tier];
  if (existing) {
    log(`  product  ${tier.padEnd(8)} exists   ${existing.id}  (${existing.name})`);
    return { product: existing, created: false };
  }
  if (options.dryRun) {
    log(`  product  ${tier.padEnd(8)} CREATE   "${catalog.name}"  [dry run]`);
    return { product: { id: `prod_DRYRUN_${tier}`, name: catalog.name }, created: true };
  }
  const product = await stripe.post(
    "/products",
    {
      name: catalog.name,
      description: catalog.blurb,
      metadata: { foundly_tier: tier, managed_by: MANAGED_BY },
    },
    `${MANAGED_BY}-product-${tier}`,
  );
  log(`  product  ${tier.padEnd(8)} created  ${product.id}  (${product.name})`);
  return { product, created: true };
}

function priceMatches(price, spec) {
  return (
    price.currency === spec.currency &&
    price.unit_amount === spec.unitAmount &&
    price.recurring?.interval === spec.stripeInterval &&
    (price.recurring?.interval_count ?? 1) === 1 &&
    price.type === "recurring"
  );
}

function describePrice(price) {
  const interval = price.recurring ? `/${price.recurring.interval}` : " one-off";
  return `${formatMoney(price.unit_amount ?? 0, price.currency)}${interval}`;
}

async function createPrice(stripe, productId, spec, options, transfer) {
  if (options.dryRun) {
    log(
      `  price    ${spec.lookupKey.padEnd(24)} CREATE   ${formatMoney(spec.unitAmount)}/${spec.stripeInterval}  [dry run]`,
    );
    return { id: `price_DRYRUN_${spec.tier}_${spec.interval}`, lookup_key: spec.lookupKey };
  }
  const price = await stripe.post("/prices", {
    product: productId,
    currency: spec.currency,
    unit_amount: spec.unitAmount,
    recurring: { interval: spec.stripeInterval, interval_count: 1 },
    lookup_key: spec.lookupKey,
    ...(transfer ? { transfer_lookup_key: true } : {}),
    nickname: `${STRIPE_CATALOG[spec.tier].name} — ${spec.interval}`,
    metadata: { foundly_tier: spec.tier, foundly_interval: spec.interval, managed_by: MANAGED_BY },
  });
  log(`  price    ${spec.lookupKey.padEnd(24)} created  ${price.id}  ${describePrice(price)}`);
  return price;
}

/** Every price for our lookup keys, keyed by lookup_key. Active only — archived prices must not be reused. */
async function loadPricesByLookupKey(stripe, specs) {
  const prices = await stripe.listAll("/prices", {
    lookup_keys: specs.map((s) => s.lookupKey),
    active: true,
    expand: ["data.product"],
  });
  const byKey = new Map();
  for (const price of prices) if (price.lookup_key) byKey.set(price.lookup_key, price);
  return byKey;
}

async function ensurePrices(stripe, products, options) {
  const specs = priceSpecs();
  const byKey = await loadPricesByLookupKey(stripe, specs);
  const resolved = [];
  const warnings = [];

  for (const spec of specs) {
    const product = products[spec.tier];
    const existing = byKey.get(spec.lookupKey);
    if (!existing) {
      const price = await createPrice(stripe, product.id, spec, options, false);
      resolved.push({ spec, price });
      continue;
    }
    const productId = typeof existing.product === "string" ? existing.product : existing.product?.id;
    const sameProduct = productId === product.id;
    if (priceMatches(existing, spec) && sameProduct) {
      log(`  price    ${spec.lookupKey.padEnd(24)} exists   ${existing.id}  ${describePrice(existing)}`);
      resolved.push({ spec, price: existing });
      continue;
    }
    const why = !sameProduct
      ? `attached to product ${productId}, expected ${product.id}`
      : `is ${describePrice(existing)}, catalog says ${formatMoney(spec.unitAmount)}/${spec.stripeInterval}`;
    if (options.rotate) {
      log(`  price    ${spec.lookupKey.padEnd(24)} ROTATE   ${existing.id} ${why}`);
      const replacement = await createPrice(stripe, product.id, spec, options, true);
      if (!options.dryRun) {
        await stripe.post(`/prices/${existing.id}`, { active: false });
        log(`  price    ${"".padEnd(24)} archived ${existing.id}`);
      }
      resolved.push({ spec, price: replacement });
    } else {
      warnings.push(
        `${spec.lookupKey} (${existing.id}) ${why}. Prices are immutable in Stripe — rerun with --rotate-mismatched to replace it and move the lookup_key, or fix the catalog in lib/billing/plans.ts + scripts/stripe-lib.mjs.`,
      );
      log(`  price    ${spec.lookupKey.padEnd(24)} MISMATCH ${existing.id}  ${describePrice(existing)}`);
      resolved.push({ spec, price: existing, mismatch: true });
    }
  }
  return { resolved, warnings };
}

function sameEventSet(a, b) {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

async function ensureWebhook(stripe, appUrl, options) {
  const url = `${appUrl}${WEBHOOK_PATH}`;
  const endpoints = await stripe.listAll("/webhook_endpoints");
  const existing = endpoints.find((endpoint) => endpoint.url === url);
  if (existing) {
    const events = existing.enabled_events ?? [];
    const subscribedToAll = events.includes("*");
    let note = "";
    if (!subscribedToAll && !sameEventSet(events, WEBHOOK_EVENTS)) {
      if (options.dryRun) {
        note = " — events differ; would UPDATE to the six reconciled events [dry run]";
      } else {
        await stripe.post(`/webhook_endpoints/${existing.id}`, { enabled_events: [...WEBHOOK_EVENTS] });
        note = " — events updated to the six reconciled events";
      }
    }
    if (existing.status && existing.status !== "enabled") note += ` — status is "${existing.status}" (re-enable it in the Dashboard)`;
    log(`  webhook  ${url}\n           exists   ${existing.id}${note}`);
    return { endpoint: existing, created: false, url };
  }
  if (options.dryRun) {
    log(`  webhook  ${url}\n           CREATE   subscribed to ${WEBHOOK_EVENTS.length} events  [dry run]`);
    return { endpoint: { id: "we_DRYRUN", secret: "whsec_DRYRUN" }, created: true, url };
  }
  const endpoint = await stripe.post("/webhook_endpoints", {
    url,
    enabled_events: [...WEBHOOK_EVENTS],
    description: "Foundly subscription lifecycle (managed by scripts/stripe-bootstrap.mjs)",
    metadata: { managed_by: MANAGED_BY },
  });
  log(`  webhook  ${url}\n           created  ${endpoint.id}  subscribed to ${WEBHOOK_EVENTS.length} events`);
  return { endpoint, created: true, url };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    dryRun: Boolean(args.flags["dry-run"]),
    rotate: Boolean(args.flags["rotate-mismatched"]),
    skipWebhook: Boolean(args.flags["skip-webhook"]),
  };

  const key = resolveSecretKey(args);
  if (!key) fail("No Stripe key. Pass --key sk_test_... (or sk_live_...) or set STRIPE_SECRET_KEY.");
  const mode = keyMode(key);
  if (mode === "unknown") fail("That does not look like a Stripe secret key (expected sk_test_/sk_live_/rk_...). Publishable keys (pk_) cannot create objects.");

  const appUrl = options.skipWebhook ? null : resolveAppUrl(args);
  if (!options.skipWebhook && !appUrl) {
    fail("No app URL for the webhook. Pass --app-url https://your-deployment (or set APP_URL / NEXT_PUBLIC_APP_URL), or use --skip-webhook.");
  }
  if (appUrl && mode === "live" && !appUrl.startsWith("https://")) {
    fail("Live mode webhooks must use https://.");
  }

  const stripe = stripeClient(key);
  let account;
  try {
    account = await stripe.get("/account");
  } catch (error) {
    fail(`Stripe rejected the key: ${error instanceof Error ? error.message : String(error)}`);
  }

  log(`Foundly Stripe bootstrap`);
  log(`  mode     ${mode.toUpperCase()}${options.dryRun ? "  (dry run — no writes)" : ""}`);
  log(`  account  ${account.id}${account.settings?.dashboard?.display_name ? `  (${account.settings.dashboard.display_name})` : ""}`);
  log(`  currency ${CURRENCY.toUpperCase()}`);
  if (appUrl) log(`  app url  ${appUrl}`);
  log();

  log("Products");
  const products = {};
  for (const tier of SELLABLE_TIERS) {
    const { product } = await ensureProduct(stripe, tier, options);
    products[tier] = product;
  }
  log();

  log("Prices");
  const { resolved, warnings } = await ensurePrices(stripe, products, options);
  log();

  let webhook = null;
  if (!options.skipWebhook && appUrl) {
    log("Webhook");
    webhook = await ensureWebhook(stripe, appUrl, options);
    log();
  }

  // ── Env output ────────────────────────────────────────────
  const envLines = [];
  envLines.push(`STRIPE_SECRET_KEY=${key}`);
  if (webhook?.created && webhook.endpoint.secret) {
    envLines.push(`STRIPE_WEBHOOK_SECRET=${webhook.endpoint.secret}`);
  }
  for (const { spec, price } of resolved) envLines.push(`${spec.envVar}=${price.id}`);

  log("Paste into your environment (Vercel → Settings → Environment Variables, then redeploy):");
  log();
  for (const line of envLines) log(`  ${line}`);
  log();

  const target = mode === "live" ? "production" : "preview";
  log(`Or via the Vercel CLI (${target}):`);
  log();
  for (const line of envLines) {
    const [name, value] = line.split(/=(.*)/s);
    log(`  printf '%s' '${value}' | vercel env add ${name} ${target}`);
  }
  log();

  if (webhook && !webhook.created) {
    log("STRIPE_WEBHOOK_SECRET: the endpoint already existed, and Stripe only shows a signing secret");
    log(`  when an endpoint is created. If it is not already set, open the Dashboard → Developers →`);
    log(`  Webhooks → ${webhook.endpoint.id} → "Reveal" the signing secret, or delete the endpoint and rerun.`);
    log();
  }
  if (options.skipWebhook) {
    log("Webhook skipped. For local testing: stripe listen --forward-to localhost:3000/api/webhooks/stripe");
    log("  and use the whsec_ it prints as STRIPE_WEBHOOK_SECRET.");
    log();
  }

  for (const warning of warnings) log(`WARNING: ${warning}`);
  if (warnings.length) log();

  log(`Next: node scripts/stripe-verify.mjs --key ${mode === "live" ? "sk_live_..." : "sk_test_..."}${appUrl ? ` --app-url ${appUrl}` : ""}  (after the env vars are set)`);
  if (options.dryRun) log("\nDry run complete — nothing was written.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof StripeError) {
      fail(`${error.message}${error.body?.error?.code ? ` [${error.body.error.code}]` : ""}`);
    }
    fail(error instanceof Error ? error.stack ?? error.message : String(error));
  });
}
