import { describe, expect, it } from "vitest";
import { aggregatePlatform, workspaceMrr, type PlatformWorkspaceRow } from "@/lib/platform/aggregate";

const now = new Date("2026-09-03T12:00:00Z");

function ws(
  over: Partial<PlatformWorkspaceRow> & { workspaceId: string; organizationId: string },
): PlatformWorkspaceRow {
  return {
    organizationName: "Org",
    locationName: "Loc",
    vertical: "plumbing",
    region: "CA",
    tier: "growth",
    interval: "monthly",
    status: "active",
    ownerEmail: "o@realco.ca",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("workspaceMrr", () => {
  it("bills active and past-due subscriptions at the plan price", () => {
    expect(workspaceMrr("growth", "monthly", "active")).toBe(99);
    expect(workspaceMrr("growth", "annual", "past_due")).toBe(82);
    expect(workspaceMrr("agency", "monthly", "active")).toBe(299);
  });

  it("counts a trial, a pause, a cancel and the free plan as zero", () => {
    expect(workspaceMrr("growth", "monthly", "trialing")).toBe(0);
    expect(workspaceMrr("growth", "monthly", "paused")).toBe(0);
    expect(workspaceMrr("growth", "monthly", "canceled")).toBe(0);
    expect(workspaceMrr("free", "monthly", "active")).toBe(0);
  });
});

describe("aggregatePlatform", () => {
  it("rolls an organization's workspaces into one tenant with its highest plan and worst status", () => {
    const snapshot = aggregatePlatform({
      workspaces: [
        ws({ workspaceId: "ws_a", organizationId: "org_1", organizationName: "PPC Guru", tier: "agency", status: "active", createdAt: "2026-01-01T00:00:00Z" }),
        ws({ workspaceId: "ws_b", organizationId: "org_1", organizationName: "PPC Guru", tier: "agency", status: "past_due", createdAt: "2026-02-01T00:00:00Z" }),
        ws({ workspaceId: "ws_c", organizationId: "org_2", organizationName: "Solo Plumber", tier: "growth", status: "trialing" }),
      ],
      deliveryFailures: [],
      durability: [],
      reviewsLast7d: 4,
      now,
    });
    expect(snapshot.tenants).toHaveLength(2);
    const agency = snapshot.tenants.find((t) => t.id === "org_1")!;
    expect(agency.plan).toBe("agency");
    expect(agency.status).toBe("past_due");
    expect(agency.locations).toBe(2);
    expect(agency.mrr).toBe(598);
    expect(agency.primaryWorkspaceId).toBe("ws_a");
    const solo = snapshot.tenants.find((t) => t.id === "org_2")!;
    expect(solo.status).toBe("trialing");
    expect(solo.mrr).toBe(0);
    expect(snapshot.kpis).toMatchObject({ totalTenants: 2, activeLocations: 3, mrr: 598, weeklyDetectedReviews: 4 });
    expect(snapshot.kpis.trialConversion).toBeCloseTo(0.5);
    expect(snapshot.measuredAt).toBe(now.toISOString());
  });

  it("does not claim to measure fraud or retention", () => {
    const snapshot = aggregatePlatform({ workspaces: [], deliveryFailures: [], durability: [], reviewsLast7d: 0, now });
    expect(snapshot.coverage).toMatchObject({ fraud: false, retention: false, tenants: true });
    expect(snapshot.fraudFlags).toEqual([]);
  });

  it("turns grouped send failures into incidents named after the tenant, worst first", () => {
    const snapshot = aggregatePlatform({
      workspaces: [ws({ workspaceId: "ws_a", organizationId: "org_1", organizationName: "Maple Dental" })],
      deliveryFailures: [
        { workspaceId: "ws_a", channel: "sms", status: "failed", count: 22, latestAt: "2026-09-02T00:00:00Z" },
        { workspaceId: "ws_a", channel: "email", status: "suppressed", count: 3, latestAt: "2026-09-01T00:00:00Z" },
        { workspaceId: "ws_unknown", channel: "email", status: "failed", count: 9, latestAt: "2026-09-01T00:00:00Z" },
      ],
      durability: [],
      reviewsLast7d: 0,
      now,
    });
    expect(snapshot.deliveryIncidents.map((i) => [i.tenant, i.type, i.severity, i.count])).toEqual([
      ["Maple Dental", "Send failures", "high", 22],
      ["Maple Dental", "Suppressed sends", "low", 3],
    ]);
  });

  it("computes the filtered rate from vanished over posted, and skips tenants with nothing posted", () => {
    const snapshot = aggregatePlatform({
      workspaces: [
        ws({ workspaceId: "ws_a", organizationId: "org_1", organizationName: "A" }),
        ws({ workspaceId: "ws_b", organizationId: "org_2", organizationName: "B" }),
      ],
      deliveryFailures: [],
      durability: [
        { workspaceId: "ws_a", posted: 40, survived30d: 38, survived60d: 36, vanished: 4 },
        { workspaceId: "ws_b", posted: 0, survived30d: 0, survived60d: 0, vanished: 0 },
      ],
      reviewsLast7d: 0,
      now,
    });
    expect(snapshot.durability).toHaveLength(1);
    expect(snapshot.durability[0]).toMatchObject({ tenant: "A", filteredRate: 0.1 });
  });

  it("leaves automated test accounts out of every figure, and says how many", () => {
    const snapshot = aggregatePlatform({
      workspaces: [
        ws({ workspaceId: "ws_real", organizationId: "org_real", organizationName: "Real Co", ownerEmail: "owner@realco.ca" }),
        ws({ workspaceId: "ws_e2e", organizationId: "org_e2e", organizationName: "Redline Auto Works", ownerEmail: "e2e-auto-1@example.com" }),
        ws({ workspaceId: "ws_demo", organizationId: "org_demo", organizationName: "Demo", ownerEmail: "demo@foundly.local" }),
      ],
      deliveryFailures: [{ workspaceId: "ws_e2e", channel: "email", status: "failed", count: 30, latestAt: "2026-09-01T00:00:00Z" }],
      durability: [],
      reviewsLast7d: 0,
      now,
    });
    expect(snapshot.tenants.map((t) => t.name)).toEqual(["Real Co"]);
    expect(snapshot.kpis.activeLocations).toBe(1);
    expect(snapshot.deliveryIncidents).toEqual([]);
    expect(snapshot.testAccountsExcluded).toBe(2);
  });
});

describe("aggregatePlatform — fraud and retention coverage", () => {
  const rosterWs = ws({ workspaceId: "ws_a", organizationId: "org_1", organizationName: "Acme" });

  it("covers fraud only when the rows were fetched, and names the signals that ran", () => {
    const without = aggregatePlatform({ workspaces: [rosterWs], deliveryFailures: [], durability: [], reviewsLast7d: 0, now });
    expect(without.coverage?.fraud).toBe(false);
    expect(without.coverage?.fraudSignals).toBeUndefined();

    const withRows = aggregatePlatform({
      workspaces: [rosterWs],
      deliveryFailures: [],
      durability: [],
      reviewsLast7d: 0,
      now,
      fraud: {
        requests: [{ workspaceId: "ws_a", id: "r1", customerId: "cus_1", staffId: null, status: "posted_google", createdAt: now.toISOString(), isTest: false }],
        reviews: [],
        customers: [{ workspaceId: "ws_a", id: "cus_1", name: "Priya Sharma", email: null }],
        staff: [{ workspaceId: "ws_a", id: "stf_1", displayName: "Priya Sharma" }],
        users: [],
        triage: [],
      },
    });
    expect(withRows.coverage?.fraud).toBe(true);
    expect(withRows.coverage?.fraudSignals).toEqual({ velocity_anomaly: true, staff_self_review: true, same_device: false });
    expect(withRows.fraudFlags).toHaveLength(1);
    expect(withRows.fraudFlags[0]).toMatchObject({ tenant: "Acme", kind: "staff_self_review", severity: "high" });
  });

  it("reports retention as not covered until the history is old enough, then measures it", () => {
    const young = aggregatePlatform({ workspaces: [rosterWs], deliveryFailures: [], durability: [], reviewsLast7d: 0, now, history: [
      { id: "ph_x", day: "2026-09-01", capturedAt: "2026-09-01T06:00:00Z", tenants: [], kpis: { totalTenants: 0, activeLocations: 0, mrr: 0 } },
    ] });
    expect(young.coverage?.retention).toBe(false);
    expect(young.history).toMatchObject({ days: 1, requiredDays: 28 });
    expect(young.retention).toBeUndefined();

    const old = aggregatePlatform({ workspaces: [rosterWs], deliveryFailures: [], durability: [], reviewsLast7d: 0, now, history: [
      { id: "ph_y", day: "2026-08-01", capturedAt: "2026-08-01T06:00:00Z", tenants: [
        { id: "org_1", mrr: 99, status: "active", plan: "growth" },
        { id: "org_gone", mrr: 39, status: "active", plan: "starter" },
      ], kpis: { totalTenants: 2, activeLocations: 2, mrr: 138 } },
    ] });
    expect(old.coverage?.retention).toBe(true);
    expect(old.retention).toMatchObject({ priorPaying: 2, churned: 1, priorMrr: 138, retainedMrr: 99 });
    expect(old.kpis.logoChurn).toBeCloseTo(0.5);
    expect(old.kpis.nrr).toBeCloseTo(99 / 138);
  });
});
