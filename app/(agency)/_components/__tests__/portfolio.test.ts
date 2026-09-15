import { describe, expect, it } from "vitest";
import type { AgencyClient } from "@/lib/data/types";
import {
  clientGrowth,
  clientLinked,
  isReportOverdue,
  portfolioReviewsByMonth,
  summarizePortfolio,
} from "../portfolio";

const now = new Date("2026-09-14T12:00:00Z");

function client(over: Partial<AgencyClient> & { locationId: string }): AgencyClient {
  return {
    name: "Client",
    city: "Toronto",
    growthScore: 0,
    rating: 0,
    newReviews30d: 0,
    needsReply: 0,
    plan: "agency",
    status: "attention",
    ...over,
  };
}

describe("clientLinked / clientGrowth", () => {
  it("trusts the live rollup when it answered, and a stored entry's own figures when it did not", () => {
    expect(clientLinked({ googleLinked: true, rating: 0 })).toBe(true);
    expect(clientLinked({ googleLinked: false, rating: 4.8 })).toBe(false);
    expect(clientLinked({ rating: 4.7 })).toBe(true);
    expect(clientLinked({ rating: 0 })).toBe(false);

    expect(clientGrowth({ growthScore: 74, trend: [60, 74] })).toBe(74);
    expect(clientGrowth({ growthScore: 0, trend: [] })).toBeNull();
    expect(clientGrowth({ growthScore: 78 })).toBe(78);
    expect(clientGrowth({ growthScore: 0 })).toBeNull();
  });
});

describe("summarizePortfolio", () => {
  it("sums what the clients report and weights the rating by review count", () => {
    const summary = summarizePortfolio(
      [
        client({ locationId: "a", googleLinked: true, rating: 5, reviewCount: 10, trend: [80], growthScore: 80, needsReply: 2, newReviews30d: 3, status: "healthy", ownerHasLogin: true, gbpConnected: true, lastReportSent: "2026-09-10T00:00:00Z" }),
        client({ locationId: "b", googleLinked: true, rating: 4, reviewCount: 30, trend: [], growthScore: 0, needsReply: 5, newReviews30d: 1, status: "attention", lastReportSent: "2026-08-01T00:00:00Z" }),
        client({ locationId: "c", googleLinked: false, rating: 0, reviewCount: 0, trend: [], status: "at_risk" }),
      ],
      now,
    );
    expect(summary).toMatchObject({
      clients: 3,
      linked: 2,
      connected: 1,
      withLogin: 1,
      totalReviews: 40,
      newReviews30d: 4,
      needsReply: 7,
      weightedRating: 4.3,
      avgGrowth: 80,
      measuredGrowth: 1,
      reportsOverdue: 2,
      healthy: 1,
      attention: 1,
      atRisk: 1,
    });
  });

  it("never invents a rating or a score when nothing is linked or measured", () => {
    const summary = summarizePortfolio([client({ locationId: "x", googleLinked: false, trend: [] })], now);
    expect(summary.weightedRating).toBeNull();
    expect(summary.avgGrowth).toBeNull();
  });

  it("treats a report older than fourteen days, or never sent, as overdue", () => {
    expect(isReportOverdue({ lastReportSent: undefined }, now)).toBe(true);
    expect(isReportOverdue({ lastReportSent: "2026-09-05T00:00:00Z" }, now)).toBe(false);
    expect(isReportOverdue({ lastReportSent: "2026-08-20T00:00:00Z" }, now)).toBe(true);
  });
});

describe("portfolioReviewsByMonth", () => {
  it("adds the clients' month buckets together in calendar order", () => {
    const months = portfolioReviewsByMonth([
      client({ locationId: "a", reviewsByMonth: [{ month: "2026-08", count: 2 }, { month: "2026-09", count: 1 }] }),
      client({ locationId: "b", reviewsByMonth: [{ month: "2026-08", count: 3 }, { month: "2026-09", count: 0 }] }),
      client({ locationId: "c" }),
    ]);
    expect(months).toEqual([
      { month: "2026-08", count: 5 },
      { month: "2026-09", count: 1 },
    ]);
  });
});
