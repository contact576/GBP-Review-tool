import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanTier } from "@/lib/data/types";

/**
 * Stripe adapter — ready-but-inactive. With no STRIPE_SECRET_KEY the billing
 * UI shows honest "connect billing to enable payments" states and no call is
 * made. Implemented over Stripe's REST API (form-encoded) so no `stripe`
 * package dependency is required. Activate with STRIPE_SECRET_KEY (+
 * STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_* ids per plan).
 */

const API = "https://api.stripe.com/v1";

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function form(data: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
}

async function stripePost<T>(
  path: string,
  body: Record<string, string | number | undefined>,
  idempotencyKey?: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: form(body),
      cache: "no-store",
    });
    const json = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `stripe ${res.status}` };
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

/** Create a Checkout Session for a subscription price. Returns the hosted URL. */
export async function createCheckoutSession(input: {
  priceId: string;
  customerEmail: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  workspaceId: string;
  tier: Exclude<PlanTier, "free">;
  interval: "monthly" | "annual";
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const body: Record<string, string | number | undefined> = {
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": 1,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.workspaceId,
    "metadata[workspaceId]": input.workspaceId,
    "metadata[tier]": input.tier,
    "metadata[interval]": input.interval,
    "subscription_data[metadata][workspaceId]": input.workspaceId,
    "subscription_data[metadata][tier]": input.tier,
    "subscription_data[metadata][interval]": input.interval,
    allow_promotion_codes: "true",
    automatic_tax: "enabled",
  };
  if (input.customerId) body.customer = input.customerId;
  else body.customer_email = input.customerEmail;
  const res = await stripePost<{ url?: string }>("/checkout/sessions", body);
  if (!res.ok) return res;
  return res.data.url ? { ok: true, url: res.data.url } : { ok: false, error: "no url" };
}

/** Apply an immutable credit to the referrer's next Stripe invoice. */
export async function createCustomerCredit(input: {
  customerId: string;
  amountCents: number;
  currency: "USD" | "CAD";
  referredWorkspaceId: string;
}): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const result = await stripePost<{ id?: string }>(
    `/customers/${encodeURIComponent(input.customerId)}/balance_transactions`,
    {
      amount: -Math.abs(Math.round(input.amountCents)),
      currency: input.currency.toLowerCase(),
      description: "Foundly referral credit",
      "metadata[referredWorkspaceId]": input.referredWorkspaceId,
    },
    `foundly-referral-${input.referredWorkspaceId}`,
  );
  if (!result.ok) return result;
  return result.data.id
    ? { ok: true, transactionId: result.data.id }
    : { ok: false, error: "Stripe returned no balance transaction id." };
}

const PAID_TIERS: Exclude<PlanTier, "free">[] = [
  "starter",
  "growth",
  "pro",
  "multi",
  "agency",
];

/** Reverse-map a Stripe price id to the immutable application plan it grants. */
export function resolvePlanForPrice(
  priceId: string,
): { tier: Exclude<PlanTier, "free">; interval: "monthly" | "annual" } | null {
  for (const tier of PAID_TIERS) {
    const base = `STRIPE_PRICE_${tier.toUpperCase()}`;
    if (process.env[`${base}_MONTHLY`] === priceId || process.env[base] === priceId) {
      return { tier, interval: "monthly" };
    }
    if (process.env[`${base}_ANNUAL`] === priceId) {
      return { tier, interval: "annual" };
    }
  }
  return null;
}

/** Create a Billing Portal session so a customer can manage their plan/card. */
export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await stripePost<{ url?: string }>("/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  if (!res.ok) return res;
  return res.data.url ? { ok: true, url: res.data.url } : { ok: false, error: "no url" };
}

/**
 * Verify a Stripe webhook signature (t=timestamp,v1=hmac). Returns the parsed
 * event on success. No-throw. Requires STRIPE_WEBHOOK_SECRET.
 */
export function verifyWebhook(
  payload: string,
  sigHeader: string | null,
  nowSeconds = Math.floor(Date.now() / 1_000),
): { ok: true; event: unknown } | { ok: false; error: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: "not_configured" };
  if (!sigHeader) return { ok: false, error: "missing signature" };
  let timestamp = "";
  const signatures: string[] = [];
  for (const item of sigHeader.split(",")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  const issuedAt = Number(timestamp);
  if (!Number.isInteger(issuedAt) || signatures.length === 0) {
    return { ok: false, error: "bad signature header" };
  }
  if (Math.abs(nowSeconds - issuedAt) > 300) {
    return { ok: false, error: "stale signature" };
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const matches = signatures.some((signature) => {
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!matches) {
    return { ok: false, error: "signature mismatch" };
  }
  try {
    return { ok: true, event: JSON.parse(payload) };
  } catch {
    return { ok: false, error: "bad payload" };
  }
}
