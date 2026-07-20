import { describe, expect, it } from "vitest";
import { buildDashboardModel } from "@/lib/data/dashboard";
import { emptyFoundlyData } from "@/lib/data/empty";
import { sinceJoined } from "@/lib/data/selectors";
import type { MetricSnapshot } from "@/lib/data/types";

function workspace() {
  return emptyFoundlyData({
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
}

function metric(date: string, foundYou: number, contactedYou: number, newReviews: number): MetricSnapshot {
  return {
    locationId: "loc_test",
    date,
    window: "rolling_30d",
    sources: {
      foundYou: "gbp_performance",
      contactedYou: "gbp_performance",
      newReviews: "gbp_reviews",
      scores: "google_places",
    },
    foundYou,
    contactedYou,
    newReviews,
    growthScore: 72,
    reviewsScore: 74,
    profileScore: 69,
  };
}

describe("dashboard metric contract", () => {
  it("does not render missing integrations as truthful zeros", () => {
    const model = buildDashboardModel(workspace(), new Date("2026-07-17T00:00:00Z"));
    expect(model.score.value).toBeNull();
    expect(model.foundYou.value).toBeNull();
    expect(model.contactedYou.value).toBeNull();
    expect(model.newReviews.value).toBeNull();
    expect(model.foundYou.status).toBe("needs_google");
  });

  it("can expose a public-listing score while performance remains unavailable", () => {
    const data = workspace();
    data.location.googlePlaceId = "ChIJtest";
    data.metrics = [
      {
        ...metric("2026-07-17", 0, 0, 0),
        sources: { scores: "google_places" },
      },
    ];
    const model = buildDashboardModel(data, new Date("2026-07-17T00:00:00Z"));
    expect(model.score.value).toBe(72);
    expect(model.score.source).toBe("Google public listing");
    expect(model.foundYou.value).toBeNull();
    expect(model.foundYou.status).toBe("needs_google");
  });

  it("compares rolling windows without summing or averaging overlapping points", () => {
    const result = sinceJoined([
      metric("2026-06-17", 1_000, 80, 5),
      metric("2026-07-01", 1_400, 90, 7),
      metric("2026-07-17", 1_500, 100, 10),
    ]);
    expect(result.foundYou).toEqual({ now: 1_500, delta: 50 });
    expect(result.contactedYou).toEqual({ now: 100, delta: 25 });
    expect(result.newReviews).toEqual({ now: 10, delta: 100 });
  });

  it("reports source and freshness independently for each signal", () => {
    const data = workspace();
    data.location.googlePlaceId = "ChIJtest";
    data.metrics = [metric("2026-07-17", 1_500, 100, 10)];
    data.integrations = data.integrations.map((item) =>
      item.provider === "google"
        ? { ...item, status: "connected", lastSyncAt: "2026-07-10T00:00:00Z" }
        : item,
    );
    const model = buildDashboardModel(data, new Date("2026-07-17T00:00:00Z"));
    expect(model.foundYou.status).toBe("stale");
    expect(model.foundYou.source).toBe("Google Business Profile performance");
    expect(model.newReviews.source).toBe("Google Business Profile reviews");
  });
});
