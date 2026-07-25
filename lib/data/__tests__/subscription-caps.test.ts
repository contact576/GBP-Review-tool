import { describe, it, expect } from "vitest";
import { memoryProvider, DEMO_WORKSPACE_ID } from "@/lib/data/memory-provider";
import { PLANS } from "@/lib/billing/plans";

/**
 * Regression: a Stripe tier change must remap entitlement caps to the new plan.
 *
 * The billing webhook once persisted only the tier/status patch via
 * `setSubscription`, leaving `usage.aiDraftsLimit` / `smsCreditsTotal` at the
 * old plan's values — so a workspace downgraded to free kept its paid AI/SMS
 * allotment, and an upgrade stayed capped at the lower tier. `setSubscription`
 * now recomputes those caps from `PLANS` whenever the tier actually changes,
 * while leaving the used counters untouched.
 *
 * The seeded demo workspace starts on "growth" (aiDrafts unlimited, 250 SMS).
 */
describe("subscription cap remap on tier change", () => {
  it("drops paid AI/SMS caps when downgraded (cancel → free)", async () => {
    await memoryProvider.setSubscription(DEMO_WORKSPACE_ID, { tier: "free", status: "canceled" });
    const data = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    expect(data?.subscription.tier).toBe("free");
    expect(data?.subscription.usage.aiDraftsLimit).toBe(PLANS.free.limits.aiDraftsPerMonth); // 5
    expect(data?.subscription.usage.smsCreditsTotal).toBe(PLANS.free.limits.smsCredits); // 0
  });

  it("raises caps when upgraded to a higher tier", async () => {
    await memoryProvider.setSubscription(DEMO_WORKSPACE_ID, { tier: "pro", status: "active" });
    const data = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    expect(data?.subscription.tier).toBe("pro");
    expect(data?.subscription.usage.aiDraftsLimit).toBe(PLANS.pro.limits.aiDraftsPerMonth); // -1
    expect(data?.subscription.usage.smsCreditsTotal).toBe(PLANS.pro.limits.smsCredits); // 500
  });

  it("preserves used counters across a tier change", async () => {
    const before = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    const usedBefore = before!.subscription.usage.smsCreditsUsed;
    await memoryProvider.setSubscription(DEMO_WORKSPACE_ID, { tier: "starter", status: "active" });
    const after = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    expect(after?.subscription.usage.smsCreditsUsed).toBe(usedBefore);
    expect(after?.subscription.usage.smsCreditsTotal).toBe(PLANS.starter.limits.smsCredits); // 100
  });
});
