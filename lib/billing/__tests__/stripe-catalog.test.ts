import { describe, expect, it } from "vitest";
import { PLANS, PLAN_ORDER, type PlanId } from "../plans";
import {
  CURRENCY,
  INTERVALS,
  SELLABLE_TIERS,
  STRIPE_CATALOG,
  WEBHOOK_EVENTS,
  encodeForm,
  envVarFor,
  lookupKeyFor,
  parseArgs,
  parseEnvFile,
  priceSpecs,
  resolveSecretKey,
  unitAmountFor,
} from "../../../scripts/stripe-lib.mjs";

/**
 * `scripts/stripe-bootstrap.mjs` cannot import `plans.ts` (plain Node, no TS
 * loader), so it carries its own copy of the price table. This test is the
 * only thing stopping the two from drifting: change a price in one file and
 * this fails until the other matches.
 */
describe("Stripe bootstrap catalog mirrors lib/billing/plans.ts", () => {
  it("covers exactly the sellable (non-free) tiers, in plan order", () => {
    const sellable = PLAN_ORDER.filter((id) => id !== "free");
    expect([...SELLABLE_TIERS]).toEqual(sellable);
    expect(Object.keys(STRIPE_CATALOG).sort()).toEqual([...sellable].sort());
  });

  it("carries the same monthly and annual-per-month amounts as PLANS", () => {
    for (const tier of SELLABLE_TIERS) {
      const plan = PLANS[tier as PlanId];
      const entry = STRIPE_CATALOG[tier];
      expect(entry.monthly, `${tier} monthly`).toBe(plan.priceMonthly);
      expect(entry.annualMonthly, `${tier} annual-per-month`).toBe(plan.priceAnnualMonthly);
    }
  });

  it("never offers a $0 recurring price (the free tier is not a Stripe product)", () => {
    for (const spec of priceSpecs()) expect(spec.unitAmount).toBeGreaterThan(0);
    expect(Object.keys(STRIPE_CATALOG)).not.toContain("free");
    expect(Object.keys(STRIPE_CATALOG)).not.toContain("pro");
  });

  it("charges the annual price once a year at 12 × the per-month figure, in cents", () => {
    expect(unitAmountFor("starter", "monthly")).toBe(PLANS.starter.priceMonthly * 100);
    expect(unitAmountFor("starter", "annual")).toBe(PLANS.starter.priceAnnualMonthly * 12 * 100);
    expect(unitAmountFor("agency", "annual")).toBe(PLANS.agency.priceAnnualMonthly * 12 * 100);
    expect(CURRENCY).toBe("usd");
  });

  it("derives the exact env var names startCheckoutAction / resolvePlanForPrice read", () => {
    const expected = [
      "STRIPE_PRICE_STARTER_MONTHLY",
      "STRIPE_PRICE_STARTER_ANNUAL",
      "STRIPE_PRICE_GROWTH_MONTHLY",
      "STRIPE_PRICE_GROWTH_ANNUAL",
      "STRIPE_PRICE_MULTI_MONTHLY",
      "STRIPE_PRICE_MULTI_ANNUAL",
      "STRIPE_PRICE_AGENCY_MONTHLY",
      "STRIPE_PRICE_AGENCY_ANNUAL",
    ];
    expect(priceSpecs().map((spec) => spec.envVar)).toEqual(expected);
    expect(envVarFor("growth", "annual")).toBe("STRIPE_PRICE_GROWTH_ANNUAL");
    expect(lookupKeyFor("growth", "annual")).toBe("foundly_growth_annual");
    expect([...INTERVALS]).toEqual(["monthly", "annual"]);
  });

  it("subscribes the webhook to exactly the six events the route reconciles", () => {
    expect([...WEBHOOK_EVENTS].sort()).toEqual(
      [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
      ].sort(),
    );
  });
});

describe("Stripe script plumbing", () => {
  it("encodes nested objects and arrays the way Stripe's form API expects", () => {
    const encoded = encodeForm({
      recurring: { interval: "month" },
      enabled_events: ["a.b", "c.d"],
      metadata: { foundly_tier: "growth" },
      skip: undefined,
    }).toString();
    expect(decodeURIComponent(encoded)).toBe(
      "recurring[interval]=month&enabled_events[0]=a.b&enabled_events[1]=c.d&metadata[foundly_tier]=growth",
    );
  });

  it("accepts the key from --key, --key=, a positional argument, or the environment", () => {
    expect(resolveSecretKey(parseArgs(["--key", "sk_test_a"]), {})).toBe("sk_test_a");
    expect(resolveSecretKey(parseArgs(["--key=sk_live_b"]), {})).toBe("sk_live_b");
    expect(resolveSecretKey(parseArgs(["sk_test_c"]), {})).toBe("sk_test_c");
    expect(resolveSecretKey(parseArgs([]), { STRIPE_SECRET_KEY: "sk_test_d" })).toBe("sk_test_d");
    expect(resolveSecretKey(parseArgs([]), {})).toBeNull();
  });

  it("parses a vercel env pull file, stripping quotes and comments", () => {
    const parsed = parseEnvFile('# comment\nSTRIPE_SECRET_KEY="sk_test_x"\nAPP_URL=\'https://a.b\'\n\nBAD LINE\n');
    expect(parsed).toEqual({ STRIPE_SECRET_KEY: "sk_test_x", APP_URL: "https://a.b" });
  });
});
