import type {
  AuditEvidenceConflict,
  AuditEvidenceFact,
  AuditFindingTarget,
  GbpProfileSnapshot,
  LocalGrowthAudit,
  LocalGrowthAuditFinding,
  Location,
  Review,
} from "@/lib/data/types";

type SourceCoverageValue = LocalGrowthAudit["sourceCoverage"][keyof LocalGrowthAudit["sourceCoverage"]];

const TARGET_BY_CAPABILITY: Record<string, AuditFindingTarget> = {
  business_title: "business_title",
  primary_category: "primary_category",
  additional_categories: "additional_categories",
  address_or_service_area: "address",
  phone: "phone",
  website: "website",
  description: "description",
  regular_hours: "hours",
  special_hours: "special_hours",
  services: "services",
  attributes: "attributes",
  action_links: "action_links",
  cover_media: "media",
  profile_media: "media",
  media_library: "media",
  local_posts: "local_post",
  questions: "qna_answer",
  review_replies: "owner_reply",
};

const EVIDENCE_FIELD_BY_CAPABILITY: Record<string, string> = {
  business_title: "profile.title",
  primary_category: "profile.categories.primary",
  additional_categories: "profile.categories.additional",
  address_or_service_area: "profile.address_or_service_area",
  phone: "profile.phone",
  website: "profile.website",
  description: "profile.description",
  regular_hours: "profile.regular_hours",
  special_hours: "profile.special_hours",
  services: "profile.services",
  attributes: "profile.attributes",
  action_links: "profile.attributes",
  cover_media: "profile.media",
  profile_media: "profile.media",
  media_library: "profile.media",
  local_posts: "profile.posts",
  questions: "profile.questions",
  review_replies: "profile.reviews",
};

const FACT_CONFIRMATION_TARGETS = new Set<AuditFindingTarget>([
  "business_title",
  "primary_category",
  "additional_categories",
  "address",
  "service_area",
  "phone",
  "website",
  "description",
  "hours",
  "special_hours",
  "services",
  "attributes",
  "action_links",
  "keyword_coverage",
]);

export function buildLocalGrowthAudit(input: {
  location: Location;
  snapshot: GbpProfileSnapshot;
  reviews: Review[];
  nowIso: string;
}): LocalGrowthAudit {
  const { location, snapshot, reviews, nowIso } = input;
  const evidence: AuditEvidenceFact[] = [];
  const evidenceByField = new Map<string, string[]>();
  let evidenceSequence = 0;

  const addEvidence = (
    source: AuditEvidenceFact["source"],
    field: string,
    value: unknown,
    authoritative: boolean,
    sourceRef?: string,
    confidence = 1,
  ) => {
    const id = `ev_${slug(field)}_${++evidenceSequence}`;
    evidence.push({ id, source, field, value, observedAt: snapshot.syncedAt, confidence, authoritative, sourceRef });
    evidenceByField.set(field, [...(evidenceByField.get(field) ?? []), id]);
    return id;
  };

  const google = snapshot.location;
  addEvidence("google_profile", "profile.title", google.title, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.categories.primary", google.categories?.primaryCategory, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.categories.additional", google.categories?.additionalCategories ?? [], true, snapshot.locationResource);
  addEvidence("google_profile", "profile.description", google.profile?.description, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.phone", google.phoneNumbers, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.website", google.websiteUri, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.address_or_service_area", {
    storefrontAddress: google.storefrontAddress,
    serviceArea: google.serviceArea,
  }, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.regular_hours", google.regularHours, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.special_hours", google.specialHours, true, snapshot.locationResource);
  addEvidence("google_profile", "profile.services", google.serviceItems ?? [], true, snapshot.locationResource);
  addEvidence("google_profile", "profile.attributes", snapshot.attributes, true, `${snapshot.locationResource}/attributes`);
  addEvidence("google_media", "profile.media", snapshot.media, true, snapshot.locationResource);
  addEvidence("google_posts", "profile.posts", snapshot.localPosts, true, snapshot.locationResource);
  addEvidence("google_qna", "profile.questions", snapshot.questions, true, snapshot.locationResource);
  addEvidence("google_reviews", "profile.reviews", {
    count: reviews.length,
    responseRate: snapshot.reviewResponseRate,
    unrepliedReviewIds: reviews.filter((review) => review.needsReply).map((review) => review.id),
  }, true, snapshot.locationResource);
  const keywordEvidenceId = addEvidence(
    "google_search_keywords",
    "performance.search_keywords",
    snapshot.searchKeywords,
    true,
    snapshot.locationResource,
  );
  const websiteEvidenceId = snapshot.externalEvidence?.website.status === "synced"
    ? addEvidence(
        "website",
        "website.facts",
        snapshot.externalEvidence.website.facts,
        false,
        snapshot.externalEvidence.website.finalUrl,
        0.85,
      )
    : undefined;
  const searchConsoleEvidenceId = snapshot.externalEvidence?.searchConsole.status === "synced"
    ? addEvidence(
        "search_console",
        "performance.search_console_queries",
        snapshot.externalEvidence.searchConsole.rows,
        true,
        snapshot.externalEvidence.searchConsole.siteUrl,
      )
    : undefined;
  const instagramEvidenceId = snapshot.externalEvidence?.instagram.status === "synced"
    ? addEvidence(
        "instagram",
        "instagram.profile_and_media",
        snapshot.externalEvidence.instagram,
        true,
        snapshot.externalEvidence.instagram.username
          ? `https://www.instagram.com/${snapshot.externalEvidence.instagram.username}/`
          : undefined,
      )
    : undefined;
  const pendingUpdateEvidenceId = addEvidence(
    "google_pending_update",
    "profile.google_updates",
    snapshot.googleUpdated,
    true,
    snapshot.locationResource,
  );

  const conflicts = [
    ...buildGoogleUpdateConflicts(snapshot, addEvidence, pendingUpdateEvidenceId),
    ...buildExternalEvidenceConflicts(snapshot, websiteEvidenceId, instagramEvidenceId),
  ];
  const findings: LocalGrowthAuditFinding[] = snapshot.capabilities.flatMap((capability) => {
    if (capability.status === "complete" || capability.status === "not_applicable") return [];
    const target = TARGET_BY_CAPABILITY[capability.key];
    if (!target) return [];
    const field = EVIDENCE_FIELD_BY_CAPABILITY[capability.key];
    const blocked = capability.status === "unknown";
    const currentValue = field ? evidence.find((fact) => fact.field === field)?.value : undefined;
    return [makeFinding({
      id: `finding_${slug(capability.key)}`,
      target,
      title: findingTitle(capability.label, capability.status),
      rationale: `${capability.evidence} ${recommendationGuardrail(target)}`,
      evidenceIds: field ? evidenceByField.get(field) ?? [] : [],
      status: blocked ? "blocked" : "open",
      severity: severityFor(capability.key, capability.status, capability.weight),
      priorityScore: priorityFor(capability.status, capability.weight, target),
      confidence: blocked ? 0 : 0.98,
      expectedImpact: impactFor(target),
      currentValue,
      suggestedValue: suggestedActionFor(capability.key, currentValue),
      requiresOwnerFacts: FACT_CONFIRMATION_TARGETS.has(target),
      blockers: blocked ? ["The required Google source was not readable in the latest sync."] : [],
      createdAt: nowIso,
    })];
  });

  findings.push(...keywordCoverageFindings(snapshot, [keywordEvidenceId, searchConsoleEvidenceId].filter((id): id is string => Boolean(id)), nowIso));
  findings.push(...connectionCoverageFindings(snapshot, nowIso));
  findings.push(...conflictFindings(conflicts, nowIso));
  findings.sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));

  const sourceCoverage: LocalGrowthAudit["sourceCoverage"] = {
    google_profile: "connected",
    google_reviews: "connected",
    google_media: coverageFromStatus(snapshot.sourceStatus.media),
    google_posts: coverageFromStatus(snapshot.sourceStatus.posts),
    google_qna: coverageFromStatus(snapshot.sourceStatus.questions),
    google_search_keywords: coverageFromStatus(snapshot.sourceStatus.searchKeywords),
    website: externalCoverage(snapshot.externalEvidence?.website.status),
    instagram: externalCoverage(snapshot.externalEvidence?.instagram.status),
    search_console: externalCoverage(snapshot.externalEvidence?.searchConsole.status),
  };
  const blockedFindings = findings.filter((finding) => finding.status === "blocked").length;
  return {
    id: `audit_${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}`,
    schemaVersion: 1,
    workspaceId: location.workspaceId,
    locationId: location.id,
    generatedAt: nowIso,
    profileSnapshotAt: snapshot.syncedAt,
    applicableProfileScore: snapshot.capabilityScore.score,
    summary: {
      openFindings: findings.filter((finding) => finding.status === "open").length,
      criticalFindings: findings.filter((finding) => finding.severity === "critical").length,
      blockedFindings,
      conflicts: conflicts.length,
      evidenceFacts: evidence.length,
    },
    sourceCoverage,
    evidence,
    conflicts,
    findings,
  };
}

function buildGoogleUpdateConflicts(
  snapshot: GbpProfileSnapshot,
  addEvidence: (
    source: AuditEvidenceFact["source"],
    field: string,
    value: unknown,
    authoritative: boolean,
    sourceRef?: string,
    confidence?: number,
  ) => string,
  generalEvidenceId: string,
): AuditEvidenceConflict[] {
  const updated = snapshot.googleUpdated;
  if (!updated) return [];
  const fields = new Set([...updated.diffMask, ...updated.pendingMask]);
  return [...fields].map((field) => {
    const currentId = addEvidence(
      "google_profile",
      `profile.current.${field}`,
      getPath(snapshot.location, field),
      true,
      snapshot.locationResource,
    );
    const updatedId = addEvidence(
      "google_pending_update",
      `profile.google_updated.${field}`,
      getPath(updated.location, field),
      true,
      snapshot.locationResource,
    );
    const pending = updated.pendingMask.includes(field);
    return {
      id: `conflict_${slug(field)}`,
      field,
      evidenceIds: [generalEvidenceId, currentId, updatedId],
      status: pending ? "google_pending" : "needs_owner_confirmation",
      explanation: pending
        ? `Google reports a pending edit to ${humanField(field)}. Wait for propagation before proposing another change.`
        : `Google reports a different value for ${humanField(field)}. The owner must confirm which value is accurate.`,
    };
  });
}

function conflictFindings(
  conflicts: AuditEvidenceConflict[],
  nowIso: string,
): LocalGrowthAuditFinding[] {
  return conflicts.map((conflict) => makeFinding({
    id: `finding_${conflict.id}`,
    target: targetForGoogleField(conflict.field),
    title: `Confirm ${humanField(conflict.field)} before changing it`,
    rationale: conflict.explanation,
    evidenceIds: conflict.evidenceIds,
    status: "blocked",
    severity: "high",
    priorityScore: 88,
    confidence: 1,
    expectedImpact: "trust",
    requiresOwnerFacts: true,
    blockers: ["Owner confirmation is required to resolve contradictory or pending Google information."],
    createdAt: nowIso,
  }));
}

function keywordCoverageFindings(
  snapshot: GbpProfileSnapshot,
  evidenceIds: string[],
  nowIso: string,
): LocalGrowthAuditFinding[] {
  const searchConsoleKeywords = snapshot.externalEvidence?.searchConsole.status === "synced"
    ? snapshot.externalEvidence.searchConsole.rows.map((row) => ({ keyword: row.query, impressions: row.impressions, threshold: undefined }))
    : [];
  const allKeywords = [...snapshot.searchKeywords, ...searchConsoleKeywords];
  if (allKeywords.length === 0) return [];
  const corpus = normalizeWords([
    snapshot.location.categories?.primaryCategory?.displayName,
    ...(snapshot.location.categories?.additionalCategories ?? []).map((category) => category.displayName ?? category.name),
    snapshot.location.profile?.description,
    ...(snapshot.location.serviceItems ?? []).flatMap((service) => [service.name, service.description]),
  ].filter((value): value is string => Boolean(value)).join(" "));
  const gaps = allKeywords
    .sort((a, b) => (b.impressions ?? b.threshold ?? 0) - (a.impressions ?? a.threshold ?? 0))
    .filter((entry) => keywordCoverage(entry.keyword, corpus) < 0.5)
    .slice(0, 5);
  if (!gaps.length) return [];
  return [makeFinding({
    id: "finding_keyword_coverage",
    target: "keyword_coverage",
    title: "Validate high-demand search themes against real services",
    rationale: "Google reports search phrases that are not clearly represented in the confirmed category, service, or description facts. Treat these as research—not text to stuff into the profile.",
    evidenceIds,
    status: "blocked",
    severity: "high",
    priorityScore: 82,
    confidence: 0.9,
    expectedImpact: "discovery",
    currentValue: gaps,
    requiresOwnerFacts: true,
    blockers: ["Confirm each search theme describes a service the business genuinely offers before proposing profile copy."],
    createdAt: nowIso,
  })];
}

function connectionCoverageFindings(
  snapshot: GbpProfileSnapshot,
  nowIso: string,
): LocalGrowthAuditFinding[] {
  const websiteUri = snapshot.location.websiteUri;
  const external = snapshot.externalEvidence;
  const findings: LocalGrowthAuditFinding[] = [];
  if (external?.website.status !== "synced") findings.push(
    makeFinding({
      id: "finding_source_website",
      target: "source_connection",
      title: "Website facts have not been cross-checked yet",
      rationale: websiteUri
        ? "The Google profile includes a website, but no website evidence snapshot has been collected yet."
        : "No website URL is available from the Google profile, so service and contact facts cannot be cross-checked.",
      evidenceIds: [],
      status: "blocked",
      severity: "high",
      priorityScore: 76,
      confidence: 1,
      expectedImpact: "trust",
      currentValue: websiteUri,
      requiresOwnerFacts: false,
      blockers: [external?.website.error ?? (websiteUri ? "Website ingestion is unavailable." : "A verified website URL is required.")],
      createdAt: nowIso,
    }),
  );
  if (external?.searchConsole.status !== "synced") findings.push(
    makeFinding({
      id: "finding_source_search_console",
      target: "source_connection",
      title: "Search Console query evidence is not connected",
      rationale: "Search Console is required to compare real website queries and landing pages with Google Business Profile coverage.",
      evidenceIds: [],
      status: "blocked",
      severity: "medium",
      priorityScore: 58,
      confidence: 1,
      expectedImpact: "discovery",
      requiresOwnerFacts: false,
      blockers: [external?.searchConsole.error ?? "Authorized Search Console access is required."],
      createdAt: nowIso,
    }),
  );
  if (external?.instagram.status !== "synced") findings.push(
    makeFinding({
      id: "finding_source_instagram",
      target: "source_connection",
      title: "Instagram offerings have not been compared",
      rationale: "Authorized Instagram evidence is needed before claiming that social posts contain services or products missing from Google.",
      evidenceIds: [],
      status: "blocked",
      severity: "low",
      priorityScore: 34,
      confidence: 1,
      expectedImpact: "profile",
      requiresOwnerFacts: false,
      blockers: [external?.instagram.error ?? "Authorized Instagram Business or Creator access is required."],
      createdAt: nowIso,
    }),
  );
  return findings;
}

function buildExternalEvidenceConflicts(
  snapshot: GbpProfileSnapshot,
  websiteEvidenceId: string | undefined,
  instagramEvidenceId: string | undefined,
): AuditEvidenceConflict[] {
  const conflicts: AuditEvidenceConflict[] = [];
  const website = snapshot.externalEvidence?.website;
  const google = snapshot.location;
  if (website?.status === "synced" && websiteEvidenceId) {
    const googlePhone = normalizedPhone(google.phoneNumbers?.primaryPhone);
    const websitePhones = website.facts.phones.map(normalizedPhone).filter(Boolean);
    if (googlePhone && websitePhones.length && !websitePhones.includes(googlePhone)) {
      conflicts.push({
        id: "conflict_external_phone",
        field: "phoneNumbers.primaryPhone",
        evidenceIds: [websiteEvidenceId],
        status: "needs_owner_confirmation",
        explanation: "The verified website publishes a different phone number from Google. Confirm the active customer-facing number before any update.",
      });
    }
    const googleName = normalizedWords(google.title);
    const websiteNames = website.facts.businessNames.map(normalizedWords).filter(Boolean);
    if (googleName && websiteNames.length && !websiteNames.some((name) => name.includes(googleName) || googleName.includes(name))) {
      conflicts.push({
        id: "conflict_external_business_name",
        field: "title",
        evidenceIds: [websiteEvidenceId],
        status: "needs_owner_confirmation",
        explanation: "The website's structured business name differs from the Google business name. Confirm the real-world name; do not add keywords.",
      });
    }
  }
  const instagram = snapshot.externalEvidence?.instagram;
  if (instagram?.status === "synced" && instagramEvidenceId && instagram.website && google.websiteUri) {
    try {
      if (new URL(instagram.website).hostname.replace(/^www\./, "") !== new URL(google.websiteUri).hostname.replace(/^www\./, "")) {
        conflicts.push({
          id: "conflict_instagram_website",
          field: "websiteUri",
          evidenceIds: [instagramEvidenceId],
          status: "needs_owner_confirmation",
          explanation: "The authorized Instagram profile links to a different website domain from Google. Confirm which destination is current.",
        });
      }
    } catch {
      // Invalid social website values are evidence quality issues, not publishable facts.
    }
  }
  return conflicts;
}

function makeFinding(finding: LocalGrowthAuditFinding): LocalGrowthAuditFinding {
  return finding;
}

function findingTitle(label: string, status: string): string {
  if (status === "unknown") return `Verify ${label.toLowerCase()} availability`;
  if (status === "partial") return `Complete ${label.toLowerCase()}`;
  return `Add or correct ${label.toLowerCase()}`;
}

function recommendationGuardrail(target: AuditFindingTarget): string {
  if (target === "business_title") return "Use only the real-world business name; never add ranking keywords.";
  if (FACT_CONFIRMATION_TARGETS.has(target)) return "Only verified business facts may be proposed or published.";
  if (target === "owner_reply") return "A reply may reference only facts present in the review and confirmed business context.";
  return "The exact change must be previewed and approved before publication.";
}

function suggestedActionFor(key: string, currentValue: unknown): unknown {
  if (key === "local_posts") return { action: "draft_local_post_from_verified_facts" };
  if (key === "cover_media") return { action: "request_or_select_cover_photo" };
  if (key === "profile_media") return { action: "request_or_select_profile_photo" };
  if (key === "media_library") return { action: "request_service_specific_original_photos" };
  if (key === "review_replies") return { action: "draft_faithful_owner_replies" };
  if (key === "questions") return { action: "draft_answers_from_verified_business_facts" };
  if (key === "services") return { action: "verify_and_complete_service_catalog", currentValue };
  return undefined;
}

function severityFor(
  key: string,
  status: string,
  weight: number,
): LocalGrowthAuditFinding["severity"] {
  if (status === "missing" && ["business_title", "primary_category", "address_or_service_area"].includes(key)) return "critical";
  if (status === "missing" && weight >= 3) return "high";
  if (status === "partial" && weight >= 3) return "medium";
  return "low";
}

function priorityFor(status: string, weight: number, target: AuditFindingTarget): number {
  const statusScore = status === "missing" ? 48 : status === "partial" ? 30 : 12;
  const impactScore = weight * 8;
  const conversionBoost = ["phone", "website", "address", "hours"].includes(target) ? 10 : 0;
  return Math.min(100, statusScore + impactScore + conversionBoost);
}

function impactFor(target: AuditFindingTarget): LocalGrowthAuditFinding["expectedImpact"] {
  if (["primary_category", "additional_categories", "services", "keyword_coverage", "local_post"].includes(target)) return "discovery";
  if (["phone", "website", "address", "service_area", "hours", "special_hours", "action_links"].includes(target)) return "conversion";
  if (["owner_reply", "qna_answer"].includes(target)) return "trust";
  return "profile";
}

function coverageFromStatus(status: GbpProfileSnapshot["sourceStatus"][keyof GbpProfileSnapshot["sourceStatus"]]): SourceCoverageValue {
  if (status === "synced") return "connected";
  if (status === "unavailable") return "unavailable";
  if (status === "not_authorized") return "partial";
  return "error";
}

function externalCoverage(
  status: GbpProfileSnapshot["externalEvidence"] extends infer Bundle
    ? Bundle extends { website: { status: infer Status } } ? Status | undefined : never
    : never,
): SourceCoverageValue {
  if (status === "synced") return "connected";
  if (status === "unavailable") return "unavailable";
  if (status === "not_authorized") return "partial";
  if (status === "error") return "error";
  return "not_connected";
}

function targetForGoogleField(field: string): AuditFindingTarget {
  if (/categor/i.test(field)) return /primary/i.test(field) ? "primary_category" : "additional_categories";
  if (/title/i.test(field)) return "business_title";
  if (/phone/i.test(field)) return "phone";
  if (/website/i.test(field)) return "website";
  if (/address/i.test(field)) return "address";
  if (/serviceArea/i.test(field)) return "service_area";
  if (/specialHours/i.test(field)) return "special_hours";
  if (/hours/i.test(field)) return "hours";
  if (/service/i.test(field)) return "services";
  if (/profile|description/i.test(field)) return "description";
  return "attributes";
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function humanField(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeWords(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 3),
  );
}

function normalizedWords(value: string | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function normalizedPhone(value: string | undefined): string {
  return value?.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") ?? "";
}

function keywordCoverage(keyword: string, corpus: Set<string>): number {
  const words = [...normalizeWords(keyword)];
  if (!words.length) return 1;
  return words.filter((word) => corpus.has(word)).length / words.length;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}
