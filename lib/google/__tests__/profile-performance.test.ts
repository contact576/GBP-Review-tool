import { describe, expect, it } from "vitest";
import { buildPerformanceSnapshots } from "@/lib/google/profile-sync";
import type { GbpDailyMetricValue } from "@/lib/google/gbp";

function days(start: string, count: number, value: number): GbpDailyMetricValue[] {
  const startAt = new Date(`${start}T00:00:00.000Z`).getTime();
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(startAt + index * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

describe("GBP performance snapshots", () => {
  it("builds complete rolling-30-day discovery and contact windows", () => {
    const snapshots = buildPerformanceSnapshots(
      "loc_1",
      {
        BUSINESS_IMPRESSIONS_MOBILE_SEARCH: days("2026-01-01", 32, 10),
        CALL_CLICKS: days("2026-01-01", 32, 1),
      },
      "2026-01-01",
      "2026-02-01",
    );

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]).toMatchObject({
      date: "2026-01-30",
      foundYou: 300,
      contactedYou: 30,
      sources: {
        foundYou: "gbp_performance",
        contactedYou: "gbp_performance",
      },
    });
    expect(snapshots.at(-1)?.date).toBe("2026-02-01");
  });
});
