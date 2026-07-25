import { describe, expect, it } from "vitest";
import type {
  AuditFindingTarget,
  GbpProfileSnapshot,
  ProfileSuggestion,
} from "@/lib/data/types";
import { prepareProfileMutation } from "@/lib/google/profile-mutation";
import { assertApprovedForExecution, approvalPolicyFor } from "../product-policy";
import {
  assertNotNameField,
  assertPayloadWritesNoNameField,
  isNameField,
} from "../lints";

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
    regularHours: { periods: [] },
    serviceItems: [],
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

/** A fully approved, fact-confirmed suggestion — the strongest possible caller. */
function approvedSuggestion(patch: Partial<ProfileSuggestion> = {}): ProfileSuggestion {
  return {
    id: "suggestion_1",
    workspaceId: "ws_1",
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
    exactPreviewReady: true,
    proposedValue: "A precise new description",
    evidenceIds: ["ev_1"],
    blockers: [],
    nextStep: "Approve",
    createdAt: "2026-07-19T09:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    approvedAt: "2026-07-19T10:05:00.000Z",
    approvedBy: "Owner",
    factsConfirmedAt: "2026-07-19T10:05:00.000Z",
    factsConfirmedBy: "Owner",
    ...patch,
  };
}

describe("business name field rule", () => {
  it("recognizes every identifier that resolves to the Google name", () => {
    for (const field of [
      "name",
      "business_name",
      "business_title",
      "businessTitle",
      "title",
      "location.title",
      "profile.title",
    ]) {
      expect(isNameField(field)).toBe(true);
      expect(() => assertNotNameField(field)).toThrow(/business name/i);
    }
  });

  it("leaves every other writable Google field alone", () => {
    for (const field of [
      "description",
      "profile.description",
      "services",
      "serviceItems",
      "categories.primaryCategory",
      "categories.additionalCategories",
      "regularHours",
      "specialHours",
      "storefrontAddress",
      "websiteUri",
      "phoneNumbers",
      "attributes/wheelchair_accessible",
    ]) {
      expect(isNameField(field)).toBe(false);
      expect(() => assertNotNameField(field)).not.toThrow();
    }
  });

  it("explains the Google policy reason in plain language", () => {
    expect(() => assertNotNameField("business_title")).toThrow(/suspend/i);
    expect(() => assertNotNameField("business_title")).toThrow(/Google Business Profile/);
  });

  it("finds a name write nested anywhere in a payload, but allows resource names", () => {
    expect(() => assertPayloadWritesNoNameField({ title: "Best Plumber Chicago" })).toThrow(/business name/i);
    expect(() => assertPayloadWritesNoNameField({ regularHours: { title: "Best Plumber" } })).toThrow(/business name/i);
    expect(() => assertPayloadWritesNoNameField({ serviceItems: [{ label: { title: "x" } }] })).toThrow(/business name/i);
    expect(() => assertPayloadWritesNoNameField({
      categories: {
        primaryCategory: { name: "categories/plumber", displayName: "Plumber" },
        additionalCategories: [{ name: "categories/drainage_service" }],
      },
    })).not.toThrow();
    expect(() => assertPayloadWritesNoNameField({
      attributes: [{ name: "attributes/wheelchair_accessible", values: [true] }],
    })).not.toThrow();
  });
});

describe("business name changes can never be planned as a Google write", () => {
  it("rejects a direct business_title mutation even when fully approved", () => {
    expect(() => prepareProfileMutation(approvedSuggestion({
      target: "business_title",
      risk: "high",
      proposedValue: "Harbourview Physiotherapy | Best Physio Near Me",
    }), snapshot)).toThrow(/business name/i);
  });

  it("rejects the name target before any approval or preview state is considered", () => {
    expect(() => prepareProfileMutation(approvedSuggestion({
      target: "business_title",
      status: "ready_for_review",
      exactPreviewReady: false,
      approvedAt: undefined,
      approvedBy: undefined,
      factsConfirmedAt: undefined,
      factsConfirmedBy: undefined,
      proposedValue: "Keyword Stuffed Name",
    }), snapshot)).toThrow(/business name/i);
  });

  it("rejects a name write smuggled through another target's nested payload", () => {
    expect(() => prepareProfileMutation(approvedSuggestion({
      target: "hours",
      proposedValue: { title: "Harbourview Physio — Emergency Physio Near Me" },
    }), snapshot)).toThrow(/business name/i);

    expect(() => prepareProfileMutation(approvedSuggestion({
      target: "address",
      proposedValue: { locality: "Harbourview", title: "Best Physio Harbourview" },
    }), snapshot)).toThrow(/business name/i);

    expect(() => prepareProfileMutation(approvedSuggestion({
      target: "attributes",
      proposedValue: [{
        name: "attributes/wheelchair_accessible",
        values: [true],
        title: "Harbourview Best Physio",
      }],
    }), snapshot)).toThrow(/business name/i);
  });

  it("rejects an unknown target that still spells the name field", () => {
    expect(() => prepareProfileMutation(approvedSuggestion({
      target: "profile.title" as AuditFindingTarget,
      proposedValue: "Keyword Stuffed Name",
    }), snapshot)).toThrow(/business name/i);
  });

  it("blocks the name at the approval-policy layer too", () => {
    expect(approvalPolicyFor("business_title")).toMatchObject({
      risk: "high",
      canExecuteAfterApproval: false,
    });
    expect(() => assertApprovedForExecution({
      target: "business_title",
      approvedAt: "2026-07-19T10:05:00.000Z",
      approvedBy: "Owner",
      factsConfirmed: true,
    })).toThrow(/business name/i);
    expect(approvalPolicyFor("description").canExecuteAfterApproval).toBe(true);
  });
});

describe("every other approved profile edit still plans normally", () => {
  it("plans a description edit", () => {
    expect(prepareProfileMutation(approvedSuggestion(), snapshot)).toMatchObject({
      surface: "location",
      updateMask: ["profile.description"],
      requestBody: { profile: { description: "A precise new description" } },
    });
  });

  it("plans a services edit", () => {
    const plan = prepareProfileMutation(approvedSuggestion({
      target: "services",
      proposedValue: [{
        source: "free_form",
        name: "Sports physiotherapy",
        categoryName: "categories/physical_therapist",
      }],
    }), snapshot);
    expect(plan.updateMask).toEqual(["serviceItems"]);
    expect(plan.requestBody).toEqual({
      serviceItems: [{
        freeFormServiceItem: {
          category: "categories/physical_therapist",
          label: { displayName: "Sports physiotherapy" },
        },
      }],
    });
  });

  it("plans primary and additional category edits", () => {
    expect(prepareProfileMutation(approvedSuggestion({
      target: "primary_category",
      proposedValue: { name: "categories/chiropractor", displayName: "Chiropractor" },
    }), snapshot)).toMatchObject({
      updateMask: ["categories.primaryCategory"],
      requestBody: { categories: { primaryCategory: { name: "categories/chiropractor", displayName: "Chiropractor" } } },
    });

    expect(prepareProfileMutation(approvedSuggestion({
      target: "additional_categories",
      proposedValue: [{ name: "categories/sports_massage_therapist" }],
    }), snapshot).updateMask).toEqual(["categories.additionalCategories"]);
  });

  it("plans an hours edit", () => {
    const plan = prepareProfileMutation(approvedSuggestion({
      target: "hours",
      proposedValue: {
        periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }],
      },
    }), snapshot);
    expect(plan.updateMask).toEqual(["regularHours"]);
    expect(plan.requestBody).toMatchObject({ regularHours: { periods: expect.any(Array) } });
  });

  it("plans an attributes edit", () => {
    expect(prepareProfileMutation(approvedSuggestion({
      target: "attributes",
      proposedValue: [{ name: "attributes/wheelchair_accessible", values: [true] }],
    }), snapshot)).toMatchObject({
      surface: "attributes",
      updateMask: ["attributes/wheelchair_accessible"],
    });
  });
});
