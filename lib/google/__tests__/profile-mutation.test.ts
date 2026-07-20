import { beforeEach, describe, expect, it } from "vitest";
import type { GbpProfileSnapshot, ProfileMutationJob, ProfileSuggestion } from "@/lib/data/types";
import {
  mutationValuesMatch,
  prepareProfileMutation,
  verifiedValueForPlan,
} from "@/lib/google/profile-mutation";
import { DEMO_WORKSPACE_ID, memoryProvider } from "@/lib/data/memory-provider";

const snapshot: GbpProfileSnapshot = {
  schemaVersion: 1,
  source: "google_business_profile",
  accountResource: "accounts/a",
  locationResource: "locations/l",
  syncedAt: "2026-07-19T10:00:00.000Z",
  location: {
    name: "locations/l",
    title: "Harbourview Physiotherapy",
    profile: { description: "Current description" },
    categories: { primaryCategory: { name: "categories/physical_therapist" } },
  },
  attributes: [{ name: "attributes/wheelchair_accessible", values: [false] }],
  availableAttributes: [],
  media: [],
  localPosts: [],
  questions: [],
  searchKeywords: [],
  capabilities: [],
  capabilityScore: {
    score: 0,
    applicableCount: 0,
    completeCount: 0,
    partialCount: 0,
    missingCount: 0,
    unknownCount: 0,
    excludedCount: 0,
  },
  reviewResponseRate: 0,
  sourceStatus: {
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
  },
  warnings: [],
};

function suggestion(patch: Partial<ProfileSuggestion> = {}): ProfileSuggestion {
  return {
    id: "suggestion_1",
    workspaceId: DEMO_WORKSPACE_ID,
    locationId: "loc_harbourview",
    auditId: "audit_1",
    findingId: "finding_1",
    target: "description",
    kind: "profile_edit",
    title: "Improve description",
    rationale: "Exact factual description.",
    priorityScore: 80,
    risk: "medium",
    status: "approved",
    currentValue: "Current description",
    proposedValue: "A precise new description",
    exactPreviewReady: true,
    evidenceIds: ["ev_1"],
    blockers: [],
    nextStep: "Approve",
    createdAt: "2026-07-19T09:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    approvedAt: "2026-07-19T10:05:00.000Z",
    approvedBy: "Owner",
    ...patch,
  };
}

describe("safe Google profile mutation planning", () => {
  it("builds the narrow field mask and exact before/after values", () => {
    const plan = prepareProfileMutation(suggestion(), snapshot);
    expect(plan).toMatchObject({
      surface: "location",
      updateMask: ["profile.description"],
      beforeValue: "Current description",
      proposedValue: "A precise new description",
      requestBody: { profile: { description: "A precise new description" } },
    });
    expect(verifiedValueForPlan(plan, {
      ...snapshot.location,
      profile: { description: "A precise new description" },
    })).toBe("A precise new description");
  });

  it("rejects an incomplete preview and a workflow placeholder", () => {
    expect(() => prepareProfileMutation(suggestion({ exactPreviewReady: false }), snapshot)).toThrow(/previewed/i);
    expect(() => prepareProfileMutation(suggestion({
      target: "local_post",
      kind: "local_post",
      proposedValue: { action: "draft_a_post" },
    }), snapshot)).toThrow(/not available/i);
  });

  it("requires explicit fact confirmation for category changes", () => {
    const category = suggestion({
      target: "primary_category",
      risk: "high",
      proposedValue: { name: "categories/chiropractor" },
    });
    expect(() => prepareProfileMutation(category, snapshot)).toThrow(/facts/i);
    const plan = prepareProfileMutation({
      ...category,
      factsConfirmedAt: category.approvedAt,
      factsConfirmedBy: category.approvedBy,
    }, snapshot);
    expect(plan.updateMask).toEqual(["categories.primaryCategory"]);
  });

  it("prepares attribute masks from exact eligible Google attribute names", () => {
    const plan = prepareProfileMutation(suggestion({
      target: "attributes",
      proposedValue: [{ name: "attributes/wheelchair_accessible", values: [true] }],
    }), snapshot);
    expect(plan.surface).toBe("attributes");
    expect(plan.updateMask).toEqual(["attributes/wheelchair_accessible"]);
    expect(plan.beforeValue).toEqual([{ name: "attributes/wheelchair_accessible", values: [false] }]);
  });

  it("compares structured values independently of object key order", () => {
    expect(mutationValuesMatch({ a: 1, b: { c: true } }, { b: { c: true }, a: 1 })).toBe(true);
    expect(mutationValuesMatch({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("mutation ledger idempotency", () => {
  beforeEach(async () => memoryProvider.resetDemo());

  it("stores one job for repeated submissions of the same exact change", async () => {
    const job: ProfileMutationJob = {
      id: "mut_1",
      workspaceId: DEMO_WORKSPACE_ID,
      locationId: "loc_harbourview",
      suggestionId: "suggestion_1",
      idempotencyKey: "same-change",
      target: "description",
      status: "queued",
      updateMask: ["profile.description"],
      proposedValue: "New description",
      attempts: 0,
      approvedAt: "2026-07-19T10:00:00.000Z",
      approvedBy: "Owner",
      createdAt: "2026-07-19T10:00:00.000Z",
      updatedAt: "2026-07-19T10:00:00.000Z",
    };
    expect((await memoryProvider.createProfileMutationJob(DEMO_WORKSPACE_ID, job)).created).toBe(true);
    expect((await memoryProvider.createProfileMutationJob(DEMO_WORKSPACE_ID, { ...job, id: "mut_2" })).created).toBe(false);
    expect((await memoryProvider.getData(DEMO_WORKSPACE_ID))?.mutationJobs).toHaveLength(1);
  });
});
