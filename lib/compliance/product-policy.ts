/**
 * Product-wide safety rules for profile optimization and publication.
 *
 * These rules are deliberately independent of the UI and external providers so
 * every future executor, background worker, and API route shares the same
 * definition of "complete" and "approved".
 */

export type CapabilityStatus =
  | "complete"
  | "partial"
  | "missing"
  | "unknown"
  | "not_applicable";

export interface CapabilityAssessment {
  key: string;
  status: CapabilityStatus;
  /** Relative business importance. Defaults to 1. */
  weight?: number;
}
export interface CapabilityScore {
  score: number;
  applicableCount: number;
  completeCount: number;
  partialCount: number;
  missingCount: number;
  unknownCount: number;
  excludedCount: number;
}

const COMPLETION_VALUE: Record<Exclude<CapabilityStatus, "not_applicable">, number> = {
  complete: 1,
  partial: 0.5,
  missing: 0,
  unknown: 0,
};

/**
 * Score only capabilities Google says are applicable to this location.
 * Unsupported features never lower the score and cannot be filled merely to
 * make a percentage look better.
 */
export function scoreApplicableCapabilities(
  assessments: readonly CapabilityAssessment[],
): CapabilityScore {
  let earned = 0;
  let possible = 0;
  let completeCount = 0;
  let partialCount = 0;
  let missingCount = 0;
  let unknownCount = 0;
  let excludedCount = 0;

  for (const assessment of assessments) {
    if (assessment.status === "not_applicable") {
      excludedCount += 1;
      continue;
    }
    const weight = Number.isFinite(assessment.weight) && (assessment.weight ?? 0) > 0
      ? Number(assessment.weight)
      : 1;
    possible += weight;
    earned += COMPLETION_VALUE[assessment.status] * weight;
    if (assessment.status === "complete") completeCount += 1;
    if (assessment.status === "partial") partialCount += 1;
    if (assessment.status === "missing") missingCount += 1;
    if (assessment.status === "unknown") unknownCount += 1;
  }

  return {
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    applicableCount: assessments.length - excludedCount,
    completeCount,
    partialCount,
    missingCount,
    unknownCount,
    excludedCount,
  };
}

export type ProfileChangeTarget =
  | "business_title"
  | "primary_category"
  | "additional_categories"
  | "address"
  | "service_area"
  | "phone"
  | "website"
  | "description"
  | "hours"
  | "special_hours"
  | "services"
  | "attributes"
  | "action_links"
  | "media_upload"
  | "media_delete"
  | "local_post"
  | "owner_reply"
  | "qna_answer";

export type ChangeRisk = "low" | "medium" | "high";

export interface ApprovalPolicy {
  risk: ChangeRisk;
  requiresExplicitApproval: true;
  requiresFactConfirmation: boolean;
  canExecuteAfterApproval: boolean;
}

const HIGH_RISK = new Set<ProfileChangeTarget>([
  "business_title",
  "primary_category",
  "additional_categories",
  "address",
  "service_area",
  "phone",
  "website",
  "services",
]);

const MEDIUM_RISK = new Set<ProfileChangeTarget>([
  "description",
  "hours",
  "special_hours",
  "attributes",
  "action_links",
  "media_delete",
  "owner_reply",
  "qna_answer",
]);

/** No profile mutation may run before a human approves its exact diff. */
export function approvalPolicyFor(target: ProfileChangeTarget): ApprovalPolicy {
  const risk: ChangeRisk = HIGH_RISK.has(target)
    ? "high"
    : MEDIUM_RISK.has(target)
      ? "medium"
      : "low";
  return {
    risk,
    requiresExplicitApproval: true,
    requiresFactConfirmation: risk === "high",
    canExecuteAfterApproval: true,
  };
}

export function assertApprovedForExecution(input: {
  target: ProfileChangeTarget;
  approvedAt?: string;
  approvedBy?: string;
  factsConfirmed?: boolean;
}): void {
  const policy = approvalPolicyFor(input.target);
  if (!input.approvedAt || !input.approvedBy) {
    throw new Error("An explicit owner or manager approval is required before publication.");
  }
  if (policy.requiresFactConfirmation && input.factsConfirmed !== true) {
    throw new Error("This change requires the business facts to be confirmed before publication.");
  }
}
