import { describe, expect, it } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  TRIAL_DAYS,
  TRIAL_FEATURES,
  TRIAL_PLAN,
  effectivePlan,
  hasFeature,
  normalizePlan,
  trialEndsFrom,
  upgradeFor,
  type Feature,
} from "../plans";

describe("plan catalog", () => {
  it("no longer offers a Pro tier", () => {
    expect(Object.keys(PLANS)).not.toContain("pro");
    expect(PLAN_ORDER).not.toContain("pro");
  });

  it("keeps every catalog entry in PLAN_ORDER, and vice versa", () => {
    expect([...PLAN_ORDER].sort()).toEqual(Object.keys(PLANS).sort());
  });

  it("folds Pro's tools into Growth so nothing was lost with the tier", () => {
    // These three were Pro-only. Removing Pro must not remove the features.
    for (const feature of ["rank_grid", "ai_visibility", "campaigns_pro"] as Feature[]) {
      expect(PLANS.growth.features).toContain(feature);
    }
  });
});

describe("normalizePlan", () => {
  it("maps the retired Pro tier onto Growth", () => {
    expect(normalizePlan("pro")).toBe("growth");
  });

  it("passes live tiers through untouched", () => {
    for (const id of PLAN_ORDER) expect(normalizePlan(id)).toBe(id);
  });

  it("falls back to free for empty or unrecognised values", () => {
    expect(normalizePlan(undefined)).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan("")).toBe("free");
    expect(normalizePlan("enterprise_2019")).toBe("free");
  });

  it("never returns a tier that is missing from the catalog", () => {
    // The bug this guards: PLANS[tier] returning undefined and crashing a page.
    for (const value of ["pro", "free", "growth", "nonsense", ""]) {
      expect(PLANS[normalizePlan(value)]).toBeDefined();
    }
  });
});

describe("the 30-day trial", () => {
  it("runs for 30 days", () => {
    expect(TRIAL_DAYS).toBe(30);
  });

  it("ends 30 days after it starts", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(trialEndsFrom(start)).toBe("2026-01-31T00:00:00.000Z");
  });

  it("unlocks every tool for a workspace on the lowest tier", () => {
    for (const feature of TRIAL_FEATURES) {
      expect(hasFeature("free", feature, true)).toBe(true);
    }
  });

  it("grants the two features that used to be paywalled away from trials", () => {
    // The old reverse trial resolved to Growth, which lacked both — so every
    // trialing workspace saw a locked Rank Grid and AI Visibility.
    expect(hasFeature("free", "rank_grid", true)).toBe(true);
    expect(hasFeature("free", "ai_visibility", true)).toBe(true);
  });

  it("raises a workspace to the trial plan but never lowers one", () => {
    expect(effectivePlan("free", true)).toBe(TRIAL_PLAN);
    expect(effectivePlan("starter", true)).toBe(TRIAL_PLAN);
    // A paying Agency customer reported as `trialing` by Stripe keeps Agency.
    expect(effectivePlan("agency", true)).toBe("agency");
    expect(effectivePlan("multi", true)).toBe("multi");
  });

  it("keeps packaging entitlements with their tiers", () => {
    // White-label and multi-location are how the product is sold, not tools.
    expect(hasFeature("free", "white_label", true)).toBe(false);
    expect(hasFeature("free", "multi_location", true)).toBe(false);
  });

  it("drops back to the real plan once the trial ends", () => {
    expect(effectivePlan("free", false)).toBe("free");
    expect(hasFeature("free", "rank_grid", false)).toBe(false);
  });

  it("coerces a retired stored tier rather than throwing", () => {
    expect(effectivePlan("pro" as never, false)).toBe("growth");
    expect(hasFeature("pro" as never, "rank_grid", false)).toBe(true);
  });
});

describe("upgradeFor", () => {
  it("names the cheapest plan that actually includes the feature", () => {
    expect(upgradeFor("rank_grid").id).toBe("growth");
    expect(upgradeFor("campaigns_lite").id).toBe("starter");
    expect(upgradeFor("white_label").id).toBe("agency");
  });

  it("only ever returns a plan that is still in the catalog", () => {
    const features: Feature[] = [
      "ai_drafts",
      "campaigns_lite",
      "campaigns_pro",
      "rank_grid",
      "ai_visibility",
      "multi_location",
      "white_label",
      "remove_badge",
      "gbp_copilot",
    ];
    for (const feature of features) {
      expect(PLAN_ORDER).toContain(upgradeFor(feature).id);
    }
  });
});
