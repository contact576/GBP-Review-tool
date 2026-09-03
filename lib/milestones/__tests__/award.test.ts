import { describe, it, expect } from "vitest";
import {
  milestonesEarned,
  velocityWindows,
  RATING_MILESTONE_MIN_REVIEWS,
  VELOCITY_MIN_RECENT,
} from "@/lib/milestones/award";
import type { Milestone } from "@/lib/data/types";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const LOC = "loc_test";

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

/** `count` reviews spread across the window `[from, to)` days ago. */
function reviews(count: number, from: number, to: number) {
  const span = Math.max(1, from - to);
  return Array.from({ length: count }, (_, i) => ({
    publishedAt: daysAgo(to + ((i * span) / Math.max(1, count)) + 0.5),
  }));
}

function evidence(over: Partial<Parameters<typeof milestonesEarned>[0]> = {}) {
  return {
    locationId: LOC,
    reviewCount: 0,
    rating: 0,
    reviews: [] as Array<{ publishedAt: string }>,
    existing: [] as Array<Pick<Milestone, "kind">>,
    now: NOW,
    ...over,
  };
}

describe("milestonesEarned — review count tiers", () => {
  it("awards nothing for a workspace with no measured Google data", () => {
    expect(milestonesEarned(evidence())).toEqual([]);
  });

  it("awards a tier only once the measured count reaches it", () => {
    expect(milestonesEarned(evidence({ reviewCount: 24 }))).toEqual([]);
    const at25 = milestonesEarned(evidence({ reviewCount: 25 }));
    expect(at25.map((m) => m.kind)).toEqual(["reviews_25"]);
  });

  it("awards every tier already passed when milestones start from nothing", () => {
    const earned = milestonesEarned(evidence({ reviewCount: 130 }));
    expect(earned.map((m) => m.kind)).toEqual(["reviews_25", "reviews_50", "reviews_100"]);
  });

  it("never re-awards a kind that is already recorded", () => {
    const earned = milestonesEarned(
      evidence({ reviewCount: 130, existing: [{ kind: "reviews_25" }, { kind: "reviews_50" }] }),
    );
    expect(earned.map((m) => m.kind)).toEqual(["reviews_100"]);
  });

  it("uses a deterministic id so a repeated award pass cannot duplicate a win", () => {
    const a = milestonesEarned(evidence({ reviewCount: 25 }))[0]!;
    const b = milestonesEarned(evidence({ reviewCount: 25 }))[0]!;
    expect(a.id).toBe(b.id);
  });

  it("marks a fresh milestone unshared and stamps the evaluation time", () => {
    const m = milestonesEarned(evidence({ reviewCount: 25 }))[0]!;
    expect(m.shared).toBe(false);
    expect(m.achievedAt).toBe(NOW.toISOString());
    expect(m.locationId).toBe(LOC);
  });
});

describe("milestonesEarned — rating tier", () => {
  it("awards 4.8 only when enough reviews stand behind the average", () => {
    const thin = milestonesEarned(evidence({ rating: 5, reviewCount: RATING_MILESTONE_MIN_REVIEWS - 1 }));
    expect(thin.map((m) => m.kind)).not.toContain("rating_4_8");

    const solid = milestonesEarned(evidence({ rating: 4.8, reviewCount: RATING_MILESTONE_MIN_REVIEWS }));
    expect(solid.map((m) => m.kind)).toContain("rating_4_8");
  });

  it("does not award a rating below the tier", () => {
    const earned = milestonesEarned(evidence({ rating: 4.79, reviewCount: 90 }));
    expect(earned.map((m) => m.kind)).not.toContain("rating_4_8");
  });

  it("states the measured basis in the subtitle", () => {
    const m = milestonesEarned(evidence({ rating: 4.9, reviewCount: 63 })).find(
      (x) => x.kind === "rating_4_8",
    )!;
    expect(m.subtitle).toBe("4.9★ across 63 Google reviews");
  });
});

describe("velocityWindows", () => {
  it("declines to compare when the history does not reach past the baseline window", () => {
    // Everything imported inside the last 30 days: the earlier window is unknown,
    // not zero.
    expect(velocityWindows(reviews(9, 25, 1), NOW)).toBeNull();
  });

  it("counts each window when the history covers both", () => {
    const history = [...reviews(8, 29, 1), ...reviews(3, 59, 31), { publishedAt: daysAgo(400) }];
    const windows = velocityWindows(history, NOW);
    expect(windows).toEqual({ recent: 8, baseline: 3 });
  });

  it("ignores rows with an unusable published date", () => {
    const history = [{ publishedAt: "not-a-date" }, { publishedAt: daysAgo(400) }, ...reviews(5, 20, 1)];
    expect(velocityWindows(history, NOW)).toEqual({ recent: 5, baseline: 0 });
  });
});

describe("milestonesEarned — velocity", () => {
  const deepHistory = { publishedAt: daysAgo(400) };

  it("awards a genuine doubling", () => {
    const history = [deepHistory, ...reviews(10, 29, 1), ...reviews(4, 59, 31)];
    const earned = milestonesEarned(evidence({ reviews: history }));
    expect(earned.map((m) => m.kind)).toContain("velocity_2x");
  });

  it("does not award when the recent window is too small to be signal", () => {
    const history = [deepHistory, ...reviews(VELOCITY_MIN_RECENT - 1, 29, 1)];
    const earned = milestonesEarned(evidence({ reviews: history }));
    expect(earned.map((m) => m.kind)).not.toContain("velocity_2x");
  });

  it("does not award a doubling off a baseline of one review", () => {
    const history = [deepHistory, ...reviews(9, 29, 1), ...reviews(1, 59, 31)];
    const earned = milestonesEarned(evidence({ reviews: history }));
    expect(earned.map((m) => m.kind)).not.toContain("velocity_2x");
  });

  it("does not award when the import cannot see the earlier window", () => {
    // Strong recent numbers, but no review older than 60 days: unknowable.
    const history = reviews(12, 29, 1);
    const earned = milestonesEarned(evidence({ reviews: history }));
    expect(earned.map((m) => m.kind)).not.toContain("velocity_2x");
  });

  it("reports both measured windows in the subtitle", () => {
    const history = [deepHistory, ...reviews(10, 29, 1), ...reviews(4, 59, 31)];
    const m = milestonesEarned(evidence({ reviews: history })).find((x) => x.kind === "velocity_2x")!;
    expect(m.subtitle).toBe("10 new reviews in the last 30 days, up from 4 in the 30 before");
  });
});

describe("milestonesEarned — never invented", () => {
  it("never awards a capture streak, which no code path measures", () => {
    const history = [{ publishedAt: daysAgo(400) }, ...reviews(20, 29, 1), ...reviews(2, 59, 31)];
    const earned = milestonesEarned(evidence({ reviewCount: 200, rating: 5, reviews: history }));
    expect(earned.map((m) => m.kind)).not.toContain("streak_10");
  });

  it("awards nothing when the evaluation time is not a real date", () => {
    expect(milestonesEarned(evidence({ reviewCount: 500, now: new Date("nope") }))).toEqual([]);
  });
});
