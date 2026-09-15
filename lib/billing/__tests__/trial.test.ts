import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, TRIAL_FEATURES, hasFeature } from "../plans";
import {
  TRIAL_ENDING_SOON_DAYS,
  TRIAL_LOCK_ALLOWED_PREFIXES,
  entitledPlan,
  isTrialExpired,
  shouldTrialLock,
  subscriptionHasFeature,
  trialLockAllowsPath,
  trialLocked,
  trialState,
  trialUnlocks,
} from "../trial";
import type { Subscription } from "@/lib/data/types";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const DAY = 86_400_000;

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY).toISOString();
}

/** The row every sign-up writes: Growth, trialing, 30 days out. */
function trialing(offsetDays: number, extra: Partial<Subscription> = {}) {
  return { status: "trialing" as const, tier: "growth" as const, trialEndsAt: iso(offsetDays), ...extra };
}

describe("trialState", () => {
  it("is 'trialing' with the days left while the trial has more than the ending-soon window", () => {
    const state = trialState(trialing(20), NOW);
    expect(state.phase).toBe("trialing");
    expect(state.daysLeft).toBe(20);
    expect(state.daysSinceEnd).toBe(0);
    expect(state.endsAt).toBe(iso(20));
  });

  it("is 'ending_soon' inside the last three days, inclusive", () => {
    expect(trialState(trialing(TRIAL_ENDING_SOON_DAYS), NOW).phase).toBe("ending_soon");
    expect(trialState(trialing(1), NOW).phase).toBe("ending_soon");
    expect(trialState(trialing(TRIAL_ENDING_SOON_DAYS + 1), NOW).phase).toBe("trialing");
  });

  it("rounds a partial day up so '1 day left' never reads as zero", () => {
    // 6 hours to go
    const state = trialState({ status: "trialing", trialEndsAt: new Date(NOW.getTime() + 6 * 3_600_000).toISOString() }, NOW);
    expect(state.phase).toBe("ending_soon");
    expect(state.daysLeft).toBe(1);
  });

  it("is 'expired' once the end date is behind `now`, with days since", () => {
    const state = trialState(trialing(-4), NOW);
    expect(state.phase).toBe("expired");
    expect(state.daysLeft).toBe(0);
    expect(state.daysSinceEnd).toBe(4);
  });

  it("reports an expiry a few hours old as 0 days since (today)", () => {
    const state = trialState({ status: "trialing", trialEndsAt: new Date(NOW.getTime() - 3 * 3_600_000).toISOString() }, NOW);
    expect(state.phase).toBe("expired");
    expect(state.daysSinceEnd).toBe(0);
  });

  it("is 'paid' for active and past_due regardless of any stale end date", () => {
    expect(trialState({ status: "active", trialEndsAt: iso(-100) }, NOW).phase).toBe("paid");
    expect(trialState({ status: "past_due", trialEndsAt: iso(-100) }, NOW).phase).toBe("paid");
  });

  it("is 'none' for free, canceled, and paused", () => {
    for (const status of ["free", "canceled", "paused"] as const) {
      expect(trialState({ status, trialEndsAt: iso(-1) }, NOW).phase).toBe("none");
    }
  });

  it("treats a trialing row with no usable end date as freshly started, never expired", () => {
    expect(trialState({ status: "trialing" }, NOW)).toEqual({
      phase: "trialing",
      daysLeft: TRIAL_DAYS,
      daysSinceEnd: 0,
      endsAt: null,
    });
    expect(trialState({ status: "trialing", trialEndsAt: "not a date" }, NOW).phase).toBe("trialing");
  });
});

describe("isTrialExpired / trialLocked / trialUnlocks", () => {
  it("expired means: status trialing AND end date in the past", () => {
    expect(isTrialExpired(trialing(-1), NOW)).toBe(true);
    expect(isTrialExpired(trialing(1), NOW)).toBe(false);
    expect(isTrialExpired({ status: "free", trialEndsAt: iso(-1) }, NOW)).toBe(false);
    expect(isTrialExpired({ status: "active", trialEndsAt: iso(-1) }, NOW)).toBe(false);
  });

  it("locks only an expired trial with nothing paid behind it", () => {
    expect(trialLocked(trialing(-1), NOW)).toBe(true);
    expect(trialLocked(trialing(5), NOW)).toBe(false);
    expect(trialLocked({ status: "active", trialEndsAt: iso(-1) }, NOW)).toBe(false);
    expect(trialLocked({ status: "past_due", trialEndsAt: iso(-1) }, NOW)).toBe(false);
    expect(trialLocked({ status: "free" }, NOW)).toBe(false);
  });

  it("unlocks trial features only while the trial is live", () => {
    expect(trialUnlocks(trialing(10), NOW)).toBe(true);
    expect(trialUnlocks(trialing(-1), NOW)).toBe(false);
    expect(trialUnlocks({ status: "active" }, NOW)).toBe(false);
  });

  it("defaults `now` to the real clock", () => {
    // A trial that ended in 2020 is expired on any real clock.
    expect(isTrialExpired({ status: "trialing", trialEndsAt: "2020-01-01T00:00:00.000Z" })).toBe(true);
    // One that ends in 2099 is not.
    expect(isTrialExpired({ status: "trialing", trialEndsAt: "2099-01-01T00:00:00.000Z" })).toBe(false);
  });
});

describe("entitledPlan / subscriptionHasFeature — the read-time enforcement", () => {
  it("keeps every trial feature unlocked on a live trial", () => {
    for (const feature of TRIAL_FEATURES) {
      expect(subscriptionHasFeature(trialing(10), feature, NOW)).toBe(true);
    }
    expect(entitledPlan(trialing(10), NOW)).toBe("growth");
  });

  it("drops an expired trial to Free even though the row still says Growth", () => {
    // The bug this guards: sign-ups store tier "growth", so a plain
    // hasFeature(tier, ..., false) would still have unlocked everything.
    const expired = trialing(-1);
    expect(hasFeature(expired.tier, "rank_grid", false)).toBe(true); // the raw catalog answer
    expect(subscriptionHasFeature(expired, "rank_grid", NOW)).toBe(false); // the enforced answer
    expect(subscriptionHasFeature(expired, "ai_visibility", NOW)).toBe(false);
    expect(subscriptionHasFeature(expired, "campaigns_pro", NOW)).toBe(false);
    expect(subscriptionHasFeature(expired, "ai_drafts", NOW)).toBe(true); // Free keeps this one
    expect(entitledPlan(expired, NOW)).toBe("free");
  });

  it("leaves paying customers alone", () => {
    const paid = { status: "active" as const, tier: "multi" as const, trialEndsAt: iso(-40) };
    expect(entitledPlan(paid, NOW)).toBe("multi");
    expect(subscriptionHasFeature(paid, "multi_location", NOW)).toBe(true);
  });

  it("still never lowers a higher paid tier that Stripe reports as trialing", () => {
    expect(entitledPlan({ status: "trialing", tier: "agency", trialEndsAt: iso(10) }, NOW)).toBe("agency");
  });

  it("coerces a retired stored tier instead of throwing", () => {
    expect(entitledPlan({ status: "active", tier: "pro" as never }, NOW)).toBe("growth");
  });
});

describe("route lock", () => {
  it("keeps billing, every settings page, customers, and the explainer reachable", () => {
    for (const path of [
      "/app/trial-ending",
      "/app/settings/billing",
      "/app/settings",
      "/app/settings/business",
      "/app/settings/team/invite",
      "/app/customers",
      "/app/customers/cus_1",
    ]) {
      expect(trialLockAllowsPath(path), path).toBe(true);
    }
  });

  it("locks everything else under /app", () => {
    for (const path of ["/app", "/app/reviews", "/app/rank-grid", "/app/customers-export", "/app/settingsx"]) {
      expect(trialLockAllowsPath(path), path).toBe(false);
    }
  });

  it("lists exactly the three allowed prefixes", () => {
    expect([...TRIAL_LOCK_ALLOWED_PREFIXES].sort()).toEqual(
      ["/app/customers", "/app/settings", "/app/trial-ending"].sort(),
    );
  });

  it("locks the owner of an expired trial, and nobody else", () => {
    const expired = trialing(-2);
    const owner = { role: "owner" as const, acting: false, isDemo: false };
    expect(shouldTrialLock(owner, expired, NOW)).toBe(true);
    expect(shouldTrialLock(owner, trialing(2), NOW)).toBe(false);
    // Acting agency / platform admins keep working inside the client.
    expect(shouldTrialLock({ role: "agency_admin", acting: true, isDemo: false }, expired, NOW)).toBe(false);
    expect(shouldTrialLock({ role: "platform_admin", acting: true, isDemo: false }, expired, NOW)).toBe(false);
    // The demo never locks.
    expect(shouldTrialLock({ ...owner, isDemo: true }, expired, NOW)).toBe(false);
    // Managers and staff aren't the ones who can pay; the feature gates still bite.
    expect(shouldTrialLock({ ...owner, role: "manager" }, expired, NOW)).toBe(false);
    // Agency-tier workspaces are never trial-locked.
    expect(shouldTrialLock(owner, { ...expired, tier: "agency" }, NOW)).toBe(false);
  });
});
