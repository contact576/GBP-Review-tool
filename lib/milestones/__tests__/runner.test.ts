import { describe, it, expect } from "vitest";
import { awardMilestones } from "@/lib/milestones/runner";
import { emptyFoundlyData } from "@/lib/data/empty";
import type { DataProvider } from "@/lib/data/provider";
import type { FoundlyData, Milestone, Notification, Review } from "@/lib/data/types";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function workspace(over: Partial<FoundlyData["location"]> = {}): FoundlyData {
  const data = emptyFoundlyData({
    workspaceId: "ws_test",
    organizationId: "org_test",
    userId: "usr_test",
    businessName: "Test Business",
    ownerName: "Alex Owner",
    email: "alex@example.com",
    industryKey: "cafe",
    category: "Cafe",
    region: "CA",
  });
  return { ...data, location: { ...data.location, ...over } };
}

/** Records what the award pass writes; nothing else is exercised. */
function recorder(over: Partial<DataProvider> = {}) {
  const milestones: Milestone[] = [];
  const notifications: Notification[] = [];
  const provider = {
    async appendMilestone(_ws: string, m: Milestone) {
      milestones.push(m);
    },
    async appendNotification(_ws: string, n: Notification) {
      notifications.push(n);
    },
    ...over,
  } as unknown as DataProvider;
  return { provider, milestones, notifications };
}

describe("awardMilestones", () => {
  it("records nothing for a workspace with no measured Google data", async () => {
    const { provider, milestones, notifications } = recorder();
    const earned = await awardMilestones({ provider, workspaceId: "ws_test", data: workspace(), now: NOW });
    expect(earned).toEqual([]);
    expect(milestones).toEqual([]);
    expect(notifications).toEqual([]);
  });

  it("records the milestone and one notification pointing at it", async () => {
    const { provider, milestones, notifications } = recorder();
    const data = workspace({ reviewCount: 52, rating: 4.5 });
    const earned = await awardMilestones({ provider, workspaceId: "ws_test", data, now: NOW });

    expect(earned.map((m) => m.kind)).toEqual(["reviews_25", "reviews_50"]);
    expect(milestones.map((m) => m.kind)).toEqual(["reviews_25", "reviews_50"]);
    expect(notifications.map((n) => n.kind)).toEqual(["milestone", "milestone"]);
    expect(notifications[0]!.locationId).toBe(data.location.id);
    expect(notifications[0]!.read).toBe(false);
    // Deterministic id keyed to the milestone, so a re-run cannot post it twice.
    expect(notifications[0]!.id).toBe(`ntf_${milestones[0]!.id}`);
  });

  it("leaves the seeded demo workspace alone", async () => {
    const { provider, milestones } = recorder();
    const data = workspace({ reviewCount: 400, rating: 5 });
    const demo = { ...data, workspace: { ...data.workspace, isDemo: true } };
    expect(await awardMilestones({ provider, workspaceId: "ws_demo", data: demo, now: NOW })).toEqual([]);
    expect(milestones).toEqual([]);
  });

  it("skips a milestone already recorded", async () => {
    const { provider, milestones } = recorder();
    const data = workspace({ reviewCount: 52 });
    const already: Milestone = {
      id: "ms_reviews_25",
      locationId: data.location.id,
      kind: "reviews_25",
      title: "25 reviews!",
      subtitle: "You crossed 25 Google reviews",
      achievedAt: "2026-01-01T00:00:00.000Z",
      shared: true,
    };
    await awardMilestones({
      provider,
      workspaceId: "ws_test",
      data: { ...data, milestones: [already] },
      now: NOW,
    });
    expect(milestones.map((m) => m.kind)).toEqual(["reviews_50"]);
  });

  it("never fails the sync that produced the numbers when a write throws", async () => {
    const { provider, notifications } = recorder({
      async appendMilestone() {
        throw new Error("db down");
      },
    });
    const data = workspace({ reviewCount: 30 });
    const earned = await awardMilestones({ provider, workspaceId: "ws_test", data, now: NOW });
    expect(earned).toEqual([]);
    // No milestone stored means no celebration announced either.
    expect(notifications).toEqual([]);
  });

  it("reads the review history for velocity from the workspace's own reviews", async () => {
    const { provider, milestones } = recorder();
    const base = workspace({ reviewCount: 12, rating: 4.2 });
    const review = (daysAgo: number, i: number): Review => ({
      id: `rev_${i}`,
      locationId: base.location.id,
      author: "A",
      rating: 5,
      text: "",
      publishedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
      source: "google",
      durability: "stable",
      needsReply: false,
    });
    const history = [
      review(400, 0),
      ...Array.from({ length: 8 }, (_, i) => review(10 + i, i + 1)),
      ...Array.from({ length: 3 }, (_, i) => review(40 + i, i + 20)),
    ];
    await awardMilestones({
      provider,
      workspaceId: "ws_test",
      data: { ...base, reviews: history },
      now: NOW,
    });
    expect(milestones.map((m) => m.kind)).toContain("velocity_2x");
  });
});
