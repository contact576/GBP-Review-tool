import { describe, expect, it } from "vitest";
import { buildRankGridInsights, displacement } from "../rank-insights";
import type { RankGridPoint, RankGridScan } from "@/lib/data/types";

const CENTER = { latitude: 43.6532, longitude: -79.3832 };

function result(
  name: string,
  position: number,
  extra: { rating?: number; reviewCount?: number; latitude?: number; longitude?: number } = {},
) {
  return { placeId: `place_${name}`, name, position, ...extra };
}

function point(
  row: number,
  col: number,
  rank: number | null,
  results: ReturnType<typeof result>[] = [],
  extra: Partial<RankGridPoint> = {},
): RankGridPoint {
  return {
    row,
    col,
    rank,
    latitude: CENTER.latitude + (1 - row) * 0.01,
    longitude: CENTER.longitude + (col - 1) * 0.01,
    results,
    ...extra,
  };
}

function scanOf(points: RankGridPoint[]): RankGridScan {
  return {
    id: "scan_1",
    locationId: "loc_1",
    keyword: "plumber toronto",
    gridSize: 3,
    avgRank: 5,
    shareOfLocalPack: 0.3,
    points,
    ranAt: "2026-09-01T00:00:00.000Z",
    radiusKm: 2,
    center: CENTER,
  } as RankGridScan;
}

describe("displacement", () => {
  it("reports zero distance at the centre", () => {
    expect(displacement(CENTER, CENTER).km).toBeCloseTo(0, 6);
  });

  it("names the compass direction of an offset point", () => {
    expect(displacement(CENTER, { ...CENTER, latitude: CENTER.latitude + 0.05 }).direction).toBe("N");
    expect(displacement(CENTER, { ...CENTER, latitude: CENTER.latitude - 0.05 }).direction).toBe("S");
    expect(displacement(CENTER, { ...CENTER, longitude: CENTER.longitude + 0.05 }).direction).toBe("E");
    expect(displacement(CENTER, { ...CENTER, longitude: CENTER.longitude - 0.05 }).direction).toBe("W");
  });

  it("measures roughly a kilometre per 0.009 degrees of latitude", () => {
    const north = displacement(CENTER, { ...CENTER, latitude: CENTER.latitude + 0.009 });
    expect(north.km).toBeGreaterThan(0.9);
    expect(north.km).toBeLessThan(1.1);
  });
});

describe("buildRankGridInsights", () => {
  const mine = (position: number) =>
    result("Our Plumbing", position, { rating: 4.5, reviewCount: 100 });
  const rival = (position: number) =>
    result("Rival Plumbing", position, {
      rating: 4.8,
      reviewCount: 900,
      latitude: CENTER.latitude + 0.005,
      longitude: CENTER.longitude,
    });

  it("counts coverage without letting unavailable points read as losses", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([
        point(0, 0, 1),
        point(0, 1, 2),
        point(1, 1, 12),
        point(2, 2, null),
        point(2, 0, null, [], { unavailable: true }),
      ]),
      businessName: "Our Plumbing",
    });
    expect(insights.checked).toBe(4);
    expect(insights.unavailable).toBe(1);
    expect(insights.top3).toBe(2);
    expect(insights.top10).toBe(2);
    // The null-rank point counts as absent; the unavailable one does not.
    expect(insights.absent).toBe(1);
  });

  it("excludes unavailable points from the average rank", () => {
    const withFailure = buildRankGridInsights({
      scan: scanOf([point(0, 0, 2), point(0, 1, 4), point(1, 1, null, [], { unavailable: true })]),
      businessName: "Our Plumbing",
    });
    expect(withFailure.averageRank).toBeCloseTo(3, 6);
  });

  it("reads our own rating and review count out of the scan itself", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([point(1, 1, 2, [rival(1), mine(2)])]),
      businessName: "Our Plumbing",
    });
    expect(insights.own).toEqual({ rating: 4.5, reviewCount: 100 });
  });

  it("counts a competitor as outranking us only where it actually placed higher", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([
        point(0, 0, 2, [rival(1), mine(2)]),
        point(0, 1, 1, [mine(1), rival(2)]),
        point(1, 1, 3, [rival(1), mine(3)]),
      ]),
      businessName: "Our Plumbing",
    });
    const rivalRow = insights.competitors.find((c) => c.name === "Rival Plumbing");
    expect(rivalRow?.outranks).toBe(2);
    expect(rivalRow?.appearances).toBe(3);
    expect(rivalRow?.bestPosition).toBe(1);
    expect(rivalRow?.outrankShare).toBeCloseTo(2 / 3, 6);
  });

  it("treats our absence from a point as being outranked there", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([point(0, 0, null, [rival(1)])]),
      businessName: "Our Plumbing",
    });
    expect(insights.competitors[0]?.outranks).toBe(1);
  });

  it("quantifies the review gap that explains the ranking", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([point(1, 1, 2, [rival(1), mine(2)])]),
      businessName: "Our Plumbing",
    });
    const rivalRow = insights.competitors[0];
    expect(rivalRow?.reviewGap).toBe(800);
    expect(rivalRow?.ratingGap).toBeCloseTo(0.3, 6);
  });

  it("leaves the review gap absent rather than zero when a count was not captured", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([point(1, 1, 2, [result("No Meta Plumbing", 1), mine(2)])]),
      businessName: "Our Plumbing",
    });
    const row = insights.competitors.find((c) => c.name === "No Meta Plumbing");
    expect(row?.reviewGap).toBeUndefined();
    expect(row?.ratingGap).toBeUndefined();
  });

  it("identifies the weakest and strongest compass directions", () => {
    // Strong to the north (rank 1), weak to the south (rank 18).
    const insights = buildRankGridInsights({
      scan: scanOf([point(0, 1, 1), point(1, 1, 5), point(2, 1, 18)]),
      businessName: "Our Plumbing",
    });
    expect(insights.strongest?.direction).toBe("N");
    expect(insights.weakest?.direction).toBe("S");
  });

  it("reports how far top-three visibility reaches", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([point(1, 1, 1), point(0, 1, 2), point(2, 1, 14)]),
      businessName: "Our Plumbing",
    });
    // The rank-2 point sits ~1.1 km north; the rank-14 point does not count.
    expect(insights.top3ReachKm).not.toBeNull();
    expect(insights.top3ReachKm!).toBeGreaterThan(1);
    expect(insights.top3ReachKm!).toBeLessThan(1.3);
  });

  it("returns a null reach when we never made the top three", () => {
    const insights = buildRankGridInsights({
      scan: scanOf([point(1, 1, 9), point(0, 1, 15)]),
      businessName: "Our Plumbing",
    });
    expect(insights.top3ReachKm).toBeNull();
  });

  it("matches our own listing by place id even when the name differs", () => {
    const renamed = { placeId: "place_own", name: "Trading As Something Else", position: 1 };
    const insights = buildRankGridInsights({
      scan: scanOf([point(1, 1, 1, [renamed, rival(2)])]),
      businessPlaceId: "place_own",
    });
    expect(insights.competitors.map((c) => c.name)).not.toContain("Trading As Something Else");
  });

  it("survives a legacy scan that stored no results or centre", () => {
    const legacy = {
      ...scanOf([{ row: 0, col: 0, rank: 3 }]),
      center: undefined,
    } as RankGridScan;
    const insights = buildRankGridInsights({ scan: legacy, businessName: "Our Plumbing" });
    expect(insights.competitors).toEqual([]);
    expect(insights.distanceBands).toEqual([]);
    expect(insights.checked).toBe(1);
  });
});
