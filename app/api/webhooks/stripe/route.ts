import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint — ready-but-inactive. Reads the raw request body
 * (required for signature verification), verifies the `stripe-signature`
 * header, then acknowledges the events we care about. It is a safe no-op until
 * STRIPE_WEBHOOK_SECRET is set: without it `verifyWebhook` returns
 * `not_configured` and we honestly answer 400.
 *
 * On `checkout.session.completed` / `customer.subscription.updated` we log only
 * for now — persisting Stripe customer/subscription state will be wired here
 * once billing is activated. We always build a truthful 200/400 response.
 */
export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");

  const result = verifyWebhook(payload, signature);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const event = result.event as { type?: string; id?: string };
  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
      // Log-only no-op for now (inactive without live keys + persistence).
      console.log(`[stripe webhook] received ${event.type} (${event.id ?? "no id"})`);
      break;
    default:
      // Unhandled event types are acknowledged so Stripe stops retrying.
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
