/**
 * Plan catalog + entitlements. Single source of truth for pricing, feature
 * gates, and usage limits — drives paywalls, the Pro-disclosure ladder, and
 * the reverse-trial → living-free-tier downgrade. Pure data; no Stripe SDK.
 */

export type PlanId = "free" | "starter" | "growth" | "multi" | "agency";

/**
 * Plans that existed in earlier releases and may still sit in the `tier` column
 * of live subscription rows. Reads normalize through `normalizePlan` so a
 * retired tier never crashes a page or silently drops entitlements.
 */
const LEGACY_PLAN_ALIASES: Record<string, PlanId> = {
  // "Pro" was folded into Growth — Growth now carries every single-location tool.
  pro: "growth",
};

/** Coerce any stored tier string (including retired ones) to a live plan id. */
export function normalizePlan(tier: string | null | undefined): PlanId {
  if (!tier) return "free";
  if (tier in PLANS) return tier as PlanId;
  return LEGACY_PLAN_ALIASES[tier] ?? "free";
}

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
    blurb: "Every tool for one location — rank grid, AI visibility, and the co-pilot included.",
    anchor: true,
    features: [
      "ai_drafts",
      "campaigns_lite",
      "campaigns_pro",
      "gbp_copilot",
      "rank_grid",
      "ai_visibility",
      "remove_badge",
    ],
    limits: { aiDraftsPerMonth: -1, locations: 1, smsCredits: 250, seats: 10 },
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

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "multi", "agency"];

/** Length of the no-card reverse trial, in days. */
export const TRIAL_DAYS = 30;

/** The plan a trialing workspace is treated as being on. */
export const TRIAL_PLAN: PlanId = "growth";

/**
 * Every tool unlocked during the trial. Deliberately spelled out rather than
 * derived, so "what does the trial include" is a one-line answer and a
 * one-line change. Packaging-only entitlements (`multi_location`,
 * `white_label`) are not tools and stay with their tiers.
 */
export const TRIAL_FEATURES: readonly Feature[] = [
  "ai_drafts",
  "campaigns_lite",
  "campaigns_pro",
  "gbp_copilot",
  "rank_grid",
  "ai_visibility",
  "remove_badge",
];

/**
 * During the 30-day reverse trial every workspace gets the full toolset.
 *
 * The trial *raises* a workspace to the trial plan — it never lowers one. A
 * paying Multi-location or Agency customer whose Stripe status is `trialing`
 * keeps their own (higher) entitlements instead of being silently downgraded.
 */
export function effectivePlan(planId: PlanId, trialing: boolean): PlanId {
  const plan = normalizePlan(planId);
  if (!trialing) return plan;
  return PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(TRIAL_PLAN) ? plan : TRIAL_PLAN;
}

/** Does this plan (accounting for an active trial) include a feature? */
export function hasFeature(planId: PlanId, feature: Feature, trialing = false): boolean {
  if (trialing && TRIAL_FEATURES.includes(feature)) return true;
  return PLANS[effectivePlan(planId, trialing)].features.includes(feature);
}

/** Feature reached from a lower tier — the plan to upsell to. */
export function upgradeFor(feature: Feature): Plan {
  for (const id of PLAN_ORDER) {
    if (PLANS[id].features.includes(feature)) return PLANS[id];
  }
  return PLANS.growth;
}

/** ISO timestamp for when a trial started right now would end. */
export function trialEndsFrom(startedAt: Date = new Date()): string {
  return new Date(startedAt.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
}
