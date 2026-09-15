import { describe, expect, it } from "vitest";
import {
  RETENTION_REQUIRED_DAYS,
  computeRetention,
  historyRecordFrom,
  historyStatus,
  pickPriorSnapshot,
} from "@/lib/platform/retention";
import type { PlatformHistoryRecord, PlatformSnapshot } from "@/lib/data/types";

const now = new Date("2026-09-03T12:00:00Z");
const DAY = 86_400_000;

function dayAgo(days: number): string {
  return new Date(now.getTime() - days * DAY).toISOString().slice(0, 10);
}

function record(daysAgo: number, tenants: PlatformHistoryRecord["tenants"]): PlatformHistoryRecord {
  const day = dayAgo(daysAgo);
  return {
    id: `ph_${day}`,
    day,
    capturedAt: `${day}T06:00:00.000Z`,
    tenants,
    kpis: { totalTenants: tenants.length, activeLocations: tenants.length, mrr: tenants.reduce((s, t) => s + t.mrr, 0) },
  };
}

describe("historyRecordFrom", () => {
  it("keeps only what retention needs and is keyed by the UTC day", () => {
    const snapshot = {
      tenants: [{ id: "org_1", name: "A", vertical: "x", plan: "growth", mrr: 99, locations: 1, status: "active", region: "CA" }],
      deliveryIncidents: [],
      fraudFlags: [],
      durability: [],
      kpis: { totalTenants: 1, activeLocations: 1, mrr: 99, trialConversion: 1, logoChurn: 0, nrr: 0, weeklyDetectedReviews: 3 },
    } as PlatformSnapshot;
    const rec = historyRecordFrom(snapshot, now);
    expect(rec.id).toBe("ph_2026-09-03");
    expect(rec.day).toBe("2026-09-03");
    expect(rec.tenants).toEqual([{ id: "org_1", mrr: 99, status: "active", plan: "growth" }]);
    expect(rec.kpis).toEqual({ totalTenants: 1, activeLocations: 1, mrr: 99 });
  });
});

describe("pickPriorSnapshot", () => {
  it("returns nothing until a snapshot is old enough", () => {
    const history = [record(RETENTION_REQUIRED_DAYS - 1, []), record(3, [])];
    expect(pickPriorSnapshot(history, now)).toBeNull();
    expect(historyStatus(history)).toMatchObject({ days: 2, requiredDays: RETENTION_REQUIRED_DAYS });
  });

  it("prefers the snapshot nearest to a month ago among those old enough", () => {
    const history = [record(60, []), record(33, []), record(29, []), record(1, [])];
    expect(pickPriorSnapshot(history, now)?.day).toBe(dayAgo(29));
  });
});

describe("computeRetention", () => {
  const then = [
    { id: "org_stay", mrr: 99, status: "active" as const, plan: "growth" as const },
    { id: "org_grow", mrr: 99, status: "active" as const, plan: "growth" as const },
    { id: "org_churn", mrr: 39, status: "past_due" as const, plan: "starter" as const },
    { id: "org_trial", mrr: 0, status: "trialing" as const, plan: "growth" as const },
  ];

  it("is not measured with short history and says how much exists", () => {
    const result = computeRetention({ current: [], history: [record(5, then)], now });
    expect(result.measured).toBe(false);
    expect(result.history.days).toBe(1);
    expect(result.retention).toBeUndefined();
  });

  it("measures churn and NRR against the paying cohort of a month ago", () => {
    const result = computeRetention({
      current: [
        { id: "org_stay", mrr: 99, status: "active" },
        { id: "org_grow", mrr: 299, status: "active" }, // expanded to Agency
        { id: "org_churn", mrr: 0, status: "free" }, // lapsed
        { id: "org_trial", mrr: 99, status: "active" }, // converted — not in the prior cohort
        { id: "org_new", mrr: 99, status: "active" },
      ],
      history: [record(31, then)],
      now,
    });
    expect(result.measured).toBe(true);
    expect(result.retention).toMatchObject({ priorPaying: 3, churned: 1, priorMrr: 237, retainedMrr: 398 });
    expect(result.logoChurn).toBeCloseTo(1 / 3);
    expect(result.nrr).toBeCloseTo(398 / 237);
  });

  it("treats a tenant that vanished entirely as churned", () => {
    const result = computeRetention({ current: [], history: [record(31, then)], now });
    expect(result.retention?.churned).toBe(3);
    expect(result.logoChurn).toBe(1);
    expect(result.nrr).toBe(0);
  });
});
