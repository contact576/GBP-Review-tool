import { describe, expect, it } from "vitest";
import { clientStatus, growthTrend, rollupAgencyBook, rollupAgencyClient } from "@/lib/agency/rollup";
import type { AgencyClient, AgencyClientLive } from "@/lib/data/types";

const now = new Date("2026-09-03T12:00:00Z");

const stored: AgencyClient = {
  locationId: "loc_town",
  name: "Old name in the book",
  city: "Nowhere",
  contactEmail: "owner@townhill.ca",
  growthScore: 0,
  rating: 0,
  newReviews30d: 0,
  needsReply: 0,
  plan: "agency",
  lastReportSent: "2026-08-01T00:00:00Z",
  status: "attention",
};

function live(over: Partial<AgencyClientLive> = {}): AgencyClientLive {
  return {
    workspaceId: "ws_town",
    locationId: "loc_town",
    name: "Townhill Constructions",
    city: "Brampton",
    rating: 4.9,
    reviewCount: 80,
    tier: "agency",
    googleLinked: true,
    gbpConnected: false,
    ownerEmail: "owner@townhill.ca",
    ownerHasLogin: false,
    metrics: [
      { date: "2026-08-01", growthScore: 60, sources: { scores: "google_places" } },
      { date: "2026-08-15", growthScore: 66, sources: { scores: "google_places" } },
      { date: "2026-09-01", growthScore: 74, sources: { scores: "google_places" } },
    ],
    reviews: [
      { publishedAt: "2026-08-30T00:00:00Z", needsReply: true },
      { publishedAt: "2026-08-20T00:00:00Z", needsReply: false },
      { publishedAt: "2026-06-01T00:00:00Z", needsReply: true },
    ],
    ...over,
  };
}

describe("clientStatus", () => {
  it("bands by score first, then by reply backlog", () => {
    expect(clientStatus(80, 0)).toBe("healthy");
    expect(clientStatus(65, 0)).toBe("attention");
    expect(clientStatus(80, 4)).toBe("attention");
    expect(clientStatus(40, 0)).toBe("at_risk");
    expect(clientStatus(90, 8)).toBe("at_risk");
  });
});

describe("growthTrend", () => {
  it("keeps only Google-sourced scores, oldest first, capped at six", () => {
    const metrics: AgencyClientLive["metrics"] = [
      { date: "2026-09-01", growthScore: 70, sources: { scores: "google_places" } },
      { date: "2026-08-01", growthScore: 10 }, // untrusted: no score source
      { date: "2026-07-01", growthScore: 50, sources: { scores: "gbp_reviews" } },
      ...Array.from({ length: 8 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        growthScore: i,
        sources: { scores: "google_places" as const },
      })),
    ];
    const trend = growthTrend(metrics);
    expect(trend).toHaveLength(6);
    expect(trend[trend.length - 1]).toBe(70);
    expect(trend).not.toContain(10);
  });

  it("is empty when nothing was ever measured — no invented curve", () => {
    expect(growthTrend([{ date: "2026-09-01", growthScore: 55 }])).toEqual([]);
  });
});

describe("rollupAgencyClient", () => {
  it("replaces every stored figure with what the client's workspace says now", () => {
    const client = rollupAgencyClient(stored, live(), now);
    expect(client.name).toBe("Townhill Constructions");
    expect(client.city).toBe("Brampton");
    expect(client.workspaceId).toBe("ws_town");
    expect(client.growthScore).toBe(74);
    expect(client.trend).toEqual([60, 66, 74]);
    expect(client.rating).toBe(4.9);
    expect(client.reviewCount).toBe(80);
    expect(client.newReviews30d).toBe(2);
    expect(client.needsReply).toBe(2);
    expect(client.status).toBe("healthy");
    expect(client.googleLinked).toBe(true);
    expect(client.ownerHasLogin).toBe(false);
    // What the agency entered survives.
    expect(client.contactEmail).toBe("owner@townhill.ca");
    expect(client.lastReportSent).toBe("2026-08-01T00:00:00Z");
  });

  it("scores an un-synced client as 0 with an empty trend rather than a guess", () => {
    const client = rollupAgencyClient(stored, live({ metrics: [], reviews: [] }), now);
    expect(client.growthScore).toBe(0);
    expect(client.trend).toEqual([]);
    expect(client.status).toBe("at_risk");
  });
});

describe("rollupAgencyBook", () => {
  it("keeps a book entry whose workspace cannot be read, so it can still be removed", () => {
    const orphan: AgencyClient = { ...stored, locationId: "loc_gone", name: "Gone Ltd" };
    const book = rollupAgencyBook([stored, orphan], new Map([["loc_town", live()]]), now);
    expect(book[0]?.name).toBe("Townhill Constructions");
    expect(book[1]).toEqual(orphan);
  });
});
