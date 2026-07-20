import { describe, expect, it } from "vitest";
import { buildSuggestionInbox } from "@/lib/suggestions/inbox";
import type { LocalGrowthAudit, LocalGrowthAuditFinding } from "@/lib/data/types";

const now = "2026-07-19T12:00:00.000Z";

function finding(patch: Partial<LocalGrowthAuditFinding>): LocalGrowthAuditFinding {
  return {
    id: "finding_description",
    target: "description",
    title: "Complete business description",
    rationale: "The current description is partial.",
    evidenceIds: ["ev_description"],
    status: "open",
    severity: "medium",
    priorityScore: 72,
    confidence: 0.98,
    expectedImpact: "profile",
    requiresOwnerFacts: true,
    blockers: [],
    createdAt: now,
    ...patch,
  };
}

function audit(findings: LocalGrowthAuditFinding[]): LocalGrowthAudit {
  return {
    id: "audit_1",
    schemaVersion: 1,
    workspaceId: "ws",
    locationId: "loc",
    generatedAt: now,
    profileSnapshotAt: now,
    applicableProfileScore: 52,
    summary: { openFindings: 1, criticalFindings: 0, blockedFindings: 0, conflicts: 0, evidenceFacts: 1 },
    sourceCoverage: {
      google_profile: "connected",
      google_reviews: "connected",
      google_media: "connected",
      google_posts: "connected",
      google_qna: "connected",
      google_search_keywords: "connected",
      website: "not_connected",
      instagram: "not_connected",
      search_console: "not_connected",
    },
    evidence: [{ id: "ev_description", source: "google_profile", field: "description", value: "Short", observedAt: now, confidence: 1, authoritative: true }],
    conflicts: [],
    findings,
  };
}

describe("approval-first suggestion inbox", () => {
  it("never marks a workflow intent as ready to approve without an exact preview", () => {
    const suggestions = buildSuggestionInbox(audit([
      finding({ target: "local_post", suggestedValue: { action: "draft_local_post_from_verified_facts" }, requiresOwnerFacts: false }),
      finding({ id: "finding_media", target: "media", suggestedValue: { action: "request_service_specific_original_photos" }, requiresOwnerFacts: false }),
      finding({ id: "finding_services", target: "services", suggestedValue: { action: "verify_and_complete_service_catalog" } }),
    ]));

    expect(suggestions.map((suggestion) => suggestion.status)).toEqual([
      "needs_generation",
      "needs_asset",
      "needs_facts",
    ]);
    expect(suggestions.every((suggestion) => suggestion.exactPreviewReady === false)).toBe(true);
    expect(suggestions.some((suggestion) => suggestion.status === "ready_for_review")).toBe(false);
  });

  it("routes connection and contradiction findings to the correct next step", () => {
    const suggestions = buildSuggestionInbox(audit([
      finding({ id: "finding_source_website", target: "source_connection", status: "blocked", requiresOwnerFacts: false }),
      finding({ id: "finding_conflict_title", target: "business_title", status: "blocked", blockers: ["Owner confirmation required"] }),
    ]));

    expect(suggestions.find((suggestion) => suggestion.target === "source_connection")).toMatchObject({ status: "needs_connection", nextStep: "Connect source", risk: "low" });
    expect(suggestions.find((suggestion) => suggestion.target === "business_title")).toMatchObject({ status: "needs_facts", nextStep: "Confirm business facts", risk: "high" });
  });
});
