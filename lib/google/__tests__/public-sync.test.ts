import { describe, it, expect } from "vitest";
import {
  buildGooglePublicUpdate,
  upsertSnapshot,
  isPublicSampleReview,
  isGbpReview,
  isImportedGoogleReview,
  friendlyPlacesError,
} from "@/lib/google/public-sync";
import type { PlaceDetails } from "@/lib/google/places";
import type { Location, MetricSnapshot } from "@/lib/data/types";

const location: Location = {
  id: "loc_test",
  workspaceId: "ws_test",
  name: "Test Biz",
  category: "Cafe",
  vertical: "restaurant",
  address: "1 Main St",
  city: "Toronto",
  region: "CA",
  timezone: "America/Toronto",
  reviewUrl: "",
  rating: 0,
  reviewCount: 0,
  joinedAt: "2026-01-01T00:00:00.000Z",
  gbpConnected: false,
  profile: {
    description: "",
    primaryCategory: "Cafe",
    secondaryCategories: [],
    photoCount: 0,
    postCount: 0,
    qnaCount: 0,
    hoursSet: false,
    holidayHoursSet: false,
    servicesWithDescriptions: 0,
    servicesTotal: 0,
    responseRate: 0,
    completeness: 10,
  },
};

const details: PlaceDetails = {
  placeId: "ChIJtest",
  name: "Test Biz",
  address: "1 Main St, Toronto",
  rating: 4.6,
  reviewCount: 128,
  category: "Cafe",
  reviews: [
    { author: "Sam", rating: 5, text: "Great coffee", relativeTime: "2 weeks ago", publishedAt: "2026-07-01T00:00:00.000Z" },
    { author: "Jo", rating: 4, text: "Solid spot", relativeTime: "a month ago", publishedAt: "2026-06-15T00:00:00.000Z" },
    { author: "Blank", rating: 5, text: "   ", relativeTime: "today" }, // empty text → filtered
  ],
};

describe("buildGooglePublicUpdate", () => {
  const now = "2026-07-15T00:00:00.000Z";
  const update = buildGooglePublicUpdate(details, location, now);

  it("uses the REAL aggregate count and rating, not the sample size", () => {
    expect(update.reviewCount).toBe(128);
    expect(update.rating).toBe(4.6);
    // 3 reviews in, one blank → 2 stored samples (never inflates the total)
    expect(update.reviews.length).toBe(2);
  });

  it("tags every sample review and never marks it needs-reply", () => {
    for (const r of update.reviews) {
      expect(isPublicSampleReview(r.id)).toBe(true);
      expect(r.needsReply).toBe(false);
      expect(r.source).toBe("google");
    }
  });

  it("computes a real score with ZERO fabricated activity", () => {
    expect(update.snapshot.foundYou).toBe(0);
    expect(update.snapshot.contactedYou).toBe(0);
    expect(update.snapshot.newReviews).toBe(0);
    expect(update.snapshot.reviewsScore).toBeGreaterThan(0);
    expect(update.snapshot.growthScore).toBeGreaterThan(0);
    expect(update.snapshot.date).toBe("2026-07-15");
  });

  it("keeps a zero-review business honest (no score inflation)", () => {
    const empty = buildGooglePublicUpdate(
      { ...details, rating: 0, reviewCount: 0, reviews: [] },
      location,
      now,
    );
    expect(empty.reviewCount).toBe(0);
    expect(empty.reviews.length).toBe(0);
    expect(empty.snapshot.reviewsScore).toBeLessThan(40);
  });
});

describe("upsertSnapshot", () => {
  const day = (date: string, growth: number): MetricSnapshot => ({
    locationId: "loc",
    date,
    foundYou: 0,
    contactedYou: 0,
    newReviews: 0,
    growthScore: growth,
    reviewsScore: growth,
    profileScore: growth,
  });

  it("replaces the same-day snapshot instead of duplicating", () => {
    const out = upsertSnapshot([day("2026-07-15", 10)], day("2026-07-15", 55));
    expect(out.length).toBe(1);
    expect(out[0]?.growthScore).toBe(55);
  });

  it("appends a new day", () => {
    const out = upsertSnapshot([day("2026-07-14", 10)], day("2026-07-15", 20));
    expect(out.length).toBe(2);
  });
});

describe("review id conventions", () => {
  it("classifies public sample vs GBP vs native", () => {
    expect(isPublicSampleReview("rev_gpub_x")).toBe(true);
    expect(isPublicSampleReview("rev_gbp_x")).toBe(false);
    expect(isGbpReview("rev_gbp_x")).toBe(true);
    expect(isImportedGoogleReview("rev_gpub_x")).toBe(true);
    expect(isImportedGoogleReview("rev_gbp_x")).toBe(true);
    expect(isImportedGoogleReview("rev_native_x")).toBe(false);
  });
});

describe("friendlyPlacesError", () => {
  it("returns non-technical, distinct messages", () => {
    expect(friendlyPlacesError("no_key")).toMatch(/configured/i);
    expect(friendlyPlacesError("not_found")).toMatch(/couldn't find/i);
    expect(friendlyPlacesError("error")).toMatch(/try again/i);
  });
});
