import { describe, expect, it } from "vitest";
import type { GbpProfileSnapshot, Review } from "@/lib/data/types";
import { deriveGbpCapabilities } from "@/lib/google/profile-sync";
import { scoreApplicableCapabilities } from "@/lib/compliance/product-policy";

const synced: GbpProfileSnapshot["sourceStatus"] = {
  location: "synced",
  attributes: "synced",
  attributeMetadata: "synced",
  media: "synced",
  posts: "synced",
  questions: "synced",
  reviews: "synced",
  performance: "synced",
  searchKeywords: "synced",
  googleUpdates: "synced",
};

describe("dynamic Google profile capabilities", () => {
  it("excludes unsupported features and preserves the difference between missing and inaccessible", () => {
    const capabilities = deriveGbpCapabilities({
      location: {
        name: "locations/1",
        title: "Harbourview Physiotherapy",
        phoneNumbers: { primaryPhone: "+1 416 555 0100" },
        websiteUri: "https://example.com",
        storefrontAddress: { regionCode: "CA", locality: "Toronto", addressLines: ["1 Harbour St"] },
        categories: { primaryCategory: { name: "categories/gcid:physical_therapist", displayName: "Physical therapist" } },
        regularHours: { periods: [{ openDay: "MONDAY" }] },
        metadata: { canModifyServiceList: false },
        profile: { description: "Personalized physiotherapy and sports rehabilitation for Toronto patients who want a confident return to movement." },
      },
      attributes: [],
      availableAttributes: [],
      media: [],
      posts: [],
      questions: [],
      reviews: [],
      sourceStatus: { ...synced, media: "not_authorized" },
      nowIso: "2026-07-19T12:00:00.000Z",
    });

    expect(capabilities.find((item) => item.key === "services")?.status).toBe("not_applicable");
    expect(capabilities.find((item) => item.key === "media_library")?.status).toBe("unknown");
    expect(capabilities.find((item) => item.key === "questions")?.status).toBe("not_applicable");
    const score = scoreApplicableCapabilities(capabilities);
    expect(score.excludedCount).toBeGreaterThanOrEqual(3);
    expect(score.applicableCount).toBe(capabilities.length - score.excludedCount);
  });

  it("uses reply coverage and current Google media as evidence", () => {
    const reviews: Review[] = Array.from({ length: 10 }, (_, index) => ({
      id: `r${index}`,
      locationId: "loc",
      author: `Customer ${index}`,
      rating: 5,
      text: "Helpful care.",
      publishedAt: "2026-07-01T00:00:00.000Z",
      source: "google",
      durability: "stable",
      needsReply: index === 9,
    }));
    const capabilities = deriveGbpCapabilities({
      location: { name: "locations/1", metadata: { canModifyServiceList: true } },
      attributes: [],
      availableAttributes: [],
      media: [
        { name: "cover", category: "COVER", googleUrl: "https://google/cover" },
        { name: "logo", category: "LOGO", googleUrl: "https://google/logo" },
      ],
      posts: [],
      questions: [],
      reviews,
      sourceStatus: synced,
      nowIso: "2026-07-19T12:00:00.000Z",
    });

    expect(capabilities.find((item) => item.key === "cover_media")?.status).toBe("complete");
    expect(capabilities.find((item) => item.key === "profile_media")?.status).toBe("complete");
    expect(capabilities.find((item) => item.key === "review_replies")?.status).toBe("complete");
  });
});
