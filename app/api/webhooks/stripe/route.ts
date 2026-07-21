import { NextResponse } from "next/server";
import { createCustomerCredit, resolvePlanForPrice, verifyWebhook } from "@/lib/billing/stripe";
import { reconcileStripeEvent } from "@/lib/billing/reconcile";
import { getRealProvider } from "@/lib/data";
import { logServerError } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify raw Stripe payloads, then persist tenant-scoped subscription state. */
export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  const result = verifyWebhook(payload, signature);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const reconciliation = reconcileStripeEvent(result.event, resolvePlanForPrice);
  if (!reconciliation) {
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }

  try {
    const provider = await getRealProvider();
    await provider.setSubscription(reconciliation.workspaceId, reconciliation.patch);
    const tier = reconciliation.patch.tier;
    const status = reconciliation.patch.status;
    await provider.setIntegrationStatus(
      reconciliation.workspaceId,
      "stripe",
      status === "past_due" || status === "canceled" ? "needs_attention" : "connected",
      [tier, status].filter(Boolean).join(" · ") || "Billing synced",
    );
    if (status === "active") {
      const reward = await provider.getPendingReferralReward(reconciliation.workspaceId);
      if (reward) {
        const configured = Number(process.env.REFERRAL_CREDIT_CENTS ?? 5_000);
        const amountCents = Number.isInteger(configured) && configured >= 100 && configured <= 100_000
          ? configured
          : 5_000;
        const credit = await createCustomerCredit({
          customerId: reward.stripeCustomerId,
          amountCents,
          currency: reward.currency,
          referredWorkspaceId: reward.referredWorkspaceId,
        });
        if (!credit.ok) throw new Error(`Referral credit failed: ${credit.error}`);
        await provider.markReferralRewardApplied(
          reward.referredWorkspaceId,
          new Date().toISOString(),
        );
      }
    }
  } catch (error) {
    logServerError(error, { event: "stripe_webhook_reconciliation_failed" });
    // A 5xx asks Stripe to retry instead of silently losing entitlement state.
    return NextResponse.json({ error: "subscription sync failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true }, { status: 200 });
}
