/**
 * Plan catalog + entitlements. Single source of truth for pricing, feature
 * gates, and usage limits — drives paywalls, the Pro-disclosure ladder, and
 * the reverse-trial → living-free-tier downgrade. Pure data; no Stripe SDK.
 */

export type PlanId = "free" | "starter" | "growth" | "pro" | "multi" | "agency";

export type Feature =
  | "ai_drafts"
  | "campaigns_lite"
  | "campaigns_pro"
  | "rank_grid"
  | "ai_visibility"
  | "multi_location"
  | "white_label"
  | "remove_badge"
  | "gbp_copilot";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in the workspace currency's major unit (USD baseline). */
  priceMonthly: number;
  priceAnnualMonthly: number; // effective per-month when billed annually
  blurb: string;
  anchor?: boolean; // the highlighted "most popular" tier
  features: Feature[];
  limits: {
    aiDraftsPerMonth: number; // -1 = unlimited
    locations: number;
    smsCredits: number;
    seats: number;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnualMonthly: 0,
    blurb: "Keep your QR, review link, and a monthly Score — forever.",
    features: ["ai_drafts"],
    limits: { aiDraftsPerMonth: 5, locations: 1, smsCredits: 0, seats: 1 },
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 39,
    priceAnnualMonthly: 33,
    blurb: "The review loop: capture, request, reply.",
    features: ["ai_drafts", "campaigns_lite"],
    limits: { aiDraftsPerMonth: 100, locations: 1, smsCredits: 100, seats: 3 },
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 99,
    priceAnnualMonthly: 82,
    blurb: "Everything to get found and get chosen. Most popular.",
    anchor: true,
    features: ["ai_drafts", "campaigns_lite", "gbp_copilot", "remove_badge"],
    limits: { aiDraftsPerMonth: -1, locations: 1, smsCredits: 250, seats: 10 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 179,
    priceAnnualMonthly: 149,
    blurb: "Rank grid, AI visibility, and Campaigns Pro.",
    features: [
      "ai_drafts",
      "campaigns_lite",
      "campaigns_pro",
      "gbp_copilot",
      "rank_grid",
      "ai_visibility",
      "remove_badge",
    ],
    limits: { aiDraftsPerMonth: -1, locations: 1, smsCredits: 500, seats: 20 },
  },
  multi: {
    id: "multi",
    name: "Multi-location",
    priceMonthly: 69,
    priceAnnualMonthly: 59,
    blurb: "Per-location, rolled up. From $69/location.",
    features: [
      "ai_drafts",
      "campaigns_lite",
      "campaigns_pro",
      "gbp_copilot",
      "rank_grid",
      "ai_visibility",
      "multi_location",
      "remove_badge",
    ],
    limits: { aiDraftsPerMonth: -1, locations: 50, smsCredits: 500, seats: 50 },
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 299,
    priceAnnualMonthly: 249,
    blurb: "White-label the whole platform for your clients.",
    features: [
      "ai_drafts",
      "campaigns_lite",
      "campaigns_pro",
      "gbp_copilot",
      "rank_grid",
      "ai_visibility",
      "multi_location",
      "white_label",
      "remove_badge",
    ],
    limits: { aiDraftsPerMonth: -1, locations: 50, smsCredits: 1000, seats: 50 },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "pro", "multi", "agency"];

/** During the 14-day reverse trial every workspace gets full Growth. */
export function effectivePlan(planId: PlanId, trialing: boolean): PlanId {
  return trialing ? "growth" : planId;
}

/** Does this plan (accounting for an active trial) include a feature? */
export function hasFeature(planId: PlanId, feature: Feature, trialing = false): boolean {
  return PLANS[effectivePlan(planId, trialing)].features.includes(feature);
}

/** Feature reached from a lower tier — the plan to upsell to. */
export function upgradeFor(feature: Feature): Plan {
  for (const id of PLAN_ORDER) {
    if (PLANS[id].features.includes(feature)) return PLANS[id];
  }
  return PLANS.pro;
}
