import type {
  AuditFindingTarget,
  LocalGrowthAudit,
  LocalGrowthAuditFinding,
  ProfileSuggestion,
  ProfileSuggestionStatus,
} from "@/lib/data/types";

const HIGH_RISK = new Set<AuditFindingTarget>([
  "business_title",
  "primary_category",
  "additional_categories",
  "address",
  "service_area",
  "phone",
  "website",
  "services",
]);

const MEDIUM_RISK = new Set<AuditFindingTarget>([
  "description",
  "hours",
  "special_hours",
  "attributes",
  "action_links",
  "owner_reply",
  "qna_answer",
  "keyword_coverage",
]);

/**
 * Convert audit findings into an inbox without pretending a workflow intent is
 * an approvable diff. Only a later exact-preview builder can set
 * `ready_for_review` and `exactPreviewReady`.
 */
export function buildSuggestionInbox(audit: LocalGrowthAudit): ProfileSuggestion[] {
  return audit.findings
    .filter((finding) => finding.status === "open" || finding.status === "blocked")
    .map((finding) => suggestionFromFinding(audit, finding))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
}

const PRESERVED_WORKFLOW_STATES = new Set<ProfileSuggestionStatus>([
  "ready_for_review",
  "approved",
  "queued",
  "executing",
  "verification_pending",
  "applied",
  "failed",
  "dismissed",
]);

/**
 * A background audit must never erase an exact preview or in-flight approval.
 * Preserve workflow state only while the observed current value and linked
 * evidence are unchanged; otherwise invalidate the old preview safely.
 */
export function mergeSuggestionInbox(
  current: readonly ProfileSuggestion[],
  refreshed: readonly ProfileSuggestion[],
): ProfileSuggestion[] {
  const previous = new Map(current.map((suggestion) => [suggestion.id, suggestion]));
  return refreshed.map((next) => {
    const existing = previous.get(next.id);
    if (!existing || !PRESERVED_WORKFLOW_STATES.has(existing.status)) return next;
    const evidenceStable = [...existing.evidenceIds].sort().join("|") === [...next.evidenceIds].sort().join("|");
    const currentValueStable = stableJson(existing.currentValue) === stableJson(next.currentValue);
    if (!evidenceStable || !currentValueStable) return next;
    return {
      ...next,
      status: existing.status,
      proposedValue: existing.proposedValue,
      exactPreviewReady: existing.exactPreviewReady,
      blockers: existing.blockers,
      nextStep: existing.nextStep,
      createdAt: existing.createdAt,
      updatedAt: next.updatedAt,
      approvedAt: existing.approvedAt,
      approvedBy: existing.approvedBy,
      factsConfirmedAt: existing.factsConfirmedAt,
      factsConfirmedBy: existing.factsConfirmedBy,
    };
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function suggestionFromFinding(
  audit: LocalGrowthAudit,
  finding: LocalGrowthAuditFinding,
): ProfileSuggestion {
  const status = initialStatus(finding);
  const blocker = blockerForStatus(status);
  return {
    id: `suggestion_${finding.id.replace(/^finding_/, "")}`,
    workspaceId: audit.workspaceId,
    locationId: audit.locationId,
    auditId: audit.id,
    findingId: finding.id,
    target: finding.target,
    kind: kindFor(finding.target),
    title: finding.title,
    rationale: finding.rationale,
    priorityScore: finding.priorityScore,
    risk: HIGH_RISK.has(finding.target) ? "high" : MEDIUM_RISK.has(finding.target) ? "medium" : "low",
    status,
    currentValue: finding.currentValue,
    proposedValue: finding.suggestedValue,
    exactPreviewReady: false,
    evidenceIds: finding.evidenceIds,
    blockers: [...new Set([...finding.blockers, ...(blocker ? [blocker] : [])])],
    nextStep: nextStepFor(status, finding.target),
    createdAt: finding.createdAt,
    updatedAt: audit.generatedAt,
  };
}

function initialStatus(finding: LocalGrowthAuditFinding): ProfileSuggestionStatus {
  if (finding.target === "source_connection") return "needs_connection";
  if (finding.target === "keyword_coverage") return "needs_facts";
  if (finding.status === "blocked") return finding.requiresOwnerFacts ? "needs_facts" : "needs_evidence";
  if (finding.target === "media") return "needs_asset";
  if (finding.target === "local_post" || finding.target === "owner_reply") return "needs_generation";
  if (finding.target === "qna_answer") return "needs_facts";
  if (finding.requiresOwnerFacts) return "needs_facts";
  return "needs_generation";
}

function blockerForStatus(status: ProfileSuggestionStatus): string | undefined {
  if (status === "needs_connection") return "Connect or authorize the evidence source before analysis can continue.";
  if (status === "needs_evidence") return "Resolve the evidence conflict or source error before a change can be prepared.";
  if (status === "needs_facts") return "Confirm the underlying business facts before Foundly prepares exact copy or values.";
  if (status === "needs_asset") return "Select or upload the exact original asset before approval.";
  if (status === "needs_generation") return "Generate and review the exact proposed content before approval.";
  return undefined;
}

function nextStepFor(status: ProfileSuggestionStatus, target: AuditFindingTarget): string {
  if (status === "needs_connection") return "Connect source";
  if (status === "needs_evidence") return "Review evidence";
  if (status === "needs_facts") return target === "keyword_coverage" ? "Confirm real services" : "Confirm business facts";
  if (status === "needs_asset") return "Choose original photo";
  if (status === "needs_generation") return target === "owner_reply" ? "Prepare reply" : "Prepare exact preview";
  if (status === "ready_for_review") return "Review exact change";
  return "View status";
}

function kindFor(target: AuditFindingTarget): ProfileSuggestion["kind"] {
  if (target === "local_post") return "local_post";
  if (target === "media") return "media";
  if (target === "owner_reply") return "owner_reply";
  if (target === "qna_answer") return "qna";
  if (target === "keyword_coverage") return "research";
  if (target === "source_connection") return "connection";
  return "profile_edit";
}

export function suggestionStatusLabel(status: ProfileSuggestionStatus): string {
  switch (status) {
    case "needs_connection": return "Connection needed";
    case "needs_evidence": return "Evidence needed";
    case "needs_facts": return "Facts needed";
    case "needs_asset": return "Photo needed";
    case "needs_generation": return "Preview needed";
    case "ready_for_review": return "Ready to review";
    case "approved": return "Approved";
    case "queued": return "Queued";
    case "executing": return "Applying";
    case "verification_pending": return "Verifying with Google";
    case "applied": return "Applied";
    case "failed": return "Needs attention";
    case "dismissed": return "Dismissed";
  }
}
