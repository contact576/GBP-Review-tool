import { describe, expect, it } from "vitest";
import { reconcileStripeEvent } from "@/lib/billing/reconcile";

const resolvePrice = (priceId: string) =>
  priceId === "price_growth_year"
    ? ({ tier: "growth", interval: "annual" } as const)
    : null;

describe("Stripe subscription reconciliation", () => {
  it("captures Checkout ids without prematurely granting an active status", () => {
    const result = reconcileStripeEvent(
      {
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: "ws_live_1",
            customer: "cus_1",
            subscription: "sub_1",
            metadata: { tier: "growth", interval: "annual" },
          },
        },
      },
      resolvePrice,
    );

    expect(result).toEqual({
      workspaceId: "ws_live_1",
      patch: {
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        tier: "growth",
        interval: "annual",
      },
    });
    expect(result?.patch.status).toBeUndefined();
  });

  it("uses the configured Stripe price as the authoritative plan mapping", () => {
    const result = reconcileStripeEvent(
      {
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            customer: { id: "cus_1" },
            status: "active",
            current_period_end: 1_800_000_000,
            cancel_at_period_end: true,
            metadata: { workspaceId: "ws_live_1", tier: "starter" },
            items: {
              data: [{ price: { id: "price_growth_year", recurring: { interval: "year" } } }],
            },
          },
        },
      },
      resolvePrice,
    );

    expect(result).toEqual({
      workspaceId: "ws_live_1",
      patch: {
        status: "active",
        cancelAtPeriodEnd: true,
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_growth_year",
        tier: "growth",
        interval: "annual",
        currentPeriodEnd: "2027-01-15T08:00:00.000Z",
      },
    });
  });

  it("removes paid entitlement when Stripe deletes the subscription", () => {
    const result = reconcileStripeEvent(
      {
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            metadata: { workspaceId: "ws_live_1" },
            items: { data: [] },
          },
        },
      },
      resolvePrice,
    );

    expect(result?.patch.status).toBe("canceled");
    expect(result?.patch.tier).toBe("free");
  });

  it("ignores events that cannot be scoped to a valid workspace", () => {
    expect(
      reconcileStripeEvent(
        { type: "customer.subscription.updated", data: { object: { metadata: {} } } },
        resolvePrice,
      ),
    ).toBeNull();
  });
});
