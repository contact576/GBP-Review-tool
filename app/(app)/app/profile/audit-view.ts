import { capabilityFindingId } from "@/lib/audit/engine";
import type {
  GbpCapabilityStatus,
  GbpProfileSnapshot,
  LocalGrowthAudit,
  LocalGrowthAuditFinding,
  ProfileSuggestion,
} from "@/lib/data/types";

/**
 * Pure view-model for the Profile Audit surface.
 *
 * Everything here is derived from the audit the app already produced — nothing
 * is asserted about a field the audit did not actually observe. The two data
 * shapes it must survive are:
 *
 *  1. the Places-derived audit (today, because the Business Profile API is not
 *     yet approved for the Cloud project), and
 *  2. the far richer Business Profile audit (automatically, once it is).
 */

export type FindingBucket = "missing" | "stale" | "blocked";

/** Which upstream produced the audit we are rendering. */
export type AuditSource = "business_profile" | "public_places";

export interface FindingRowModel {
  finding: LocalGrowthAuditFinding;
  bucket: FindingBucket;
  /** Matching inbox entry, when one exists for this finding. */
  suggestion?: ProfileSuggestion;
  /** Set when the row represents an evidence conflict rather than a gap. */
  conflictExplanation?: string;
}

/** Empty in the "there is genuinely nothing there" sense, not "falsy". */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return value === 0;
  if (typeof value === "boolean") return value === false;
  if (Array.isArray(value)) return value.length === 0 || value.every((item) => isEmptyValue(item));
  if (typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    return values.length === 0 || values.every((item) => isEmptyValue(item));
  }
  return false;
}

/**
 * Capability status per finding id, when a Business Profile snapshot exists.
 * This is the precise signal for "absent entirely" vs "there but incomplete";
 * without a snapshot we fall back to the observed value.
 */
export function capabilityStatusByFinding(
  snapshot: GbpProfileSnapshot | undefined,
): Map<string, GbpCapabilityStatus> {
  const map = new Map<string, GbpCapabilityStatus>();
  for (const capability of snapshot?.capabilities ?? []) {
    map.set(capabilityFindingId(capability.key), capability.status);
  }
  return map;
}

/** Missing = the field is absent. Stale = it exists but is incomplete or wrong. */
export function classifyOpenFinding(
  finding: LocalGrowthAuditFinding,
  capabilityStatus?: GbpCapabilityStatus,
): Exclude<FindingBucket, "blocked"> {
  if (capabilityStatus === "missing") return "missing";
  if (capabilityStatus === "partial") return "stale";
  if (finding.currentValue !== undefined) {
    return isEmptyValue(finding.currentValue) ? "missing" : "stale";
  }
  // No observed value at all — the audit only ever writes titles it derived, so
  // the verb it chose is the last honest hint we have.
  return /^add\b/i.test(finding.title) ? "missing" : "stale";
}

export interface ProfileAuditView {
  source: AuditSource;
  /** ISO timestamp of the profile data the audit read. */
  observedAt: string;
  missing: FindingRowModel[];
  stale: FindingRowModel[];
  blocked: FindingRowModel[];
}

/**
 * Split an audit into the three owner-facing buckets.
 *
 * Conflict findings (`finding_conflict_*`) are routed into "Needs updating"
 * rather than "Can't check yet": the value exists on Google, it just disagrees
 * with another source the owner has to settle.
 */
export function buildProfileAuditView(input: {
  audit: LocalGrowthAudit;
  snapshot?: GbpProfileSnapshot;
  suggestions: ProfileSuggestion[];
}): ProfileAuditView {
  const { audit, snapshot, suggestions } = input;
  const statusByFinding = capabilityStatusByFinding(snapshot);
  const suggestionByFinding = new Map(
    suggestions
      .filter((suggestion) => suggestion.status !== "dismissed")
      .map((suggestion) => [suggestion.findingId, suggestion]),
  );
  const conflictExplanationByFinding = new Map(
    audit.conflicts.map((conflict) => [`finding_${conflict.id}`, conflict.explanation]),
  );

  const missing: FindingRowModel[] = [];
  const stale: FindingRowModel[] = [];
  const blocked: FindingRowModel[] = [];

  for (const finding of audit.findings) {
    if (finding.status === "resolved" || finding.status === "dismissed") continue;
    const row: FindingRowModel = {
      finding,
      bucket: "blocked",
      suggestion: suggestionByFinding.get(finding.id),
      conflictExplanation: conflictExplanationByFinding.get(finding.id),
    };
    if (row.conflictExplanation) {
      stale.push({ ...row, bucket: "stale" });
      continue;
    }
    if (finding.status === "blocked") {
      blocked.push(row);
      continue;
    }
    const bucket = classifyOpenFinding(finding, statusByFinding.get(finding.id));
    (bucket === "missing" ? missing : stale).push({ ...row, bucket });
  }

  const byPriority = (a: FindingRowModel, b: FindingRowModel) =>
    b.finding.priorityScore - a.finding.priorityScore ||
    a.finding.title.localeCompare(b.finding.title);

  missing.sort(byPriority);
  stale.sort(byPriority);
  blocked.sort(byPriority);

  return {
    source: snapshot ? "business_profile" : "public_places",
    observedAt: snapshot?.syncedAt ?? audit.profileSnapshotAt ?? audit.generatedAt,
    missing,
    stale,
    blocked,
  };
}

/**
 * True when a blocker is the un-approved Business Profile API rather than
 * something the owner can act on. Kept explicit so the UI can say so plainly.
 */
export function isBusinessProfileAccessBlocker(blocker: string): boolean {
  return /business profile/i.test(blocker);
}

export const SOURCE_LABELS: Record<keyof LocalGrowthAudit["sourceCoverage"], string> = {
  google_profile: "Google Business Profile",
  google_reviews: "Google reviews",
  google_media: "Google photos",
  google_posts: "Google posts",
  google_qna: "Google Q&A",
  google_search_keywords: "Google search terms",
  website: "Your website",
  instagram: "Instagram",
  search_console: "Search Console",
};

/** Plain-English meaning of each coverage state, owner-facing. */
export const COVERAGE_MEANING: Record<
  LocalGrowthAudit["sourceCoverage"][keyof LocalGrowthAudit["sourceCoverage"]],
  string
> = {
  connected: "Read in full — checks against this source are trustworthy.",
  partial: "Only part of this is readable, so some checks stay unknown.",
  not_connected: "Not connected — nothing here has been checked.",
  unavailable: "Google did not return this data on the last sync.",
  error: "The last read failed, so these checks were skipped.",
};

export const IMPACT_LABELS: Record<LocalGrowthAuditFinding["expectedImpact"], string> = {
  profile: "Profile completeness",
  discovery: "Being found",
  conversion: "Getting contacted",
  trust: "Trust",
};
