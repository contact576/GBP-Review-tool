/**
 * Shared pieces for `stripe-bootstrap.mjs` and `stripe-verify.mjs`.
 *
 * Node 22, no dependencies — Stripe is talked to over plain `fetch`, exactly
 * like `lib/billing/stripe.ts` does at runtime. Nothing in here is imported by
 * the app; the app only ever reads the STRIPE_* env vars these scripts print.
 */

// ── Catalog ─────────────────────────────────────────────────
/**
 * DUPLICATED ON PURPOSE from `lib/billing/plans.ts` (PLANS[tier].priceMonthly /
 * priceAnnualMonthly). Plain Node cannot import that TypeScript module, so the
 * numbers live here too — and `lib/billing/__tests__/stripe-catalog.test.ts`
 * asserts this table equals `plans.ts` so the two can never drift silently.
 * If you change a price, change it in BOTH places and let the test confirm.
 *
 * `annualMonthly` is the effective per-month figure when billed annually; the
 * annual Stripe price is charged once a year at `annualMonthly * 12`.
 */
export const STRIPE_CATALOG = /** @type {const} */ ({
  starter: {
    name: "Foundly Starter",
    blurb: "The review loop: capture, request, reply.",
    monthly: 39,
    annualMonthly: 33,
  },
  growth: {
    name: "Foundly Growth",
    blurb: "Every tool for one location — rank grid, AI visibility, and the co-pilot included.",
    monthly: 99,
    annualMonthly: 82,
  },
  multi: {
    name: "Foundly Multi-location",
    blurb: "Per-location, rolled up.",
    monthly: 69,
    annualMonthly: 59,
  },
  agency: {
    name: "Foundly Agency",
    blurb: "White-label the whole platform for your clients.",
    monthly: 299,
    annualMonthly: 249,
  },
});

/** Sellable tiers, in catalog order. Mirrors `PAID_TIERS` in lib/billing/stripe.ts. */
export const SELLABLE_TIERS = /** @type {const} */ (["starter", "growth", "multi", "agency"]);

export const INTERVALS = /** @type {const} */ (["monthly", "annual"]);

/** Currency for every price. `plans.ts` documents its amounts as a USD baseline. */
export const CURRENCY = "usd";

/**
 * Stripe events `app/api/webhooks/stripe/route.ts` (via lib/billing/reconcile.ts)
 * reconciles. The endpoint is subscribed to exactly these — nothing more, so a
 * stray event type never lands on a handler that ignores it.
 */
export const WEBHOOK_EVENTS = /** @type {const} */ ([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export const WEBHOOK_PATH = "/api/webhooks/stripe";

/** `foundly_growth_annual` — the Stripe lookup_key for a tier/interval. */
export function lookupKeyFor(tier, interval) {
  return `foundly_${tier}_${interval}`;
}

/** `STRIPE_PRICE_GROWTH_ANNUAL` — the env var the app reads (lib/actions.ts startCheckoutAction). */
export function envVarFor(tier, interval) {
  return `STRIPE_PRICE_${tier.toUpperCase()}_${interval === "annual" ? "ANNUAL" : "MONTHLY"}`;
}

/** Stripe recurring interval for one of ours. */
export function stripeIntervalFor(interval) {
  return interval === "annual" ? "year" : "month";
}

/** Amount in the smallest currency unit (cents) charged per billing period. */
export function unitAmountFor(tier, interval) {
  const entry = STRIPE_CATALOG[tier];
  if (!entry) throw new Error(`Unknown tier: ${tier}`);
  const dollars = interval === "annual" ? entry.annualMonthly * 12 : entry.monthly;
  return Math.round(dollars * 100);
}

/** Every (tier, interval) pair with its derived keys — the spec both scripts walk. */
export function priceSpecs() {
  const specs = [];
  for (const tier of SELLABLE_TIERS) {
    for (const interval of INTERVALS) {
      specs.push({
        tier,
        interval,
        lookupKey: lookupKeyFor(tier, interval),
        envVar: envVarFor(tier, interval),
        stripeInterval: stripeIntervalFor(interval),
        unitAmount: unitAmountFor(tier, interval),
        currency: CURRENCY,
      });
    }
  }
  return specs;
}

// ── CLI helpers ─────────────────────────────────────────────
/**
 * `--key sk_...`, `--key=sk_...`, positional `sk_...`, or the env var.
 * @param {string[]} argv
 * @returns {{ flags: Record<string, string | boolean>, positional: string[] }}
 */
export function parseArgs(argv) {
  const flags = /** @type {Record<string, string | boolean>} */ ({});
  const positional = /** @type {string[]} */ ([]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[arg.slice(2)] = next;
      i += 1;
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return { flags, positional };
}

/** @param {{ flags: Record<string, string | boolean>, positional: string[] }} args @param {Record<string, string | undefined>} [env] */
export function resolveSecretKey({ flags, positional }, env = process.env) {
  const fromFlag = typeof flags.key === "string" ? flags.key : undefined;
  const fromPositional = positional.find((value) => /^(sk|rk)_(test|live)_/.test(value));
  const key = fromFlag ?? fromPositional ?? env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return key.trim();
}

/** "test" | "live" | "unknown" — from the key prefix, so the operator sees which account they're touching. */
export function keyMode(key) {
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return "unknown";
}

/** @param {{ flags: Record<string, string | boolean> }} args @param {Record<string, string | undefined>} [env] */
export function resolveAppUrl({ flags }, env = process.env) {
  const raw =
    (typeof flags["app-url"] === "string" ? flags["app-url"] : undefined) ??
    env.APP_URL ??
    env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Parse a `KEY=value` file (a `.env`, or the output of `vercel env pull`) into
 * a plain object. Quotes are stripped; blank lines and comments skipped.
 */
export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// ── Stripe REST client ──────────────────────────────────────
const API = "https://api.stripe.com/v1";

/**
 * Flatten nested objects/arrays into Stripe's bracketed form encoding:
 *   { metadata: { a: 1 }, enabled_events: ["x"] }
 *   → metadata[a]=1&enabled_events[0]=x
 */
export function encodeForm(data, prefix = "", params = new URLSearchParams()) {
  for (const [rawKey, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const key = prefix ? `${prefix}[${rawKey}]` : rawKey;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") encodeForm(item, `${key}[${index}]`, params);
        else params.append(`${key}[${index}]`, String(item));
      });
    } else if (typeof value === "object") {
      encodeForm(value, key, params);
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

export class StripeError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "StripeError";
    this.status = status;
    this.body = body;
  }
}

export function stripeClient(secretKey) {
  async function request(method, path, body, idempotencyKey) {
    const headers = { Authorization: `Bearer ${secretKey}` };
    let url = `${API}${path}`;
    let payload;
    if (body && method === "GET") {
      const query = encodeForm(body).toString();
      if (query) url += (url.includes("?") ? "&" : "?") + query;
    } else if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = encodeForm(body).toString();
    }
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetch(url, { method, headers, body: payload });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new StripeError(`Stripe returned non-JSON (${res.status})`, res.status, text);
    }
    if (!res.ok) {
      const message = json?.error?.message ?? `Stripe ${res.status}`;
      throw new StripeError(message, res.status, json);
    }
    return json;
  }

  /** Walk every page of a list endpoint. */
  async function listAll(path, query = {}) {
    const items = [];
    let startingAfter;
    for (;;) {
      const page = await request("GET", path, {
        ...query,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      items.push(...(page.data ?? []));
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
    return items;
  }

  return {
    get: (path, query) => request("GET", path, query),
    post: (path, body, idempotencyKey) => request("POST", path, body, idempotencyKey),
    del: (path) => request("DELETE", path),
    listAll,
  };
}

// ── Output helpers ──────────────────────────────────────────
export function formatMoney(unitAmount, currency = CURRENCY) {
  return `${(unitAmount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** Fixed-width text table for terminals — no dependency on cli-table. */
export function renderTable(headers, rows) {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => String(row[i] ?? "").length)),
  );
  const line = (cells) => cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join("  ");
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}
