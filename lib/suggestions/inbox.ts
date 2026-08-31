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

/** Plain words an owner would use for the thing a finding is about. */
const THING: Record<AuditFindingTarget, string> = {
  business_title: "business name",
  primary_category: "main category",
  additional_categories: "extra categories",
  address: "address",
  service_area: "service area",
  phone: "phone number",
  website: "website link",
  description: "business description",
  hours: "opening hours",
  special_hours: "holiday hours",
  services: "service list",
  attributes: "profile details",
  action_links: "booking and ordering links",
  media: "photos",
  local_post: "Google posts",
  owner_reply: "review replies",
  qna_answer: "questions and answers",
  keyword_coverage: "search wording",
  source_connection: "connected sources",
};

/** Which sync source has to be readable before a finding can be believed. */
const SOURCE_FOR: Record<AuditFindingTarget, keyof LocalGrowthAudit["sourceCoverage"]> = {
  business_title: "google_profile",
  primary_category: "google_profile",
  additional_categories: "google_profile",
  address: "google_profile",
  service_area: "google_profile",
  phone: "google_profile",
  website: "google_profile",
  description: "google_profile",
  hours: "google_profile",
  special_hours: "google_profile",
  services: "google_profile",
  attributes: "google_profile",
  action_links: "google_profile",
  media: "google_media",
  local_post: "google_posts",
  owner_reply: "google_reviews",
  qna_answer: "google_qna",
  keyword_coverage: "google_search_keywords",
  source_connection: "google_profile",
};

/**
 * How much work the owner has to do. This is half of the ordering rule: at a
 * similar level of importance, the change they can make in two minutes should
 * be the one at the top of the list.
 */
type Effort = "quick" | "some" | "heavy";

const EFFORT: Record<AuditFindingTarget, Effort> = {
  business_title: "quick",
  primary_category: "quick",
  additional_categories: "quick",
  address: "quick",
  service_area: "quick",
  phone: "quick",
  website: "quick",
  hours: "quick",
  special_hours: "quick",
  attributes: "quick",
  action_links: "quick",
  owner_reply: "quick",
  qna_answer: "quick",
  description: "some",
  services: "some",
  local_post: "some",
  media: "heavy",
  keyword_coverage: "heavy",
  source_connection: "some",
};

/**
 * Three ordering bands, highest first.
 *
 * `actionable` — we read the real value and the owner can change it now.
 * `connection` — a one-off setup step that unlocks more checking.
 * `not_measured` — we could NOT read this. It sits at the bottom because there
 *   is no profile work in it, and it must never outrank a real observation.
 */
type Band = "actionable" | "connection" | "not_measured";

const BAND_BASE: Record<Band, number> = { actionable: 55, connection: 30, not_measured: 5 };

/**
 * Convert audit findings into an inbox without pretending a workflow intent is
 * an approvable diff. Only a later exact-preview builder can set
 * `ready_for_review` and `exactPreviewReady`.
 *
 * Three product rules live here rather than in the audit engines:
 *  1. ordering is impact-per-effort, so the single most worthwhile thing an
 *     owner can do today is first;
 *  2. every string is written for a non-technical owner, and never promises a
 *     result, a ranking or a customer;
 *  3. a finding whose source could not be read is presented as "we could not
 *     check this", never as a zero — and it carries no current or proposed
 *     value, because we do not have one.
 */
export function buildSuggestionInbox(audit: LocalGrowthAudit): ProfileSuggestion[] {
  const facts = readFacts(audit);
  return audit.findings
    .filter((finding) => finding.status === "open" || finding.status === "blocked")
    .map((finding) => ({ finding, suggestion: suggestionFromFinding(audit, finding, facts) }))
    .sort((a, b) =>
      b.suggestion.priorityScore - a.suggestion.priorityScore
      || b.finding.priorityScore - a.finding.priorityScore
      || a.suggestion.id.localeCompare(b.suggestion.id))
    .map((entry) => entry.suggestion);
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
  facts: AuditFacts,
): ProfileSuggestion {
  const gap = measurementGap(audit, finding);
  const status = initialStatus(finding, gap);
  const band: Band = gap ? "not_measured" : finding.target === "source_connection" ? "connection" : "actionable";
  const copy = gap
    ? notMeasuredCopy(finding, gap)
    : finding.target === "source_connection"
      ? connectionCopy(finding)
      : ownerCopy(finding, facts);
  const proposedValue = gap
    ? undefined
    : finding.target === "local_post"
      ? localPostBrief(facts)
      : finding.suggestedValue;
  return {
    id: `suggestion_${finding.id.replace(/^finding_/, "")}`,
    workspaceId: audit.workspaceId,
    locationId: audit.locationId,
    auditId: audit.id,
    findingId: finding.id,
    target: finding.target,
    kind: kindFor(finding.target),
    title: copy.title,
    rationale: copy.rationale,
    priorityScore: priorityFor(band, finding),
    risk: HIGH_RISK.has(finding.target) ? "high" : MEDIUM_RISK.has(finding.target) ? "medium" : "low",
    status,
    // A value we could not read is not a value. Never pass a zero downstream.
    currentValue: gap ? undefined : finding.currentValue,
    proposedValue,
    exactPreviewReady: false,
    evidenceIds: finding.evidenceIds,
    blockers: [...new Set([
      ...(gap ? [gap] : []),
      ...finding.blockers,
      ...(gap ? [] : [gateFor(status)]),
    ])],
    nextStep: copy.nextStep,
    createdAt: finding.createdAt,
    updatedAt: audit.generatedAt,
  };
}

// ── Not measured vs measured zero ───────────────────────────────────────────

/**
 * Phrases either audit engine uses when a source could not be read. A finding
 * carrying one of these is an absence of knowledge, not an observation.
 */
const UNREADABLE = /not readable|does not expose|not exposed|only readable|could not be confirmed|is unavailable|not available|no access|not authoriz|connect google business profile|access is required|url is required/i;

/**
 * Returns a plain-English reason when this finding rests on a source we could
 * not read, or `null` when the finding is a real observation.
 *
 * `confidence === 0` is the profile-sync engine's marker for a capability whose
 * source came back unknown; the public-data engine instead names the missing
 * Business Profile connection in `blockers`. Both must read as "not checked",
 * because "0 services synced" from an unread source is a fabricated metric.
 */
function measurementGap(audit: LocalGrowthAudit, finding: LocalGrowthAuditFinding): string | null {
  if (finding.status !== "blocked") return null;
  // A connection finding is itself the fix, not a hole in a check.
  if (finding.target === "source_connection") return null;
  const coverage = audit.sourceCoverage[SOURCE_FOR[finding.target]];
  if (finding.confidence === 0) {
    return "The last sync could not read this part of your Google listing, so we have not checked it.";
  }
  if (coverage === "not_connected" || coverage === "unavailable" || coverage === "error") {
    return coverageReason(coverage);
  }
  if (finding.blockers.some((blocker) => UNREADABLE.test(blocker))) {
    return "Google did not let us read this in the last sync, so we have not checked it.";
  }
  return null;
}

function coverageReason(coverage: "not_connected" | "unavailable" | "error"): string {
  if (coverage === "not_connected") return "This part of your Google listing is not connected yet, so we could not read it.";
  if (coverage === "unavailable") return "Google did not make this part of your listing available to read in the last sync.";
  return "The last sync hit an error reading this from Google, so we have not checked it.";
}

interface Copy {
  title: string;
  rationale: string;
  nextStep: string;
}

function notMeasuredCopy(finding: LocalGrowthAuditFinding, reason: string): Copy {
  const thing = THING[finding.target];
  return {
    title: `We could not check your ${thing}`,
    rationale: `${reason} That is not the same as finding nothing there — we simply have not seen it, so treat it as unchecked. Connect Google Business Profile in Settings → Integrations and we will check it on the next sync.`,
    nextStep: "Connect Google",
  };
}

function connectionCopy(finding: LocalGrowthAuditFinding): Copy {
  const source = finding.id.replace(/^finding_source_/, "");
  if (source === "website") {
    return {
      title: "Add your website so we can cross-check your details",
      rationale: "We have not been able to read your website, so we cannot compare the phone number, address and services there against the ones on Google. Add or reconnect it in Settings → Integrations and we will read it on the next sync.",
      nextStep: "Connect source",
    };
  }
  if (source === "search_console") {
    return {
      title: "Connect Search Console to see real search wording",
      rationale: "Search Console shows the words people actually type before they reach your site. Connect it in Settings → Integrations and we can compare that wording with the services listed on your profile. Nothing is published from this step.",
      nextStep: "Connect source",
    };
  }
  if (source === "instagram") {
    return {
      title: "Connect Instagram to compare what you post there",
      rationale: "Without access to your Instagram we cannot tell whether you talk about work there that is missing from your Google profile. Connect it in Settings → Integrations. This one is optional.",
      nextStep: "Connect source",
    };
  }
  return { title: finding.title, rationale: finding.rationale, nextStep: "Connect source" };
}

// ── Owner-facing copy for real observations ─────────────────────────────────

function ownerCopy(finding: LocalGrowthAuditFinding, facts: AuditFacts): Copy {
  if (finding.status === "blocked") return confirmCopy(finding);
  const thing = THING[finding.target];
  switch (finding.target) {
    case "business_title":
      return {
        title: "Check the business name on your listing",
        rationale: "Your Google name should match the name on your door and your paperwork, with no extra service or town words added. Check it in Settings → Business; we never change your name on Google without you confirming it first.",
        nextStep: "Confirm details",
      };
    case "primary_category":
      return {
        title: "Set the main category for your business",
        rationale: "The main category is how Google decides which searches your listing belongs in. Pick the one that describes your core work in Google Business Profile → Business information, or confirm it in Settings → Business.",
        nextStep: "Confirm details",
      };
    case "additional_categories": {
      const count = countOf(finding.currentValue);
      const seen = count === undefined
        ? "Your listing is not using extra categories yet."
        : count === 0
          ? "Your listing has no extra categories beyond the main one."
          : `Your listing has ${count} extra ${count === 1 ? "category" : "categories"} beyond the main one.`;
      return {
        title: "Add the other categories that describe what you do",
        rationale: `${seen} Add one for each kind of work you genuinely do, in Google Business Profile → Business information → Categories. Only add categories for work you really offer.`,
        nextStep: "Confirm details",
      };
    }
    case "address":
    case "service_area":
      return {
        title: `Confirm the ${thing} on your listing`,
        rationale: `People need to know where you are, or how far you travel. Set your ${thing} in Google Business Profile → Business information, or give us the real details in Settings → Business.`,
        nextStep: "Confirm details",
      };
    case "phone":
      return {
        title: "Add the phone number people should call",
        rationale: "The call button on your listing needs a working number behind it. Add the number you actually answer in Settings → Business and we will prepare the exact change for you to approve.",
        nextStep: "Confirm details",
      };
    case "website":
      return {
        title: "Add your website link",
        rationale: "Without a link, someone who has found your listing has nowhere to go to book or browse. Add the address of your site in Settings → Business.",
        nextStep: "Confirm details",
      };
    case "description": {
      const length = lengthOf(finding.currentValue);
      const seen = length === undefined
        ? "Your description is not finished."
        : length === 0
          ? "Your listing has no description yet."
          : `Your description is ${length} characters long.`;
      return {
        title: "Finish your business description",
        rationale: `${seen} Google allows up to 750 characters — say what you do, who you do it for, and the area you cover. Add the facts in Settings → Business and we will draft the exact wording for you to approve.`,
        nextStep: "Confirm details",
      };
    }
    case "hours":
      return {
        title: "Publish hours for every day of the week",
        rationale: "Days with no hours make your listing look uncertain, and searches for those days skip you. Set hours for all seven days in Google Business Profile → Hours, marking the days you are closed as closed.",
        nextStep: "Confirm details",
      };
    case "special_hours":
      return {
        title: "Set your holiday and one-off hours",
        rationale: "Your profile has no special hours saved, so on a public holiday it keeps showing your normal times. Add the dates you are closed or working different hours in Google Business Profile → Hours → Special hours.",
        nextStep: "Confirm details",
      };
    case "services": {
      const count = countOf(finding.currentValue);
      const seen = count === undefined
        ? "Your service list is not complete."
        : count === 0
          ? "Your profile does not list any services yet."
          : `Your profile lists ${count} ${count === 1 ? "service" : "services"}, and not all of them have a description.`;
      return {
        title: "List the services you actually offer",
        rationale: `${seen} Write down each real service with a sentence about what it includes, in Settings → Business. Do not add work you do not do.`,
        nextStep: "List services",
      };
    }
    case "attributes":
      return {
        title: "Fill in the extra details on your profile",
        rationale: "Details like wheelchair access, parking or payment types only show on your listing when you tick them. Set the ones that are genuinely true in Google Business Profile → Business information → More.",
        nextStep: "Confirm details",
      };
    case "action_links":
      return {
        title: "Add your booking or ordering links",
        rationale: "Google can show a booking or ordering button on your listing, but only when a link is saved for it. Add the links you really use in Google Business Profile → Business information.",
        nextStep: "Confirm details",
      };
    case "media": {
      const count = countOf(finding.currentValue);
      const seen = count === undefined || count === 0
        ? "We did not find photos on your listing."
        : `Your listing has ${count} ${count === 1 ? "photo" : "photos"} from Google.`;
      return {
        title: "Add your own photos to the listing",
        rationale: `${seen} Upload original pictures of your premises, your team and finished work — your own photos only, never stock images. Add them in Studio, or straight into Google Business Profile → Photos.`,
        nextStep: "Add photos",
      };
    }
    case "local_post":
      return localPostCopy(facts);
    case "owner_reply": {
      const seen = facts.reviews && facts.reviews.unreplied > 0
        ? `${facts.reviews.unreplied} of your ${facts.reviews.total} Google reviews still have no reply from you.`
        : "Some of your Google reviews still have no reply from you.";
      return {
        title: "Reply to the reviews still waiting",
        rationale: `${seen} A short, specific thank-you is enough, and an unhappy review deserves a calm reply too. Foundly drafts each one from what the review actually says; you read it and approve it before it goes anywhere.`,
        nextStep: "Write replies",
      };
    }
    case "qna_answer":
      return {
        title: "Answer the questions people asked",
        rationale: "Questions on your listing are sitting without an answer, and on Google anyone can answer them — including people who have never worked with you. Answer them yourself from real facts; confirm those facts in Settings → Business and we will draft the wording for approval.",
        nextStep: "Answer questions",
      };
    case "keyword_coverage":
      return {
        title: "Check which search wording matches real services",
        rationale: "Google shows people finding you with wording that does not appear anywhere in your categories, services or description. Go through the list and mark only the ones that describe work you genuinely do. This is research — nothing is added to your profile, and we never stuff words into it.",
        nextStep: "Check wording",
      };
    default:
      return { title: finding.title, rationale: finding.rationale, nextStep: "Confirm details" };
  }
}

/** Blocked but measured: Google and our records disagree, or an edit is in flight. */
function confirmCopy(finding: LocalGrowthAuditFinding): Copy {
  const thing = THING[finding.target];
  if (/pending/i.test(finding.rationale)) {
    return {
      title: `Google is still processing a change to your ${thing}`,
      rationale: `Google has an edit to your ${thing} in progress. Wait for it to finish before changing it again — we will check the result on the next sync and will not send anything in the meantime.`,
      nextStep: "View status",
    };
  }
  return {
    title: `Confirm your ${thing} before it changes`,
    rationale: `What Google shows for your ${thing} does not match the other information we hold about you. Tell us which one is correct in Settings → Business. Nothing is sent to Google until you say which is right.`,
    nextStep: "Confirm details",
  };
}

// ── Local post ideas, grounded only in facts already in the audit ───────────

interface PostIdea {
  angle: string;
  basedOn: string;
  youSupply: string[];
}

interface LocalPostBrief {
  action: "draft_local_post_from_verified_facts";
  groundedIn: {
    primaryCategory?: string;
    services: string[];
    postsMeasured: boolean;
    postCount?: number;
    lastPostAt?: string;
    daysSinceLastPost?: number;
    holidayHoursMissing: boolean;
  };
  ideas: PostIdea[];
  youMustSupply: string[];
  note: string;
}

/**
 * Every idea below names something already present in this audit — a service on
 * the profile, the profile's own category, or a gap the audit itself found. No
 * offer, price, event or claim is generated here; where there is nothing real
 * to build on, the brief asks the owner for material instead of inventing it.
 */
function localPostBrief(facts: AuditFacts): LocalPostBrief {
  const ideas: PostIdea[] = [];
  for (const service of facts.services.slice(0, 2)) {
    ideas.push({
      angle: `Explain one service you already list: ${service}`,
      basedOn: `"${service}" is already on your Google profile's service list.`,
      youSupply: [
        "Two or three sentences on what this service involves, in your own words",
        "One photo of this work, if you have one",
      ],
    });
  }
  if (facts.primaryCategory) {
    ideas.push({
      angle: `Say what you do as ${indefinite(facts.primaryCategory)} and the area you cover`,
      basedOn: `Your profile's main category is ${facts.primaryCategory}.`,
      youSupply: ["The towns or neighbourhoods you actually cover"],
    });
  }
  if (facts.holidayHoursMissing) {
    ideas.push({
      angle: "Tell people your hours around a closure you have coming up",
      basedOn: "This audit found no holiday or one-off hours saved on your profile.",
      youSupply: ["The exact dates you are closed or working different hours"],
    });
  }
  return {
    action: "draft_local_post_from_verified_facts",
    groundedIn: {
      primaryCategory: facts.primaryCategory,
      services: facts.services,
      postsMeasured: facts.posts !== undefined,
      postCount: facts.posts?.total,
      lastPostAt: facts.posts?.lastAt,
      daysSinceLastPost: facts.posts?.daysSince,
      holidayHoursMissing: facts.holidayHoursMissing,
    },
    ideas,
    youMustSupply: ideas.length === 0
      ? [
          "The services you offer, added in Settings → Business",
          "One or two photos of recent work",
          "Anything genuinely new: a job you finished, a change in hours, someone who joined",
        ]
      : [],
    note: "Each idea above is built only from information already on your profile. Foundly will not add an offer, a price, an event or a claim you have not given us, and you approve the exact wording before anything is published.",
  };
}

function localPostCopy(facts: AuditFacts): Copy {
  const days = facts.posts?.daysSince;
  const seen = days !== undefined
    ? `Your last Google post went up ${days} ${days === 1 ? "day" : "days"} ago.`
    : facts.posts && facts.posts.recent30 === 0
      ? "Your profile has no post from the last 30 days."
      : "Your profile is due a new post.";
  if (facts.services.length === 0 && !facts.primaryCategory && !facts.holidayHoursMissing) {
    return {
      title: "Tell us what to post about",
      rationale: `${seen} We do not have enough confirmed material to suggest anything specific yet, and we will not invent an offer or an event for you. Add your services in Settings → Business, or bring a photo of recent work, and we will build the post around that.`,
      nextStep: "Add material",
    };
  }
  const source = facts.services.length > 0
    ? "your own service list"
    : facts.primaryCategory
      ? "your profile's main category"
      : "what this audit found on your profile";
  return {
    title: "Post an update on your Google listing",
    rationale: `${seen} We have prepared post angles built from ${source} — no offer, price or claim is added for you. Open Studio, pick one, put it in your own words, and approve the exact text before it is published.`,
    nextStep: "Plan this post",
  };
}

// ── Facts read out of the audit (no defaults, no invented values) ───────────

interface AuditFacts {
  services: string[];
  primaryCategory?: string;
  posts?: { total: number; recent30: number; lastAt?: string; daysSince?: number };
  reviews?: { total: number; unreplied: number };
  holidayHoursMissing: boolean;
}

function readFacts(audit: LocalGrowthAudit): AuditFacts {
  return {
    services: readServices(audit),
    primaryCategory: readPrimaryCategory(audit),
    posts: readPosts(audit),
    reviews: readReviews(audit),
    holidayHoursMissing: audit.findings.some(
      (finding) => finding.target === "special_hours" && finding.status === "open",
    ),
  };
}

function evidenceValue(audit: LocalGrowthAudit, field: string): unknown {
  return audit.evidence.find((fact) => fact.field === field)?.value;
}

function readServices(audit: LocalGrowthAudit): string[] {
  const value = evidenceValue(audit, "profile.services");
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const raw = typeof item.name === "string" ? item.name.trim() : "";
    if (!raw) continue;
    // A structured service carries Google's own type id. Read that id out
    // rather than renaming the service into words the owner never wrote.
    const readable = item.source === "structured"
      ? (raw.split(":").pop() ?? raw).replace(/[_-]+/g, " ").trim()
      : raw;
    if (readable.length >= 3) names.push(readable);
  }
  return names;
}

function readPrimaryCategory(audit: LocalGrowthAudit): string | undefined {
  const value = evidenceValue(audit, "profile.categories.primary");
  if (!isRecord(value)) return undefined;
  const display = typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (display) return display;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  return name && !name.includes("/") ? name : undefined;
}

function readPosts(audit: LocalGrowthAudit): AuditFacts["posts"] {
  const value = evidenceValue(audit, "profile.posts");
  if (!Array.isArray(value)) return undefined;
  const times: number[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const created = typeof item.createTime === "string" ? Date.parse(item.createTime) : Number.NaN;
    if (!Number.isNaN(created)) times.push(created);
  }
  const now = Date.parse(audit.generatedAt);
  const latest = times.length ? Math.max(...times) : undefined;
  return {
    total: value.length,
    recent30: Number.isNaN(now) ? 0 : times.filter((time) => (now - time) / 86_400_000 <= 30).length,
    lastAt: latest === undefined ? undefined : new Date(latest).toISOString(),
    daysSince: latest === undefined || Number.isNaN(now)
      ? undefined
      : Math.max(0, Math.round((now - latest) / 86_400_000)),
  };
}

function readReviews(audit: LocalGrowthAudit): AuditFacts["reviews"] {
  const value = evidenceValue(audit, "profile.reviews");
  if (!isRecord(value)) return undefined;
  const total = typeof value.count === "number" ? value.count : undefined;
  const unreplied = Array.isArray(value.unrepliedReviewIds) ? value.unrepliedReviewIds.length : undefined;
  if (total === undefined || unreplied === undefined) return undefined;
  return { total, unreplied };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countOf(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : typeof value === "number" ? value : undefined;
}

function lengthOf(value: unknown): number | undefined {
  return typeof value === "string" ? value.trim().length : undefined;
}

function indefinite(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun.toLowerCase()}`;
}

// ── Status, ordering, gates ─────────────────────────────────────────────────

function initialStatus(
  finding: LocalGrowthAuditFinding,
  gap: string | null,
): ProfileSuggestionStatus {
  if (finding.target === "source_connection") return "needs_connection";
  // Not measured: the only move open to the owner is connecting the source.
  if (gap) return "needs_connection";
  if (finding.target === "keyword_coverage") return "needs_facts";
  if (finding.status === "blocked") return finding.requiresOwnerFacts ? "needs_facts" : "needs_evidence";
  if (finding.target === "media") return "needs_asset";
  if (finding.target === "local_post" || finding.target === "owner_reply") return "needs_generation";
  if (finding.target === "qna_answer") return "needs_facts";
  if (finding.requiresOwnerFacts) return "needs_facts";
  return "needs_generation";
}

/**
 * Ordering: band first, then importance, then how little work it takes. Within
 * a band a two-minute fix outranks a same-importance job that needs a morning,
 * and a check we could not run never outranks something the owner can do today.
 */
function priorityFor(band: Band, finding: LocalGrowthAuditFinding): number {
  const importance = finding.severity === "critical" ? 20
    : finding.severity === "high" ? 15
      : finding.severity === "medium" ? 9
        : 4;
  if (band !== "actionable") return BAND_BASE[band] + importance;
  const ease = EFFORT[finding.target] === "quick" ? 15 : EFFORT[finding.target] === "some" ? 9 : 3;
  const reach = finding.expectedImpact === "conversion" || finding.expectedImpact === "discovery" ? 6
    : finding.expectedImpact === "trust" ? 5
      : 2;
  return Math.min(100, BAND_BASE[band] + importance + ease + reach);
}

function gateFor(status: ProfileSuggestionStatus): string {
  if (status === "needs_connection") return "Connect the source before we can check this.";
  if (status === "needs_evidence") return "We need to settle the conflicting information before anything can change.";
  if (status === "needs_facts") return "Confirm the real details and we will prepare the exact wording for you to approve.";
  if (status === "needs_asset") return "Choose or upload your own photo before approving.";
  return "You will see the exact wording and approve it before anything reaches Google.";
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
    case "needs_connection": return "Not checked yet";
    case "needs_evidence": return "Needs a decision";
    case "needs_facts": return "Facts needed";
    case "needs_asset": return "Photo needed";
    case "needs_generation": return "Wording needed";
    case "ready_for_review": return "Ready to review";
    case "approved": return "Approved";
    case "queued": return "Queued";
    case "executing": return "Applying";
    case "verification_pending": return "Checking with Google";
    case "applied": return "Done";
    case "failed": return "Needs attention";
    case "dismissed": return "Dismissed";
  }
}
