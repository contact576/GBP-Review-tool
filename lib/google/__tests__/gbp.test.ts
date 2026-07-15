import { describe, it, expect } from "vitest";
import { mapGbpStarRating, mapGbpReview } from "@/lib/google/gbp";

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
