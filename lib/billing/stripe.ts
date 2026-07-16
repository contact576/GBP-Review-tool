import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

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
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
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
  successUrl: string;
  cancelUrl: string;
  workspaceId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await stripePost<{ url?: string }>("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": 1,
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "metadata[workspaceId]": input.workspaceId,
    allow_promotion_codes: "true",
    automatic_tax: "enabled",
  } as Record<string, string | number>);
  if (!res.ok) return res;
  return res.data.url ? { ok: true, url: res.data.url } : { ok: false, error: "no url" };
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
): { ok: true; event: unknown } | { ok: false; error: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: "not_configured" };
  if (!sigHeader) return { ok: false, error: "missing signature" };
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return { ok: false, error: "bad signature header" };
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "signature mismatch" };
  }
  try {
    return { ok: true, event: JSON.parse(payload) };
  } catch {
    return { ok: false, error: "bad payload" };
  }
}
