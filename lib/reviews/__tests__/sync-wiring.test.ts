import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Review, ReviewRequest } from "@/lib/data/types";
import type { ProfileSyncOutcome } from "@/lib/google/profile-sync";

/**
 * End-to-end wiring check for the Durability Watchdog.
 *
 * The unit tests prove the rules; this proves the PROVIDER actually applies
 * them — the original bug was not a bad rule, it was a sync path that deleted
 * every stored review before re-inserting, which made the diff impossible no
 * matter how good the rule was. These tests run the real memory provider with
 * only the Google fetch stubbed.
 */

const outcomeRef: { current: ProfileSyncOutcome } = { current: { ok: true } };

vi.mock("@/lib/google/profile-sync", () => ({
  fetchGoogleProfile: async () => outcomeRef.current,
  // These cases all exercise an approved sync, so the public-data fallback must
  // stay out of the way. Reporting it unconfigured keeps that branch inert.
  fetchApifyProfile: async () => ({ ok: false, error: "Apify is not configured." }),
  locationFromProfileSnapshot: (location: unknown) => location,
}));

const { memoryProvider } = await import("@/lib/data/memory-provider");

function gbpReview(id: string, overrides: Partial<Review> = {}): Review {
  return {
    id: `rev_gbp_${id}`,
    locationId: "loc",
    author: "Sam Patel",
    rating: 5,
    text: `Review ${id}`,
    publishedAt: "2026-07-01T00:00:00.000Z",
    source: "google",
    durability: "stable",
    needsReply: true,
    ...overrides,
  };
}

async function freshWorkspace(): Promise<string> {
  const result = await memoryProvider.registerUser({
    name: "Owner",
    email: `owner_${Math.random().toString(36).slice(2)}@example.com`,
    password: "correct-horse-battery",
    businessName: "Harbour Dental",
    industryKey: "dentist",
    region: "CA",
  });
  if (!("user" in result) || !result.user) throw new Error("registration failed");
  return result.user.workspaceId;
}

/** Re-point every stub review at the workspace's real location id. */
function forLocation(reviews: Review[], locationId: string): Review[] {
  return reviews.map((review) => ({ ...review, locationId }));
}

async function sync(workspaceId: string, outcome: ProfileSyncOutcome): Promise<void> {
  outcomeRef.current = outcome;
  const result = await memoryProvider.syncGoogleProfile(workspaceId);
  expect(result.ok).toBe(true);
}

beforeEach(() => {
  outcomeRef.current = { ok: true };
});

describe("provider sync: durability", () => {
  it("marks a review vanished instead of deleting it", async () => {
    const workspaceId = await freshWorkspace();
    const data = await memoryProvider.getData(workspaceId);
    const locationId = data?.location.id ?? "";

    await sync(workspaceId, {
      ok: true,
      reviewsImportOk: true,
      reviews: forLocation([gbpReview("a"), gbpReview("b"), gbpReview("c")], locationId),
    });
    expect((await memoryProvider.getData(workspaceId))?.reviews).toHaveLength(3);

    await sync(workspaceId, {
      ok: true,
      reviewsImportOk: true,
      reviews: forLocation([gbpReview("a"), gbpReview("b")], locationId),
    });

    const after = (await memoryProvider.getData(workspaceId))?.reviews ?? [];
    expect(after).toHaveLength(3); // nothing was destroyed
    const gone = after.find((review) => review.id === "rev_gbp_c");
    expect(gone?.durability).toBe("vanished");
    expect(gone?.vanishedAt).toBeTruthy();
    expect(after.filter((r) => r.durability === "stable")).toHaveLength(2);
  });

  it("does NOT mass-mark vanished when a later import comes back empty", async () => {
    const workspaceId = await freshWorkspace();
    const locationId = (await memoryProvider.getData(workspaceId))?.location.id ?? "";
    const full = forLocation(
      Array.from({ length: 8 }, (_, index) => gbpReview(`r${index}`)),
      locationId,
    );

    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews: full });
    // A blank payload — indistinguishable from a broken read, so we keep quiet.
    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews: [] });

    const after = (await memoryProvider.getData(workspaceId))?.reviews ?? [];
    expect(after).toHaveLength(8);
    expect(after.every((review) => review.durability === "stable")).toBe(true);
  });

  it("does NOT mark anything vanished when the import is flagged untrustworthy", async () => {
    const workspaceId = await freshWorkspace();
    const locationId = (await memoryProvider.getData(workspaceId))?.location.id ?? "";
    const full = forLocation(
      Array.from({ length: 10 }, (_, index) => gbpReview(`r${index}`)),
      locationId,
    );

    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews: full });
    await sync(workspaceId, {
      ok: true,
      reviewsImportOk: false, // truncated page / inconsistent with Google's total
      reviews: forLocation([gbpReview("r0")], locationId),
    });

    const after = (await memoryProvider.getData(workspaceId))?.reviews ?? [];
    expect(after).toHaveLength(10);
    expect(after.filter((review) => review.durability === "vanished")).toHaveLength(0);
  });

  it("flags a review that vanished and came back as at_risk", async () => {
    const workspaceId = await freshWorkspace();
    const locationId = (await memoryProvider.getData(workspaceId))?.location.id ?? "";
    const both = forLocation([gbpReview("a"), gbpReview("b")], locationId);

    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews: both });
    await sync(workspaceId, {
      ok: true,
      reviewsImportOk: true,
      reviews: forLocation([gbpReview("a")], locationId),
    });
    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews: both });

    const after = (await memoryProvider.getData(workspaceId))?.reviews ?? [];
    expect(after.find((review) => review.id === "rev_gbp_b")?.durability).toBe("at_risk");
  });
});

describe("provider sync: attribution", () => {
  function seedRequest(requests: ReviewRequest[], locationId: string, overrides: Partial<ReviewRequest>) {
    requests.push({
      id: "req_seeded",
      locationId,
      customerId: "cus_seeded",
      customerName: "Daniel O'Brien",
      channel: "sms",
      token: "tok_seeded",
      status: "clicked",
      isTest: false,
      createdAt: "2026-07-01T09:00:00.000Z",
      sentAt: "2026-07-01T09:00:00.000Z",
      attributes: [],
      ...overrides,
    });
  }

  it("writes a match and advances the request on a confident match", async () => {
    const workspaceId = await freshWorkspace();
    const data = await memoryProvider.getData(workspaceId);
    const locationId = data?.location.id ?? "";
    seedRequest(data?.requests ?? [], locationId, {});

    await sync(workspaceId, {
      ok: true,
      reviewsImportOk: true,
      reviews: forLocation(
        [gbpReview("a", { author: "Dan O'B.", publishedAt: "2026-07-02T09:00:00.000Z" })],
        locationId,
      ),
    });

    const after = await memoryProvider.getData(workspaceId);
    const review = after?.reviews.find((r) => r.id === "rev_gbp_a");
    expect(review?.matchedRequestId).toBe("req_seeded");
    expect(review?.matchConfidence).toBeGreaterThan(0.75);
    expect(review?.matchConfidence).toBeLessThan(1); // never certainty
    expect(after?.requests.find((r) => r.id === "req_seeded")?.status).toBe("posted_google");
  });

  it("does not re-count a request that already advanced (idempotent re-sync)", async () => {
    const workspaceId = await freshWorkspace();
    const data = await memoryProvider.getData(workspaceId);
    const locationId = data?.location.id ?? "";
    seedRequest(data?.requests ?? [], locationId, {});
    const reviews = forLocation(
      [gbpReview("a", { author: "Dan O'B.", publishedAt: "2026-07-02T09:00:00.000Z" })],
      locationId,
    );

    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews });
    const once = (await memoryProvider.getData(workspaceId))?.subscription.usage.reviewsCaptured;
    await sync(workspaceId, { ok: true, reviewsImportOk: true, reviews });
    const twice = (await memoryProvider.getData(workspaceId))?.subscription.usage.reviewsCaptured;

    expect(once).toBe(1);
    expect(twice).toBe(1);
  });

  it("leaves an unrelated review unmatched", async () => {
    const workspaceId = await freshWorkspace();
    const data = await memoryProvider.getData(workspaceId);
    const locationId = data?.location.id ?? "";
    seedRequest(data?.requests ?? [], locationId, {});

    await sync(workspaceId, {
      ok: true,
      reviewsImportOk: true,
      reviews: forLocation(
        [gbpReview("a", { author: "Sarah Lopez", publishedAt: "2026-07-02T09:00:00.000Z" })],
        locationId,
      ),
    });

    const after = await memoryProvider.getData(workspaceId);
    expect(after?.reviews[0]?.matchedRequestId).toBeUndefined();
    expect(after?.requests.find((r) => r.id === "req_seeded")?.status).toBe("clicked");
  });
});
