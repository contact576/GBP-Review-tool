import type {
  AuditEvidenceFact,
  LocalGrowthAudit,
  LocalGrowthAuditFinding,
  Location,
} from "@/lib/data/types";
import type { PlaceDetails } from "@/lib/google/places";

/**
 * Profile audit built from PUBLIC Google data (Places Place Details).
 *
 * `buildLocalGrowthAudit` needs a Business Profile snapshot, which requires
 * Google to approve the Business Profile APIs for the project. Until that lands
 * a workspace had no score, no findings and nothing to do. This engine produces
 * the same `LocalGrowthAudit` shape from what Places exposes publicly, so the
 * dashboard, This Week and the suggestion inbox all work with only
 * GOOGLE_MAPS_API_KEY configured.
 *
 * Honesty rules:
 *  - every check below reads a field actually present in the Places response;
 *  - checks Places CANNOT see (posts, Q&A, review replies, search keywords,
 *    special hours, service catalog) are emitted as `blocked` findings naming
 *    the Business Profile connection as the blocker — never as passes;
 *  - `applicableProfileScore` is scored ONLY over the checks Places can see, so
 *    it never implies knowledge of the fields it cannot read.
 */

/** One public-data check. `weight` drives both score and priority. */
interface Check {
  key: string;
  target: LocalGrowthAuditFinding["target"];
  /** Human label used in the finding title. */
  label: string;
  weight: number;
  /** True when the profile satisfies this check. */
  passed: boolean;
  severity: LocalGrowthAuditFinding["severity"];
  impact: LocalGrowthAuditFinding["expectedImpact"];
  /** What the audit observed, in plain words. */
  evidence: string;
  /** What the owner should do about it. */
  action: string;
  currentValue?: unknown;
  /** Owner must confirm a real-world fact before anything is proposed. */
  requiresOwnerFacts: boolean;
  evidenceField: string;
}

/** Checks Places cannot answer. Listed so they read as unknown, not as passing. */
const BUSINESS_PROFILE_ONLY: Array<{
  key: string;
  target: LocalGrowthAuditFinding["target"];
  title: string;
  rationale: string;
  severity: LocalGrowthAuditFinding["severity"];
  impact: LocalGrowthAuditFinding["expectedImpact"];
  priority: number;
}> = [
  {
    key: "review_replies",
    target: "owner_reply",
    title: "Review replies can't be checked yet",
    rationale:
      "Public Google data does not say which reviews you have replied to. Reply coverage is one of the strongest trust signals, so this stays unknown until the Business Profile connection is approved.",
    severity: "high",
    impact: "trust",
    priority: 74,
  },
  {
    key: "local_posts",
    target: "local_post",
    title: "Google post activity can't be checked yet",
    rationale:
      "Posts are not exposed in public Google data. Whether your profile has recent posts stays unknown until Business Profile access is approved.",
    severity: "medium",
    impact: "discovery",
    priority: 56,
  },
  {
    key: "questions",
    target: "qna_answer",
    title: "Questions & answers can't be checked yet",
    rationale:
      "Public Google data does not expose the Q&A on your profile, so unanswered customer questions cannot be detected yet.",
    severity: "medium",
    impact: "trust",
    priority: 52,
  },
  {
    key: "services",
    target: "services",
    title: "Your service list can't be checked yet",
    rationale:
      "The structured service catalog on your Google profile is only readable through the Business Profile API. It is not in public Places data.",
    severity: "medium",
    impact: "discovery",
    priority: 50,
  },
  {
    key: "special_hours",
    target: "special_hours",
    title: "Holiday hours can't be checked yet",
    rationale:
      "Special/holiday hours are not published in public Google data, so gaps over holidays cannot be detected yet.",
    severity: "low",
    impact: "conversion",
    priority: 30,
  },
];

const RECENCY_STALE_DAYS = 60;
const PHOTO_TARGET = 10;

function daysBetween(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((nowMs - then) / 86_400_000));
}

function buildChecks(details: PlaceDetails, nowMs: number): Check[] {
  const lastReviewDays = daysBetween(
    details.reviews
      .map((review) => review.publishedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop(),
    nowMs,
  );

  const checks: Check[] = [
    {
      key: "website",
      target: "website",
      label: "website link",
      weight: 5,
      passed: Boolean(details.websiteUri),
      severity: "high",
      impact: "conversion",
      evidence: details.websiteUri
        ? `Your listing links to ${details.websiteUri}.`
        : "Your Google listing has no website link, so people who find you cannot click through to book or browse.",
      action: "Add your website in Google Business Profile, then re-sync.",
      currentValue: details.websiteUri,
      requiresOwnerFacts: true,
      evidenceField: "places.website",
    },
    {
      key: "phone",
      target: "phone",
      label: "phone number",
      weight: 5,
      passed: Boolean(details.phone),
      severity: "critical",
      impact: "conversion",
      evidence: details.phone
        ? `Your listing publishes ${details.phone}.`
        : "No phone number is published on your Google listing — the call button is the single most-used action on a local profile.",
      action: "Add your public phone number in Google Business Profile.",
      currentValue: details.phone,
      requiresOwnerFacts: true,
      evidenceField: "places.phone",
    },
    {
      key: "hours",
      target: "hours",
      label: "opening hours",
      weight: 5,
      passed: details.hasHours && details.openDayCount >= 7,
      severity: details.hasHours ? "medium" : "critical",
      impact: "conversion",
      evidence: !details.hasHours
        ? "No opening hours are published. Google down-ranks profiles it cannot show as open, and 'open now' searches skip you entirely."
        : details.openDayCount < 7
          ? `Only ${details.openDayCount} of 7 days have published hours, so searches for the missing days skip you.`
          : "All seven days have published hours.",
      action: "Set hours for every day of the week, including days you are closed.",
      currentValue: { hasHours: details.hasHours, days: details.openDayCount },
      requiresOwnerFacts: true,
      evidenceField: "places.hours",
    },
    {
      key: "photos",
      target: "media",
      label: "photos",
      weight: 4,
      passed: details.photoCount >= PHOTO_TARGET,
      severity: details.photoCount === 0 ? "high" : "medium",
      impact: "discovery",
      evidence:
        details.photoCount === 0
          ? "Your listing has no photos. Profiles with photos get substantially more direction requests and clicks."
          : `Your listing has ${details.photoCount} photo${details.photoCount === 1 ? "" : "s"} — aim for at least ${PHOTO_TARGET} showing your space, team and work.`,
      action: `Upload original photos until you have at least ${PHOTO_TARGET}.`,
      currentValue: details.photoCount,
      requiresOwnerFacts: false,
      evidenceField: "places.photos",
    },
    {
      key: "description",
      target: "description",
      label: "business description",
      weight: 3,
      passed: Boolean(details.editorialSummary),
      severity: "medium",
      impact: "profile",
      evidence: details.editorialSummary
        ? "Google publishes a summary for your listing."
        : "No description is showing on your public listing — this is where you explain what you do and who you serve.",
      action: "Write a description in Google Business Profile, or add one in Settings → Business so Foundly can draft it.",
      currentValue: details.editorialSummary,
      requiresOwnerFacts: true,
      evidenceField: "places.description",
    },
    {
      key: "categories",
      target: "additional_categories",
      label: "category coverage",
      weight: 3,
      passed: details.types.length >= 3,
      severity: "medium",
      impact: "discovery",
      evidence:
        details.types.length >= 3
          ? `Google associates ${details.types.length} categories with your listing.`
          : `Google associates only ${details.types.length} categor${details.types.length === 1 ? "y" : "ies"} with your listing, so you surface for fewer searches.`,
      action: "Add every secondary category that genuinely describes services you offer.",
      currentValue: details.types,
      requiresOwnerFacts: true,
      evidenceField: "places.types",
    },
    {
      key: "review_volume",
      target: "keyword_coverage",
      label: "review volume",
      weight: 4,
      passed: details.reviewCount >= 25,
      severity: details.reviewCount < 10 ? "high" : "medium",
      impact: "trust",
      evidence:
        details.reviewCount === 0
          ? "You have no Google reviews yet. Review count is one of the heaviest local ranking factors."
          : `You have ${details.reviewCount} Google review${details.reviewCount === 1 ? "" : "s"}. Businesses that outrank you locally typically carry 25 or more.`,
      action: "Send review requests after every job — this is what Foundly automates.",
      currentValue: details.reviewCount,
      requiresOwnerFacts: false,
      evidenceField: "places.review_count",
    },
    {
      key: "review_recency",
      target: "keyword_coverage",
      label: "review freshness",
      weight: 4,
      passed: lastReviewDays !== null && lastReviewDays <= RECENCY_STALE_DAYS,
      severity: "high",
      impact: "trust",
      evidence:
        lastReviewDays === null
          ? "No recent review dates are visible, so review freshness cannot be confirmed."
          : lastReviewDays <= RECENCY_STALE_DAYS
            ? `Your most recent review landed ${lastReviewDays} day${lastReviewDays === 1 ? "" : "s"} ago.`
            : `Your most recent visible review is ${lastReviewDays} days old. A steady trickle of fresh reviews matters more to Google than a large old pile.`,
      action: "Keep a steady flow of new reviews rather than bursts.",
      currentValue: lastReviewDays,
      requiresOwnerFacts: false,
      evidenceField: "places.review_recency",
    },
    {
      key: "rating",
      target: "keyword_coverage",
      label: "star rating",
      weight: 4,
      passed: details.rating >= 4.3,
      severity: details.rating > 0 && details.rating < 4 ? "high" : "medium",
      impact: "trust",
      evidence:
        details.reviewCount === 0
          ? "No rating yet — your first reviews will set it."
          : details.rating >= 4.3
            ? `Your ${details.rating.toFixed(1)}★ average is in the range customers trust.`
            : `Your ${details.rating.toFixed(1)}★ average sits below the ~4.3★ mark where customers stop shortlisting a business.`,
      action: "Resolve the causes behind low ratings, then rebuild the average with fresh happy-customer reviews.",
      currentValue: details.rating,
      requiresOwnerFacts: false,
      evidenceField: "places.rating",
    },
    {
      key: "business_status",
      target: "business_title",
      label: "listing status",
      weight: 5,
      passed: !details.businessStatus || details.businessStatus === "OPERATIONAL",
      severity: "critical",
      impact: "conversion",
      evidence:
        details.businessStatus && details.businessStatus !== "OPERATIONAL"
          ? `Google marks this listing as ${details.businessStatus.replace(/_/g, " ").toLowerCase()}. Customers searching for you are being told you are not open.`
          : "Google lists this business as operational.",
      action: "Correct the listing status in Google Business Profile immediately.",
      currentValue: details.businessStatus,
      requiresOwnerFacts: true,
      evidenceField: "places.business_status",
    },
  ];

  return checks;
}

/** Score over the checks Places can actually see, weighted by importance. */
export function publicProfileScore(checks: Check[]): number {
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  if (total === 0) return 0;
  const earned = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  return Math.round((earned / total) * 100);
}

export function buildPublicProfileAudit(input: {
  location: Location;
  details: PlaceDetails;
  nowIso: string;
}): LocalGrowthAudit {
  const { location, details, nowIso } = input;
  const nowMs = new Date(nowIso).getTime();
  const checks = buildChecks(details, nowMs);
  const sourceRef = details.mapsUri;

  const evidence: AuditEvidenceFact[] = checks.map((check, index) => ({
    id: `ev_places_${check.key}_${index + 1}`,
    source: "google_profile",
    field: check.evidenceField,
    value: check.currentValue,
    observedAt: nowIso,
    // Places is authoritative for what the PUBLIC listing shows, which is
    // exactly what these checks assert.
    confidence: 1,
    authoritative: true,
    sourceRef,
  }));
  const evidenceByKey = new Map(checks.map((check, index) => [check.key, evidence[index]!.id]));

  const findings: LocalGrowthAuditFinding[] = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      id: `finding_places_${check.key}`,
      target: check.target,
      title: findingTitle(check),
      rationale: `${check.evidence} ${check.action}`,
      evidenceIds: [evidenceByKey.get(check.key)!],
      status: "open",
      severity: check.severity,
      priorityScore: Math.min(100, check.weight * 12 + (check.severity === "critical" ? 30 : check.severity === "high" ? 18 : 6)),
      confidence: 1,
      expectedImpact: check.impact,
      currentValue: check.currentValue,
      requiresOwnerFacts: check.requiresOwnerFacts,
      blockers: [],
      createdAt: nowIso,
    }));

  // Everything the public API cannot see, stated as unknown rather than passing.
  findings.push(
    ...BUSINESS_PROFILE_ONLY.map((item) => ({
      id: `finding_places_unknown_${item.key}`,
      target: item.target,
      title: item.title,
      rationale: item.rationale,
      evidenceIds: [],
      status: "blocked" as const,
      severity: item.severity,
      priorityScore: item.priority,
      confidence: 1,
      expectedImpact: item.impact,
      requiresOwnerFacts: false,
      blockers: ["Connect Google Business Profile — public Google data does not expose this."],
      createdAt: nowIso,
    })),
  );

  findings.sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));

  return {
    id: `audit_places_${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}`,
    schemaVersion: 1,
    workspaceId: location.workspaceId,
    locationId: location.id,
    generatedAt: nowIso,
    profileSnapshotAt: nowIso,
    applicableProfileScore: publicProfileScore(checks),
    summary: {
      openFindings: findings.filter((finding) => finding.status === "open").length,
      criticalFindings: findings.filter((finding) => finding.severity === "critical").length,
      blockedFindings: findings.filter((finding) => finding.status === "blocked").length,
      conflicts: 0,
      evidenceFacts: evidence.length,
    },
    sourceCoverage: {
      // Places gives the public listing and the aggregate review figures only.
      google_profile: "partial",
      google_reviews: "partial",
      google_media: "partial",
      google_posts: "not_connected",
      google_qna: "not_connected",
      google_search_keywords: "not_connected",
      website: "not_connected",
      instagram: "not_connected",
      search_console: "not_connected",
    },
    evidence,
    conflicts: [],
    findings,
  };
}

function findingTitle(check: Check): string {
  switch (check.key) {
    case "website": return "Add your website to your Google listing";
    case "phone": return "Add a phone number to your Google listing";
    case "hours": return "Publish hours for every day of the week";
    case "photos": return "Add more photos to your Google listing";
    case "description": return "Add a business description";
    case "categories": return "Add more categories that describe what you do";
    case "review_volume": return "Build your review count";
    case "review_recency": return "Get fresh reviews coming in again";
    case "rating": return "Lift your star rating";
    case "business_status": return "Fix your listing status on Google";
    default: return `Improve your ${check.label}`;
  }
}
