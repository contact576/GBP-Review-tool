import { describe, expect, it } from "vitest";
import type {
  AiContentAsset,
  ContentPublishingJob,
  GbpProfileSnapshot,
  ProfileSuggestion,
} from "@/lib/data/types";
import { DEMO_WORKSPACE_ID, memoryProvider } from "@/lib/data/memory-provider";
import { prepareContentPublication } from "../content-publishing";
import {
  createSignedContentAssetUrl,
  verifySignedContentAsset,
} from "@/lib/security/content-asset-signature";

const snapshot: GbpProfileSnapshot = {
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
  capabilityScore: { score: 0, applicableCount: 0, completeCount: 0, partialCount: 0, missingCount: 0, unknownCount: 0, excludedCount: 0 },
  reviewResponseRate: 0,
  sourceStatus: {
    location: "synced", attributes: "synced", attributeMetadata: "synced", media: "synced", posts: "synced",
    questions: "synced", reviews: "synced", performance: "synced", searchKeywords: "synced", googleUpdates: "synced",
  },
  warnings: [],
};

const base = {
  id: "suggestion_content_1",
  workspaceId: DEMO_WORKSPACE_ID,
  locationId: "loc_harbourview",
  auditId: "audit_1",
  findingId: "finding_1",
  title: "Exact content",
  rationale: "Uses verified facts.",
  priorityScore: 80,
  risk: "low",
  status: "approved",
  exactPreviewReady: true,
  evidenceIds: ["evidence_1"],
  blockers: [],
  nextStep: "Publish",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
  approvedAt: "2026-07-20T00:01:00.000Z",
  approvedBy: "Owner",
} satisfies Omit<ProfileSuggestion, "kind" | "target" | "proposedValue">;

function generated(kind: "local_post" | "owner_reply" | "qna", googlePayload: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    kind,
    headline: "Helpful update",
    body: "Exact approved copy",
    evidenceIds: ["evidence_1"],
    evidenceSummary: ["Verified profile fact"],
    generatedBy: { provider: "openai", textModel: "gpt-5.4-mini", generatedAt: "2026-07-20T00:00:00.000Z" },
    googlePayload,
  };
}

describe("Google content publication planning", () => {
  it("builds a local-post request with only a signed public sourceUrl", () => {
    const asset: AiContentAsset = {
      id: "asset_1234567890abcdef12345678",
      workspaceId: DEMO_WORKSPACE_ID,
      locationId: "loc_harbourview",
      suggestionId: base.id,
      kind: "image",
      mimeType: "image/webp",
      base64Data: "AA==",
      prompt: "Photo",
      altText: "Clinic",
      model: "gpt-image-2",
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    };
    const suggestion: ProfileSuggestion = {
      ...base,
      kind: "local_post",
      target: "local_post",
      proposedValue: {
        ...generated("local_post", { topicType: "STANDARD", languageCode: "en", summary: "Exact approved copy" }),
        image: { assetId: asset.id, src: `/api/ai/content-assets/${asset.id}`, mimeType: "image/webp", altText: "Clinic" },
      },
    };
    const plan = prepareContentPublication({
      suggestion,
      snapshot,
      asset,
      publicImageUrl: "https://foundly.example/api/public/content-assets/asset_1234567890abcdef12345678?token=signed",
    });
    expect(plan.endpoint).toBe("https://mybusiness.googleapis.com/v4/accounts/account_1/locations/location_2/localPosts");
    expect(plan.body).toMatchObject({
      topicType: "STANDARD",
      summary: "Exact approved copy",
      media: [{ mediaFormat: "PHOTO", sourceUrl: expect.stringMatching(/^https:\/\//) }],
    });
  });

  it("reconstructs the owned-review resource without leaking Foundly's prefix", () => {
    const suggestion: ProfileSuggestion = {
      ...base,
      kind: "owner_reply",
      target: "owner_reply",
      proposedValue: generated("owner_reply", { reviewId: "rev_gbp_google-review-9", comment: "Thank you for the thoughtful feedback." }),
    };
    const plan = prepareContentPublication({ suggestion, snapshot });
    expect(plan.method).toBe("PUT");
    expect(plan.endpoint).toBe("https://mybusiness.googleapis.com/v4/accounts/account_1/locations/location_2/reviews/google-review-9/reply");
    expect(plan.body).toEqual({ comment: "Thank you for the thoughtful feedback." });
  });

  it("uses the Q&A v1 resource exactly and rejects unapproved content", () => {
    const suggestion: ProfileSuggestion = {
      ...base,
      kind: "qna",
      target: "qna_answer",
      proposedValue: generated("qna", { questionResource: "locations/location_2/questions/question_3", answerText: "Yes, appointments are required." }),
    };
    const plan = prepareContentPublication({ suggestion, snapshot });
    expect(plan.endpoint).toBe("https://mybusinessqanda.googleapis.com/v1/locations/location_2/questions/question_3/answers:upsert");
    expect(plan.body).toEqual({ answer: { text: "Yes, appointments are required." } });
    expect(() => prepareContentPublication({ suggestion: { ...suggestion, status: "ready_for_review", approvedAt: undefined }, snapshot })).toThrow(/approved/i);
  });
});

describe("signed public asset delivery", () => {
  it("accepts only the exact unexpired signed asset scope", () => {
    const now = Date.now();
    const expiresAt = now + 60 * 60_000;
    const url = new URL(createSignedContentAssetUrl({
      baseUrl: "https://foundly.example",
      workspaceId: "workspace_1",
      assetId: "asset_1234567890abcdef12345678",
      expiresAt,
    }));
    const suppliedSignature = url.searchParams.get("signature") || "";
    expect(verifySignedContentAsset({ workspaceId: "workspace_1", assetId: "asset_1234567890abcdef12345678", expiresAt, suppliedSignature, now })).toBe(true);
    expect(verifySignedContentAsset({ workspaceId: "workspace_2", assetId: "asset_1234567890abcdef12345678", expiresAt, suppliedSignature, now })).toBe(false);
    expect(verifySignedContentAsset({ workspaceId: "workspace_1", assetId: "asset_1234567890abcdef12345678", expiresAt, suppliedSignature, now: expiresAt + 1 })).toBe(false);
  });

  it("requires a public HTTPS base URL", () => {
    expect(() => createSignedContentAssetUrl({
      baseUrl: "http://localhost:3200",
      workspaceId: "workspace_1",
      assetId: "asset_1234567890abcdef12345678",
      expiresAt: Date.now() + 60_000,
    })).toThrow(/public HTTPS APP_URL/i);
  });
});

describe("content publication ledger idempotency", () => {
  it("stores one job for repeated approval of the same exact payload", async () => {
    const job: ContentPublishingJob = {
      id: "pub_1",
      workspaceId: DEMO_WORKSPACE_ID,
      locationId: "loc_harbourview",
      suggestionId: "suggestion_pub_unique",
      idempotencyKey: "content-change-unique",
      kind: "owner_reply",
      status: "queued",
      exactPayload: { comment: "Thanks" },
      attempts: 0,
      approvedAt: base.approvedAt,
      approvedBy: "Owner",
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    };
    expect((await memoryProvider.createContentPublishingJob(DEMO_WORKSPACE_ID, job)).created).toBe(true);
    expect((await memoryProvider.createContentPublishingJob(DEMO_WORKSPACE_ID, { ...job, id: "pub_2" })).created).toBe(false);
  });
});
