import { describe, it, expect } from "vitest";
import {
  applyReviewMatches,
  confidentlyPostedRequestIds,
  matchReviewsToRequests,
  nameSimilarity,
  normalizeName,
  scorePair,
  timingScore,
  MATCH_THRESHOLD,
  MAX_CONFIDENCE,
  POSTED_THRESHOLD,
} from "@/lib/reviews/matching";
import type { Review, ReviewRequest } from "@/lib/data/types";

const SENT = "2026-07-01T09:00:00.000Z";

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "rev_gbp_1",
    locationId: "loc_1",
    author: "Daniel O'Brien",
    rating: 5,
    text: "Excellent",
    publishedAt: "2026-07-02T09:00:00.000Z",
    source: "google",
    durability: "stable",
    needsReply: true,
    ...overrides,
  };
}

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: "req_1",
    locationId: "loc_1",
    customerId: "cus_1",
    customerName: "Daniel O'Brien",
    channel: "sms",
    token: "tok_1",
    status: "clicked",
    isTest: false,
    createdAt: SENT,
    sentAt: SENT,
    attributes: [],
    ...overrides,
  };
}

function confidence(r: Review, q: ReviewRequest): number {
  return scorePair(r, q)?.confidence ?? 0;
}

describe("name normalization and fuzzing", () => {
  it("strips apostrophes, punctuation, accents and honorifics", () => {
    expect(normalizeName("Dr. Dan O'B.")).toEqual(["dan", "ob"]);
    expect(normalizeName("José Álvarez")).toEqual(["jose", "alvarez"]);
    expect(normalizeName("  ")).toEqual([]);
  });

  it("matches an abbreviated signature to the full customer name", () => {
    // "Dan" is a prefix of "Daniel" (0.9); "O'B" abbreviates "O'Brien" (0.8).
    expect(nameSimilarity("Dan O'B.", "Daniel O'Brien")).toBeCloseTo(0.85, 5);
  });

  it("matches an initial plus a full surname", () => {
    expect(nameSimilarity("M. Chen", "Michael Chen")).toBeCloseTo(0.775, 5);
  });

  it("tolerates a spelling variant", () => {
    expect(nameSimilarity("Katherine Smyth", "Katherine Smith")).toBeGreaterThan(0.85);
  });

  it("handles a family-name-first ordering", () => {
    expect(nameSimilarity("Chen Michael", "Michael Chen")).toBeGreaterThan(0.9);
  });

  it("discounts a first-name-only signature", () => {
    const single = nameSimilarity("Sam", "Sam Patel");
    expect(single).toBeCloseTo(0.65, 5);
    expect(single).toBeLessThan(nameSimilarity("Sam Patel", "Sam Patel"));
  });

  it("scores two different people at or near zero", () => {
    expect(nameSimilarity("Michael Chen", "Sarah Lopez")).toBe(0);
    expect(nameSimilarity("Priya Raman", "Peter Ramsay")).toBeLessThan(0.5);
  });

  it("never attributes an anonymous reviewer", () => {
    expect(nameSimilarity("A Google user", "Daniel O'Brien")).toBe(0);
    expect(scorePair(review({ author: "A Google user" }), request())).toBeNull();
  });
});

describe("time-window behaviour", () => {
  it("scores a same-week review higher than a month-old one", () => {
    const fast = confidence(review({ publishedAt: "2026-07-01T20:00:00.000Z" }), request());
    const slow = confidence(review({ publishedAt: "2026-07-25T09:00:00.000Z" }), request());
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it("refuses a review published BEFORE the request was sent", () => {
    expect(timingScore(SENT, "2026-06-20T09:00:00.000Z")).toBeNull();
    expect(scorePair(review({ publishedAt: "2026-06-20T09:00:00.000Z" }), request())).toBeNull();
  });

  it("allows a few hours of clock skew", () => {
    expect(timingScore(SENT, "2026-07-01T06:00:00.000Z")?.score).toBe(1);
  });

  it("refuses a review far outside the attribution window", () => {
    expect(timingScore(SENT, "2026-09-30T09:00:00.000Z")).toBeNull();
    expect(scorePair(review({ publishedAt: "2026-09-30T09:00:00.000Z" }), request())).toBeNull();
  });

  it("degrades monotonically as the gap widens", () => {
    const at = (iso: string) => timingScore(SENT, iso)?.score ?? -1;
    expect(at("2026-07-02T09:00:00.000Z")).toBe(1); // 1 day
    expect(at("2026-07-06T09:00:00.000Z")).toBe(0.8); // 5 days
    expect(at("2026-07-11T09:00:00.000Z")).toBe(0.55); // 10 days
    expect(at("2026-07-21T09:00:00.000Z")).toBe(0.3); // 20 days
    expect(at("2026-08-05T09:00:00.000Z")).toBe(0.12); // 35 days
  });

  it("falls back to the created time when a request has no sentAt", () => {
    const noSend = request({ sentAt: undefined, createdAt: SENT });
    expect(confidence(review(), noSend)).toBeGreaterThan(MATCH_THRESHOLD);
  });
});

describe("confidence and thresholds", () => {
  it("matches an exact name, same-day review and a click-through", () => {
    const match = scorePair(review({ publishedAt: "2026-07-01T18:00:00.000Z" }), request());
    // Raw 0.55*1 + 0.30*1 + 0.15*0.9 = 0.985, capped to MAX_CONFIDENCE.
    expect(match?.confidence).toBe(MAX_CONFIDENCE);
    expect(match?.reasons.length).toBeGreaterThan(0);
  });

  it("never reports certainty", () => {
    const match = scorePair(
      review({ publishedAt: "2026-07-01T18:00:00.000Z" }),
      request({ status: "posted_google" }),
    );
    expect(match?.confidence).toBe(MAX_CONFIDENCE);
    expect(match?.confidence).toBeLessThan(1);
  });

  it("rejects a weak name even with perfect timing and engagement", () => {
    expect(
      scorePair(
        review({ author: "Sarah Lopez", publishedAt: "2026-07-01T18:00:00.000Z" }),
        request({ status: "posted_google" }),
      ),
    ).toBeNull();
  });

  it("leaves a near-threshold candidate unmatched", () => {
    // First-name-only (0.65) + a 20-day gap (0.3) + merely opened (0.55):
    // 0.3575 + 0.09 + 0.0825 = 0.53 — real evidence, but not enough to claim.
    const near = scorePair(
      review({ author: "Sam", publishedAt: "2026-07-21T09:00:00.000Z" }),
      request({ customerName: "Sam Patel", status: "opened" }),
    );
    expect(near?.confidence).toBeCloseTo(0.53, 3);
    expect(near?.confidence).toBeLessThan(MATCH_THRESHOLD);

    const outcome = matchReviewsToRequests({
      reviews: [review({ author: "Sam", publishedAt: "2026-07-21T09:00:00.000Z" })],
      requests: [request({ customerName: "Sam Patel", status: "opened" })],
    });
    expect(outcome.matches).toEqual([]);
    expect(outcome.rejected).toHaveLength(1);
  });

  it("does not advance the funnel on a merely-detected match", () => {
    // Same first-name-only signature, but posted quickly after a click:
    // 0.3575 + 0.30 + 0.135 = 0.7925 — above MATCH_THRESHOLD.
    const outcome = matchReviewsToRequests({
      reviews: [review({ author: "Sam", publishedAt: "2026-07-01T18:00:00.000Z" })],
      requests: [request({ customerName: "Sam Patel" })],
    });
    expect(outcome.matches).toHaveLength(1);
    expect(confidentlyPostedRequestIds(outcome)).toEqual(["req_1"]);

    // ...whereas a 10-day gap drops below POSTED_THRESHOLD and stays a chip.
    const slower = matchReviewsToRequests({
      reviews: [review({ author: "Sam", publishedAt: "2026-07-11T09:00:00.000Z" })],
      requests: [request({ customerName: "Sam Patel" })],
    });
    expect(slower.matches[0]?.confidence).toBeLessThan(POSTED_THRESHOLD);
    expect(confidentlyPostedRequestIds(slower)).toEqual([]);
  });
});

describe("disqualifying requests", () => {
  it("never lets a test request claim a real review", () => {
    expect(scorePair(review(), request({ isTest: true }))).toBeNull();
  });

  it.each(["queued", "failed", "suppressed"] as const)(
    "never attributes a review to a %s request",
    (status) => {
      expect(scorePair(review(), request({ status }))).toBeNull();
    },
  );

  it("ignores requests from a different location", () => {
    const outcome = matchReviewsToRequests({
      reviews: [review()],
      requests: [request({ locationId: "loc_other" })],
    });
    expect(outcome.matches).toEqual([]);
  });
});

describe("assignment", () => {
  it("writes nothing when two customers fit equally well", () => {
    const outcome = matchReviewsToRequests({
      reviews: [review({ author: "J. Smith", publishedAt: "2026-07-01T18:00:00.000Z" })],
      requests: [
        request({ id: "req_a", customerId: "cus_a", customerName: "James Smith" }),
        request({ id: "req_b", customerId: "cus_b", customerName: "Jane Smith" }),
      ],
    });
    expect(outcome.matches).toEqual([]);
    expect(outcome.ambiguous).toEqual(["rev_gbp_1"]);
  });

  it("keeps assignment 1:1 — one request cannot claim two reviews", () => {
    const outcome = matchReviewsToRequests({
      reviews: [
        review({ id: "rev_gbp_1", publishedAt: "2026-07-01T18:00:00.000Z" }),
        review({ id: "rev_gbp_2", publishedAt: "2026-07-10T09:00:00.000Z" }),
      ],
      requests: [request()],
    });
    expect(outcome.matches).toHaveLength(1);
    // The closer review wins the single request.
    expect(outcome.matches[0]?.reviewId).toBe("rev_gbp_1");
  });

  it("is deterministic — identical input yields identical output", () => {
    const input = {
      reviews: [review(), review({ id: "rev_gbp_2", author: "Sam Patel" })],
      requests: [request(), request({ id: "req_2", customerId: "cus_2", customerName: "Sam Patel" })],
    };
    expect(matchReviewsToRequests(input)).toEqual(matchReviewsToRequests(input));
  });
});

describe("applyReviewMatches", () => {
  it("writes the request id and confidence onto a matched review", () => {
    const reviews = [review({ publishedAt: "2026-07-01T18:00:00.000Z" })];
    const outcome = matchReviewsToRequests({ reviews, requests: [request()] });
    const applied = applyReviewMatches(reviews, outcome);
    expect(applied[0]?.matchedRequestId).toBe("req_1");
    expect(applied[0]?.matchConfidence).toBe(MAX_CONFIDENCE);
  });

  it("clears attribution that no longer holds", () => {
    const stale = [review({ matchedRequestId: "req_gone", matchConfidence: 0.9 })];
    const applied = applyReviewMatches(stale, { matches: [], rejected: [], ambiguous: [] });
    expect(applied[0]?.matchedRequestId).toBeUndefined();
    expect(applied[0]?.matchConfidence).toBeUndefined();
  });

  it("leaves untouched reviews referentially identical", () => {
    const reviews = [review()];
    const applied = applyReviewMatches(reviews, { matches: [], rejected: [], ambiguous: [] });
    expect(applied[0]).toBe(reviews[0]);
  });
});
