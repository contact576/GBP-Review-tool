import { afterEach, describe, expect, it, vi } from "vitest";
import type { GbpProfileSnapshot, ProfileSuggestion } from "@/lib/data/types";
import { encryptSecret } from "@/lib/google/crypto";
import { executeContentPublication } from "@/lib/google/content-publish-runner";
import {
  REPLY_PUBLISH_COPY,
  decideOwnerReplyPublication,
  isOwnedGoogleReviewId,
  prepareContentPublication,
  prepareOwnerReplyPublication,
  replyPublishBlockNote,
  resolveOwnerReplyCapability,
  resolveReplyPublishOutcome,
} from "@/lib/google/content-publishing";

afterEach(() => vi.restoreAllMocks());

const OWNED_REVIEW_ID = "rev_gbp_google-review-9";
const PUBLIC_REVIEW_ID = "rev_gpub_sample-3";
const COMMENT = "Thank you for the thoughtful feedback.";

function snapshotWith(
  reviews: GbpProfileSnapshot["sourceStatus"]["reviews"] = "synced",
): GbpProfileSnapshot {
  return {
    schemaVersion: 1,
    source: "google_business_profile",
    accountResource: "accounts/account_1",
    locationResource: "locations/location_2",
    syncedAt: "2026-07-20T00:00:00.000Z",
    location: { name: "locations/location_2" },
    attributes: [],
    availableAttributes: [],
    media: [],
    localPosts: [],
    questions: [],
    searchKeywords: [],
    capabilities: [],
    capabilityScore: {
      score: 0, applicableCount: 0, completeCount: 0, partialCount: 0,
      missingCount: 0, unknownCount: 0, excludedCount: 0,
    },
    reviewResponseRate: 0,
    sourceStatus: {
      location: "synced", attributes: "synced", attributeMetadata: "synced", media: "synced",
      posts: "synced", questions: "synced", reviews, performance: "synced",
      searchKeywords: "synced", googleUpdates: "synced",
    },
    warnings: [],
  };
}

/** A fully connected, approved, non-demo workspace. */
const CONNECTED = {
  isDemo: false,
  hasGoogleCredential: true,
  snapshot: snapshotWith("synced"),
  reviewId: OWNED_REVIEW_ID,
};

describe("owner-reply publish gating", () => {
  it("publishes only when the workspace is real, connected, synced and the review is an owned import", () => {
    expect(decideOwnerReplyPublication(CONNECTED)).toEqual({ publish: true });
  });

  it("never lets a demo workspace write to Google, even when everything else is present", () => {
    expect(decideOwnerReplyPublication({ ...CONNECTED, isDemo: true })).toEqual({
      publish: false,
      block: "demo_workspace",
    });
    // Demo is checked first — it cannot be masked by another block.
    expect(resolveOwnerReplyCapability({ isDemo: true, hasGoogleCredential: false, snapshot: null })).toEqual({
      ready: false,
      block: "demo_workspace",
    });
  });

  it("blocks when there is no stored Google credential", () => {
    expect(decideOwnerReplyPublication({ ...CONNECTED, hasGoogleCredential: false })).toEqual({
      publish: false,
      block: "not_connected",
    });
  });

  it("blocks when the Business Profile has never been synced", () => {
    expect(decideOwnerReplyPublication({ ...CONNECTED, snapshot: null })).toEqual({
      publish: false,
      block: "profile_not_synced",
    });
  });

  it("blocks while Google has not approved review access for the project", () => {
    expect(decideOwnerReplyPublication({ ...CONNECTED, snapshot: snapshotWith("not_authorized") })).toEqual({
      publish: false,
      block: "reply_access_pending",
    });
    expect(decideOwnerReplyPublication({ ...CONNECTED, snapshot: snapshotWith("error") })).toEqual({
      publish: false,
      block: "reply_access_pending",
    });
  });

  it("blocks a public-sample review, which has no reply endpoint", () => {
    expect(isOwnedGoogleReviewId(OWNED_REVIEW_ID)).toBe(true);
    expect(isOwnedGoogleReviewId(PUBLIC_REVIEW_ID)).toBe(false);
    expect(decideOwnerReplyPublication({ ...CONNECTED, reviewId: PUBLIC_REVIEW_ID })).toEqual({
      publish: false,
      block: "review_not_imported",
    });
  });
});

describe("owner-reply outcome copy", () => {
  it("only claims Google has the reply when the read-back verified it", () => {
    const published = resolveReplyPublishOutcome({ kind: "executed", ok: true, verified: true });
    expect(published).toEqual({
      state: "published",
      publishedToGoogle: true,
      message: REPLY_PUBLISH_COPY.published,
    });
    expect(published.message).toMatch(/read your reply back/i);
  });

  it("reports an unverified write as pending, never as posted", () => {
    const pending = resolveReplyPublishOutcome({ kind: "executed", ok: true, verified: false });
    expect(pending.state).toBe("verification_pending");
    expect(pending.publishedToGoogle).toBe(false);
    expect(pending.message).toMatch(/could not read it back/i);

    const withDetail = resolveReplyPublishOutcome({
      kind: "executed", ok: true, verified: false, error: "Google returned no reply body.",
    });
    expect(withDetail.message).toContain("Google returned no reply body.");
  });

  it("says plainly that a blocked reply was saved locally and NOT posted", () => {
    for (const block of [
      "demo_workspace", "not_connected", "profile_not_synced",
      "reply_access_pending", "review_not_imported", "rate_limited",
    ] as const) {
      const outcome = resolveReplyPublishOutcome({ kind: "blocked", block });
      expect(outcome).toMatchObject({ state: "saved_locally", publishedToGoogle: false });
      expect(outcome.message).toContain("Saved in Foundly.");
      expect(outcome.message).toContain("Not posted to Google");
      expect(outcome.message).toContain(REPLY_PUBLISH_COPY.reason[block]);
      // The standing drawer note reuses the same reason fragment.
      expect(replyPublishBlockNote(block)).toContain(REPLY_PUBLISH_COPY.reason[block]);
    }
  });

  it("surfaces the Google failure reason instead of swallowing it", () => {
    const failed = resolveReplyPublishOutcome({
      kind: "executed",
      ok: false,
      verified: false,
      error: "Google rejected this publication (PERMISSION_DENIED).",
    });
    expect(failed).toMatchObject({ state: "failed", publishedToGoogle: false });
    expect(failed.message).toContain("Saved in Foundly.");
    expect(failed.message).toContain("PERMISSION_DENIED");

    // A failure with no detail still never reads as success.
    const bare = resolveReplyPublishOutcome({ kind: "executed", ok: false, verified: false });
    expect(bare.state).toBe("failed");
    expect(bare.message).toContain(REPLY_PUBLISH_COPY.genericFailure);
  });

  it("treats a replayed idempotent publication as already-posted, not double-posted", () => {
    expect(resolveReplyPublishOutcome({ kind: "already_published" })).toEqual({
      state: "published",
      publishedToGoogle: true,
      message: REPLY_PUBLISH_COPY.alreadyPublished,
    });
    expect(resolveReplyPublishOutcome({ kind: "in_flight" })).toMatchObject({
      state: "verification_pending",
      publishedToGoogle: false,
    });
  });
});

describe("owner-reply request planning", () => {
  it("builds the identical request the governed approval path builds", () => {
    const suggestion: ProfileSuggestion = {
      id: "suggestion_reply_1",
      workspaceId: "ws_1",
      locationId: "loc_1",
      auditId: "audit_1",
      findingId: "finding_1",
      target: "owner_reply",
      kind: "owner_reply",
      title: "Reply",
      rationale: "Owner reply",
      priorityScore: 70,
      risk: "low",
      status: "approved",
      exactPreviewReady: true,
      evidenceIds: [],
      blockers: [],
      nextStep: "Publish",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      approvedAt: "2026-07-20T00:01:00.000Z",
      approvedBy: "Owner",
      proposedValue: {
        schemaVersion: 1,
        kind: "owner_reply",
        headline: "Reply",
        body: COMMENT,
        evidenceIds: [],
        evidenceSummary: [],
        generatedBy: { provider: "openai", textModel: "gpt-5.4-mini", generatedAt: "2026-07-20T00:00:00.000Z" },
        googlePayload: { reviewId: OWNED_REVIEW_ID, comment: COMMENT },
      },
    };
    const snapshot = snapshotWith();
    expect(prepareOwnerReplyPublication({ snapshot, reviewId: OWNED_REVIEW_ID, comment: COMMENT }))
      .toEqual(prepareContentPublication({ suggestion, snapshot }));
  });

  it("refuses a review Google has no reply endpoint for, and empty or oversized text", () => {
    const snapshot = snapshotWith();
    expect(() => prepareOwnerReplyPublication({ snapshot, reviewId: PUBLIC_REVIEW_ID, comment: COMMENT }))
      .toThrow(/owned-profile review/i);
    expect(() => prepareOwnerReplyPublication({ snapshot, reviewId: OWNED_REVIEW_ID, comment: "   " }))
      .toThrow(/non-empty/i);
    expect(() => prepareOwnerReplyPublication({ snapshot, reviewId: OWNED_REVIEW_ID, comment: "x".repeat(4_097) }))
      .toThrow(/length/i);
  });
});

// ── Google layer, fully mocked: no network call is ever made ────────────────
const credential = {
  workspaceId: "ws_1",
  encryptedRefreshToken: encryptSecret("refresh-token"),
  scopes: "https://www.googleapis.com/auth/business.manage",
  connectedAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function mockGoogle(handlers: {
  token?: { status: number; body: unknown };
  write?: { status: number; body: unknown };
  readBack?: { status: number; body: unknown };
}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      const t = handlers.token ?? { status: 200, body: { access_token: "access-1", expires_in: 3600 } };
      return new Response(JSON.stringify(t.body), { status: t.status });
    }
    if (init?.method === "PUT") {
      const w = handlers.write ?? { status: 200, body: {} };
      return new Response(JSON.stringify(w.body), { status: w.status });
    }
    const r = handlers.readBack ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
}

describe("owner-reply execution against a mocked Google", () => {
  const plan = prepareOwnerReplyPublication({
    snapshot: snapshotWith(),
    reviewId: OWNED_REVIEW_ID,
    comment: COMMENT,
  });

  it("PUTs the exact comment and verifies it by reading the review back", async () => {
    const fetchMock = mockGoogle({ readBack: { status: 200, body: { reviewReply: { comment: COMMENT } } } });
    const execution = await executeContentPublication(plan, credential);

    expect(execution).toMatchObject({ ok: true, verified: true, verifiedValue: COMMENT });
    expect(resolveReplyPublishOutcome({ kind: "executed", ok: true, verified: true }).state).toBe("published");

    const write = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(String(write?.[0])).toBe(
      "https://mybusiness.googleapis.com/v4/accounts/account_1/locations/location_2/reviews/google-review-9/reply",
    );
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({ comment: COMMENT });
  });

  it("does NOT report published when the read-back text differs", async () => {
    mockGoogle({ readBack: { status: 200, body: { reviewReply: { comment: "Something else" } } } });
    const execution = await executeContentPublication(plan, credential);

    expect(execution).toMatchObject({ ok: true, verified: false });
    const outcome = resolveReplyPublishOutcome({ kind: "executed", ok: true, verified: execution.verified });
    expect(outcome.publishedToGoogle).toBe(false);
    expect(outcome.state).toBe("verification_pending");
  });

  it("reports a Google rejection with its reason instead of a silent success", async () => {
    mockGoogle({ write: { status: 403, body: { error: { status: "PERMISSION_DENIED" } } } });
    const execution = await executeContentPublication(plan, credential);

    expect(execution.ok).toBe(false);
    expect(execution.error).toContain("PERMISSION_DENIED");
    const outcome = resolveReplyPublishOutcome({
      kind: "executed", ok: false, verified: false, error: execution.error,
    });
    expect(outcome.state).toBe("failed");
    expect(outcome.message).toContain("PERMISSION_DENIED");
  });

  it("fails honestly, without calling Google, when there is no credential", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const execution = await executeContentPublication(plan, null);

    expect(execution).toMatchObject({ ok: false, verified: false });
    expect(execution.error).toMatch(/not connected/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a revoked refresh token rather than pretending the reply landed", async () => {
    mockGoogle({ token: { status: 400, body: { error: "invalid_grant" } } });
    const execution = await executeContentPublication(plan, credential);

    expect(execution.ok).toBe(false);
    expect(execution.error).toMatch(/reconnect google/i);
    expect(resolveReplyPublishOutcome({
      kind: "executed", ok: false, verified: false, error: execution.error,
    }).publishedToGoogle).toBe(false);
  });
});
