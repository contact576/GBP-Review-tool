import { afterEach, describe, it, expect, vi } from "vitest";
import {
  listMedia,
  listReviews,
  mapGbpStarRating,
  mapGbpReview,
  normalizeGbpLocation,
  patchLocation,
} from "@/lib/google/gbp";

afterEach(() => vi.restoreAllMocks());

describe("mapGbpStarRating", () => {
  it("maps Google's star enum to 1–5", () => {
    expect(mapGbpStarRating("ONE")).toBe(1);
    expect(mapGbpStarRating("TWO")).toBe(2);
    expect(mapGbpStarRating("THREE")).toBe(3);
    expect(mapGbpStarRating("FOUR")).toBe(4);
    expect(mapGbpStarRating("FIVE")).toBe(5);
  });

  it("defaults unknown/undefined to 5 (never crashes)", () => {
    expect(mapGbpStarRating(undefined)).toBe(5);
    expect(mapGbpStarRating("STAR_RATING_UNSPECIFIED")).toBe(5);
  });
});

describe("mapGbpReview", () => {
  it("maps a full review including the owner reply", () => {
    const r = mapGbpReview({
      reviewId: "abc",
      reviewer: { displayName: "Dana P." },
      starRating: "FOUR",
      comment: "Good but slow.",
      createTime: "2026-05-01T12:00:00Z",
      reviewReply: { comment: "Thanks Dana!" },
    });
    expect(r).toEqual({
      reviewId: "abc",
      author: "Dana P.",
      rating: 4,
      text: "Good but slow.",
      createTime: "2026-05-01T12:00:00Z",
      reply: "Thanks Dana!",
    });
  });

  it("tolerates missing fields", () => {
    const r = mapGbpReview({});
    expect(r.author).toBe("A Google user");
    expect(r.rating).toBe(5);
    expect(r.text).toBe("");
    expect(r.reply).toBeUndefined();
  });
});

describe("listReviews", () => {
  it("imports every Google review page and avoids duplicate ids", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reviews: [{ reviewId: "r1", reviewer: { displayName: "One" }, starRating: "FIVE" }],
            averageRating: 4.8,
            totalReviewCount: 2,
            nextPageToken: "page-two",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reviews: [
              { reviewId: "r1", reviewer: { displayName: "One" }, starRating: "FIVE" },
              { reviewId: "r2", reviewer: { displayName: "Two" }, starRating: "FOUR" },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await listReviews("access", "accounts/a/locations/l");
    expect(result).toEqual({
      ok: true,
      data: {
        reviews: [
          expect.objectContaining({ reviewId: "r1" }),
          expect.objectContaining({ reviewId: "r2" }),
        ],
        averageRating: 4.8,
        totalReviewCount: 2,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("pageToken=page-two");
  });
});

describe("owned profile normalization", () => {
  it("preserves structured and free-form services as auditable records", () => {
    const location = normalizeGbpLocation({
      name: "locations/1",
      serviceItems: [
        {
          structuredServiceItem: { serviceTypeId: "gcid:physiotherapy", description: "One-on-one care" },
          price: { currencyCode: "CAD", units: "120" },
        },
        {
          freeFormServiceItem: {
            category: "categories/gcid:physical_therapist",
            label: { displayName: "Sports rehab", description: "Return-to-sport program" },
          },
        },
      ],
    });

    expect(location.serviceItems).toEqual([
      expect.objectContaining({ source: "structured", serviceTypeId: "gcid:physiotherapy" }),
      expect.objectContaining({ source: "free_form", name: "Sports rehab" }),
    ]);
  });

  it("syncs the Google-hosted original URL and attribution instead of inventing media", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        mediaItems: [{
          name: "accounts/a/locations/l/media/m1",
          mediaFormat: "PHOTO",
          locationAssociation: { category: "COVER" },
          googleUrl: "https://lh3.googleusercontent.com/original",
          thumbnailUrl: "https://lh3.googleusercontent.com/thumb",
          attribution: { displayName: "Harbourview Physiotherapy" },
        }],
      }), { status: 200 }),
    );

    const result = await listMedia("access", "accounts/a/locations/l");
    expect(result).toEqual({
      ok: true,
      data: [expect.objectContaining({
        name: "accounts/a/locations/l/media/m1",
        category: "COVER",
        googleUrl: "https://lh3.googleusercontent.com/original",
        attribution: { displayName: "Harbourview Physiotherapy" },
      })],
    });
  });
});

describe("owned profile mutations", () => {
  it("PATCHes only the requested field mask", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        name: "locations/l",
        profile: { description: "Verified description" },
      }), { status: 200 }),
    );

    const result = await patchLocation(
      "access",
      "locations/l",
      ["profile.description"],
      { profile: { description: "Verified description" } },
    );
    expect(result).toMatchObject({ ok: true, data: { name: "locations/l" } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("updateMask=profile.description");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "locations/l",
      profile: { description: "Verified description" },
    });
  });

  it("refuses a broad write without an explicit mask", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await patchLocation("access", "locations/l", [], { title: "Nope" })).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
