import { describe, expect, it } from "vitest";
import type { DataProvider } from "@/lib/data/provider";
import type { MonitoringRun, Notification, ProfileSuggestion } from "@/lib/data/types";
import { buildSeed } from "@/lib/data/seed";
import { isMonitoringCronAuthorized } from "../cron-auth";
import {
  describeArrivalRatings,
  monitoringWindowKey,
  newReviewArrivals,
  replyBacklogSentence,
  runWorkspaceMonitoring,
} from "../runner";
import type { Review } from "@/lib/data/types";

describe("continuous monitoring safety", () => {
  it("uses stable UTC day windows and constant-time bearer authentication", () => {
    expect(monitoringWindowKey(new Date("2026-07-20T23:59:59.000Z"))).toBe("2026-07-20");
    const secret = "a-secure-cron-secret-that-is-long-enough";
    expect(isMonitoringCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isMonitoringCronAuthorized("Bearer wrong", secret)).toBe(false);
    expect(isMonitoringCronAuthorized(`Bearer ${secret}`, "short")).toBe(false);
  });

  it("runs one read-only sync per window and notifies only for a new suggestion", async () => {
    const data = buildSeed();
    data.workspace.isDemo = false;
    data.location.suggestionInbox = [];
    const runs = new Map<string, MonitoringRun>();
    const notifications: Notification[] = [];
    let syncCalls = 0;
    const suggestion: ProfileSuggestion = {
      id: "suggestion_new", workspaceId: data.workspace.id, locationId: data.location.id, auditId: "audit_1", findingId: "finding_1",
      target: "local_post", kind: "local_post", title: "New post", rationale: "Fresh evidence", priorityScore: 90, risk: "low",
      status: "needs_generation", exactPreviewReady: false, evidenceIds: ["e1"], blockers: ["Generate"], nextStep: "Generate",
      createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z",
    };
    const provider = {
      async getData() { return data; },
      async createMonitoringRun(_workspaceId: string, run: MonitoringRun) {
        const existing = runs.get(run.windowKey);
        if (existing) return { run: existing, created: false };
        runs.set(run.windowKey, run);
        return { run, created: true };
      },
      async updateMonitoringRun(_workspaceId: string, runId: string, patch: Partial<MonitoringRun>) {
        const run = [...runs.values()].find((item) => item.id === runId);
        if (!run) return null;
        Object.assign(run, patch);
        return run;
      },
      async syncGoogleProfile() {
        syncCalls += 1;
        data.location.suggestionInbox = [suggestion];
        return { ok: true, rating: 4.8, reviewCount: 31, auditFindings: 1, suggestionsCreated: 1, warnings: [] };
      },
      async appendAuditLog() {},
      async appendNotification(_workspaceId: string, notification: Notification) { notifications.push(notification); },
    } as unknown as DataProvider;

    const now = new Date("2026-07-20T12:00:00.000Z");
    const first = await runWorkspaceMonitoring({ provider, workspaceId: data.workspace.id, now, trigger: "scheduled" });
    const second = await runWorkspaceMonitoring({ provider, workspaceId: data.workspace.id, now, trigger: "scheduled" });
    expect(first).toMatchObject({ status: "completed", newSuggestions: 1 });
    expect(second).toMatchObject({ status: "duplicate", newSuggestions: 0 });
    expect(syncCalls).toBe(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toContain("new local growth suggestion");
  });
});

function review(id: string, rating: Review["rating"], needsReply = false): Review {
  return {
    id,
    locationId: "loc_1",
    author: "A",
    rating,
    text: "",
    publishedAt: "2026-07-19T00:00:00.000Z",
    source: "google",
    durability: "stable",
    needsReply,
  };
}

describe("new review arrivals", () => {
  it("treats a workspace with no prior history as a first import, not 60 new reviews", () => {
    const after = [review("r1", 5), review("r2", 4)];
    expect(newReviewArrivals([], after)).toEqual({ arrived: [], firstImport: true });
  });

  it("reports only reviews that were not in the prior import", () => {
    const before = [review("r1", 5)];
    const after = [review("r1", 5), review("r2", 4), review("r3", 3)];
    const arrivals = newReviewArrivals(before, after);
    expect(arrivals.firstImport).toBe(false);
    expect(arrivals.arrived.map((r) => r.id)).toEqual(["r2", "r3"]);
  });

  it("reports nothing when the same set comes back", () => {
    const before = [review("r1", 5), review("r2", 4)];
    expect(newReviewArrivals(before, [...before]).arrived).toEqual([]);
  });

  it("does not count a review disappearing as an arrival", () => {
    const before = [review("r1", 5), review("r2", 4)];
    expect(newReviewArrivals(before, [review("r1", 5)]).arrived).toEqual([]);
  });

  it("describes the measured rating mix, highest first", () => {
    const mix = [review("a", 5), review("b", 4), review("c", 5), review("d", 1)];
    expect(describeArrivalRatings(mix)).toBe("2× 5★, 1× 4★, 1× 1★");
  });

  it("describes an empty set as an empty string rather than inventing one", () => {
    expect(describeArrivalRatings([])).toBe("");
  });

  it("adds a reply-backlog sentence only when there is a backlog", () => {
    expect(replyBacklogSentence(3, 0)).toBe("");
    expect(replyBacklogSentence(1, 1)).toBe(" No reply yet.");
    expect(replyBacklogSentence(2, 2)).toBe(" None have a reply yet.");
    expect(replyBacklogSentence(4, 1)).toBe(" 1 of them has no reply yet.");
    expect(replyBacklogSentence(4, 2)).toBe(" 2 of them have no reply yet.");
  });
});

describe("monitoring notifies about reviews that arrived", () => {
  it("posts one notification naming the rating mix and how many need a reply", async () => {
    const data = buildSeed();
    data.workspace.isDemo = false;
    data.location.suggestionInbox = [];
    data.reviews = [review("r_existing", 5)];
    // Milestones are already recorded, so this run is only about arrivals.
    data.location.reviewCount = 1;
    data.location.rating = 4.2;
    const runs = new Map<string, MonitoringRun>();
    const notifications: Notification[] = [];
    const provider = {
      async getData() { return data; },
      async createMonitoringRun(_workspaceId: string, run: MonitoringRun) {
        const existing = runs.get(run.windowKey);
        if (existing) return { run: existing, created: false };
        runs.set(run.windowKey, run);
        return { run, created: true };
      },
      async updateMonitoringRun(_workspaceId: string, runId: string, patch: Partial<MonitoringRun>) {
        const run = [...runs.values()].find((item) => item.id === runId);
        if (!run) return null;
        Object.assign(run, patch);
        return run;
      },
      async syncGoogleProfile() {
        // A real provider returns fresh objects; assign rather than mutate.
        data.reviews = [...data.reviews, review("r_new_a", 5, true), review("r_new_b", 4)];
        return { ok: true, rating: 4.4, reviewCount: 3, warnings: [] };
      },
      async appendAuditLog() {},
      async appendMilestone() {},
      async appendNotification(_workspaceId: string, notification: Notification) { notifications.push(notification); },
    } as unknown as DataProvider;

    await runWorkspaceMonitoring({
      provider,
      workspaceId: data.workspace.id,
      now: new Date("2026-07-21T12:00:00.000Z"),
      trigger: "scheduled",
    });

    const arrival = notifications.find((n) => n.title.includes("new Google review"));
    expect(arrival).toBeDefined();
    expect(arrival!.title).toBe("2 new Google reviews");
    expect(arrival!.body).toBe("1× 5★, 1× 4★. 1 of them has no reply yet.");
    expect(arrival!.kind).toBe("review");
    expect(arrival!.read).toBe(false);
  });

  it("says nothing on the first import, when every review is new only to us", async () => {
    const data = buildSeed();
    data.workspace.isDemo = false;
    data.location.suggestionInbox = [];
    data.reviews = [];
    data.location.reviewCount = 0;
    data.location.rating = 0;
    const runs = new Map<string, MonitoringRun>();
    const notifications: Notification[] = [];
    const provider = {
      async getData() { return data; },
      async createMonitoringRun(_workspaceId: string, run: MonitoringRun) {
        runs.set(run.windowKey, run);
        return { run, created: true };
      },
      async updateMonitoringRun(_workspaceId: string, runId: string, patch: Partial<MonitoringRun>) {
        const run = [...runs.values()].find((item) => item.id === runId);
        if (!run) return null;
        Object.assign(run, patch);
        return run;
      },
      async syncGoogleProfile() {
        data.reviews = [review("r1", 5), review("r2", 5), review("r3", 4)];
        return { ok: true, rating: 4.7, reviewCount: 3, warnings: [] };
      },
      async appendAuditLog() {},
      async appendMilestone() {},
      async appendNotification(_workspaceId: string, notification: Notification) { notifications.push(notification); },
    } as unknown as DataProvider;

    await runWorkspaceMonitoring({
      provider,
      workspaceId: data.workspace.id,
      now: new Date("2026-07-22T12:00:00.000Z"),
      trigger: "scheduled",
    });

    expect(notifications.some((n) => n.title.includes("new Google review"))).toBe(false);
  });
});
