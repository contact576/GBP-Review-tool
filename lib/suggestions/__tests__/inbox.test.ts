import { describe, expect, it } from "vitest";
import { buildSuggestionInbox } from "@/lib/suggestions/inbox";
import { lintAttributionHonesty } from "@/lib/compliance/lints";
import type {
  AuditEvidenceFact,
  LocalGrowthAudit,
  LocalGrowthAuditFinding,
  ProfileSuggestion,
} from "@/lib/data/types";

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

function fact(field: string, value: unknown): AuditEvidenceFact {
  return {
    id: `ev_${field.replace(/[^a-z0-9]+/gi, "_")}`,
    source: "google_profile",
    field,
    value,
    observedAt: now,
    confidence: 1,
    authoritative: true,
  };
}

function audit(
  findings: LocalGrowthAuditFinding[],
  patch: Partial<LocalGrowthAudit> = {},
): LocalGrowthAudit {
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
    ...patch,
  };
}

function byTarget(suggestions: ProfileSuggestion[]): Record<string, ProfileSuggestion> {
  return Object.fromEntries(suggestions.map((suggestion) => [suggestion.target, suggestion]));
}

function daysAgo(days: number): string {
  return new Date(Date.parse(now) - days * 86_400_000).toISOString();
}

describe("approval-first suggestion inbox", () => {
  it("never marks a workflow intent as ready to approve without an exact preview", () => {
    const suggestions = buildSuggestionInbox(audit([
      finding({ target: "local_post", suggestedValue: { action: "draft_local_post_from_verified_facts" }, requiresOwnerFacts: false }),
      finding({ id: "finding_media", target: "media", suggestedValue: { action: "request_service_specific_original_photos" }, requiresOwnerFacts: false }),
      finding({ id: "finding_services", target: "services", suggestedValue: { action: "verify_and_complete_service_catalog" } }),
    ]));

    const found = byTarget(suggestions);
    expect(found.local_post?.status).toBe("needs_generation");
    expect(found.media?.status).toBe("needs_asset");
    expect(found.services?.status).toBe("needs_facts");
    expect(suggestions.every((suggestion) => suggestion.exactPreviewReady === false)).toBe(true);
    expect(suggestions.some((suggestion) => suggestion.status === "ready_for_review")).toBe(false);
  });

  it("routes connection and contradiction findings to the correct next step", () => {
    const suggestions = buildSuggestionInbox(audit([
      finding({ id: "finding_source_website", target: "source_connection", status: "blocked", requiresOwnerFacts: false }),
      finding({ id: "finding_conflict_title", target: "business_title", status: "blocked", blockers: ["Owner confirmation required"] }),
    ]));

    expect(suggestions.find((suggestion) => suggestion.target === "source_connection")).toMatchObject({ status: "needs_connection", nextStep: "Connect source", risk: "low" });
    expect(suggestions.find((suggestion) => suggestion.target === "business_title")).toMatchObject({ status: "needs_facts", nextStep: "Confirm details", risk: "high" });
  });
});

describe("ordering — highest impact, lowest effort first", () => {
  it("puts the quicker job first when two findings matter equally", () => {
    const suggestions = buildSuggestionInbox(audit([
      // Same severity; special hours is a two-minute edit, photos are a shoot.
      finding({ id: "finding_special_hours", target: "special_hours", expectedImpact: "conversion", priorityScore: 40 }),
      finding({ id: "finding_media_library", target: "media", expectedImpact: "discovery", priorityScore: 90, requiresOwnerFacts: false }),
    ]));

    expect(suggestions.map((suggestion) => suggestion.target)).toEqual(["special_hours", "media"]);
  });

  it("still leads with the more serious item when the effort is the same", () => {
    const suggestions = buildSuggestionInbox(audit([
      finding({ id: "finding_attributes", target: "attributes", severity: "low", expectedImpact: "profile" }),
      finding({ id: "finding_phone", target: "phone", severity: "critical", expectedImpact: "conversion" }),
    ]));

    expect(suggestions.map((suggestion) => suggestion.target)).toEqual(["phone", "attributes"]);
  });

  it("ranks work the owner can do above setup, and setup above unchecked items", () => {
    const suggestions = buildSuggestionInbox(audit([
      // Lowest possible actionable item.
      finding({ id: "finding_media_library", target: "media", severity: "low", expectedImpact: "profile", requiresOwnerFacts: false }),
      // Highest possible connection item.
      finding({ id: "finding_source_website", target: "source_connection", status: "blocked", severity: "critical", priorityScore: 99, requiresOwnerFacts: false }),
      // Highest possible unchecked item.
      finding({ id: "finding_services", target: "services", status: "blocked", severity: "critical", confidence: 0, priorityScore: 99 }),
    ]));

    expect(suggestions.map((suggestion) => suggestion.target)).toEqual(["media", "source_connection", "services"]);
  });

  it("leads a real public-data workspace with the reviews still waiting for a reply", () => {
    // Shape of a live snapshot: categories and holiday hours missing, posts read
    // but stale, 4 of 47 reviews unanswered, and services/photos not readable.
    const posts = Array.from({ length: 10 }, (_, index) => ({ name: `posts/${index}`, createTime: daysAgo(90 + index) }));
    const inbox = buildSuggestionInbox(audit(
      [
        finding({ id: "finding_additional_categories", target: "additional_categories", severity: "low", priorityScore: 64, expectedImpact: "discovery", currentValue: [] }),
        finding({ id: "finding_special_hours", target: "special_hours", severity: "low", priorityScore: 64, expectedImpact: "conversion" }),
        finding({ id: "finding_local_posts", target: "local_post", severity: "low", priorityScore: 46, expectedImpact: "discovery", requiresOwnerFacts: false, currentValue: posts }),
        finding({ id: "finding_review_replies", target: "owner_reply", severity: "medium", priorityScore: 54, expectedImpact: "trust", requiresOwnerFacts: false }),
        finding({ id: "finding_services", target: "services", status: "blocked", confidence: 0, severity: "low", priorityScore: 44, currentValue: [], suggestedValue: { action: "verify_and_complete_service_catalog", currentValue: [] }, blockers: ["The required Google source was not readable in the latest sync."] }),
        finding({ id: "finding_media_library", target: "media", status: "blocked", confidence: 0, severity: "low", priorityScore: 36, requiresOwnerFacts: false, blockers: ["The required Google source was not readable in the latest sync."] }),
        finding({ id: "finding_source_website", target: "source_connection", status: "blocked", severity: "high", priorityScore: 76, requiresOwnerFacts: false, blockers: ["Website ingestion is unavailable."] }),
      ],
      {
        sourceCoverage: {
          google_profile: "connected",
          google_reviews: "connected",
          google_media: "unavailable",
          google_posts: "connected",
          google_qna: "connected",
          google_search_keywords: "not_connected",
          website: "not_connected",
          instagram: "not_connected",
          search_console: "not_connected",
        },
        evidence: [
          fact("profile.reviews", { count: 47, responseRate: 0.91, unrepliedReviewIds: ["r1", "r2", "r3", "r4"] }),
          fact("profile.posts", posts),
          fact("profile.categories.primary", { name: "gcid:roofing_contractor", displayName: "Roofing contractor" }),
        ],
      },
    ));

    expect(inbox[0]?.target).toBe("owner_reply");
    expect(inbox[0]?.rationale).toContain("4 of your 47 Google reviews");
    // The dashboard shows the first three. None of them may be a non-check.
    for (const suggestion of inbox.slice(0, 3)) {
      expect(suggestion.title).not.toMatch(/could not check/i);
    }
    // Everything we could not read sits below everything we could.
    const lastChecked = inbox.reduce(
      (last, suggestion, index) => (/could not check/i.test(suggestion.title) ? last : index),
      -1,
    );
    const firstUnchecked = inbox.findIndex((suggestion) => /could not check/i.test(suggestion.title));
    expect(firstUnchecked).toBeGreaterThan(lastChecked);
  });
});

describe("not measured is never reported as zero", () => {
  const unreadServices = finding({
    id: "finding_services",
    target: "services",
    title: "Verify services availability",
    // What the capability engine writes when the source came back unknown.
    rationale: "0 services; 0 include descriptions. Only verified business facts may be proposed or published.",
    status: "blocked",
    confidence: 0,
    currentValue: [],
    suggestedValue: { action: "verify_and_complete_service_catalog", currentValue: [] },
    blockers: ["The required Google source was not readable in the latest sync."],
  });

  it("says we could not check, and carries no value we never read", () => {
    const suggestion = buildSuggestionInbox(audit([unreadServices]))[0]!;

    expect(suggestion.title).toBe("We could not check your service list");
    expect(suggestion.status).toBe("needs_connection");
    expect(suggestion.nextStep).toBe("Connect Google");
    // No fabricated zero survives into the owner-facing row.
    expect(suggestion.rationale).not.toMatch(/\b0\b/);
    expect(suggestion.rationale).toMatch(/have not checked it/i);
    expect(suggestion.currentValue).toBeUndefined();
    expect(suggestion.proposedValue).toBeUndefined();
    expect(suggestion.blockers[0]).toMatch(/could not read/i);
  });

  it("keeps a genuinely measured empty result as a real, actionable finding", () => {
    const measured = finding({
      id: "finding_services",
      target: "services",
      status: "open",
      confidence: 0.98,
      currentValue: [],
      suggestedValue: { action: "verify_and_complete_service_catalog", currentValue: [] },
    });
    const suggestion = buildSuggestionInbox(audit([measured]))[0]!;

    expect(suggestion.title).toBe("List the services you actually offer");
    expect(suggestion.rationale).toMatch(/does not list any services/i);
    expect(suggestion.status).toBe("needs_facts");
    expect(suggestion.currentValue).toEqual([]);
    expect(suggestion.priorityScore).toBeGreaterThan(
      buildSuggestionInbox(audit([unreadServices]))[0]!.priorityScore,
    );
  });

  it("treats a source the public engine cannot see as unchecked, not empty", () => {
    // Public-data engine: confidence 1, but the blocker names the missing API.
    const suggestion = buildSuggestionInbox(audit(
      [finding({
        id: "finding_places_unknown_local_posts",
        target: "local_post",
        status: "blocked",
        confidence: 1,
        requiresOwnerFacts: false,
        blockers: ["Connect Google Business Profile — public Google data does not expose this."],
      })],
      {
        sourceCoverage: {
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
      },
    ))[0]!;

    expect(suggestion.title).toMatch(/could not check/i);
    expect(suggestion.proposedValue).toBeUndefined();
  });

  it("does not mistake a contradiction for a missing source", () => {
    const suggestion = buildSuggestionInbox(audit([
      finding({
        id: "finding_conflict_phone",
        target: "phone",
        status: "blocked",
        rationale: "Google reports a different value for phone numbers primary phone.",
        blockers: ["Owner confirmation is required to resolve contradictory or pending Google information."],
      }),
    ]))[0]!;

    expect(suggestion.title).toBe("Confirm your phone number before it changes");
    expect(suggestion.status).toBe("needs_facts");
    expect(suggestion.priorityScore).toBeGreaterThan(55);
  });
});

describe("local post ideas are grounded in facts already on the profile", () => {
  const postFindings = [finding({
    id: "finding_local_posts",
    target: "local_post",
    requiresOwnerFacts: false,
    suggestedValue: { action: "draft_local_post_from_verified_facts" },
  })];

  it("builds angles from the real service list and the real last-post date", () => {
    const suggestion = buildSuggestionInbox(audit(postFindings, {
      evidence: [
        fact("profile.services", [
          { name: "Gutter cleaning", source: "free_form" },
          { name: "gcid:roof_repair", source: "structured" },
        ]),
        fact("profile.categories.primary", { name: "gcid:roofing_contractor", displayName: "Roofing contractor" }),
        fact("profile.posts", [{ name: "posts/1", createTime: daysAgo(45) }]),
      ],
    }))[0]!;
    const brief = suggestion.proposedValue as {
      ideas: Array<{ angle: string; basedOn: string; youSupply: string[] }>;
      youMustSupply: string[];
      groundedIn: { daysSinceLastPost?: number; services: string[] };
    };

    expect(suggestion.title).toBe("Post an update on your Google listing");
    expect(suggestion.rationale).toContain("45 days ago");
    expect(brief.groundedIn.daysSinceLastPost).toBe(45);
    expect(brief.ideas[0]?.angle).toContain("Gutter cleaning");
    expect(brief.ideas.some((idea) => idea.angle.includes("roof repair"))).toBe(true);
    expect(brief.ideas.some((idea) => idea.basedOn.includes("Roofing contractor"))).toBe(true);
    expect(brief.youMustSupply).toEqual([]);
    // Nothing commercial is ever invented for the owner.
    expect(JSON.stringify(brief)).not.toMatch(/\$|%\s*off|discount|sale\b|special offer|book now/i);
    for (const idea of brief.ideas) expect(idea.basedOn.length).toBeGreaterThan(0);
  });

  it("asks the owner for material instead of inventing a post", () => {
    const suggestion = buildSuggestionInbox(audit(postFindings, { evidence: [] }))[0]!;
    const brief = suggestion.proposedValue as { ideas: unknown[]; youMustSupply: string[] };

    expect(suggestion.title).toBe("Tell us what to post about");
    expect(suggestion.rationale).toMatch(/not have enough confirmed material/i);
    expect(brief.ideas).toEqual([]);
    expect(brief.youMustSupply.length).toBeGreaterThan(0);
  });

  it("offers an hours post only when the audit itself found the hours gap", () => {
    const withGap = buildSuggestionInbox(audit([
      ...postFindings,
      finding({ id: "finding_special_hours", target: "special_hours" }),
    ], { evidence: [] }));
    const brief = withGap.find((suggestion) => suggestion.target === "local_post")!.proposedValue as {
      ideas: Array<{ angle: string }>;
    };

    expect(brief.ideas.some((idea) => /closure/i.test(idea.angle))).toBe(true);
  });
});

describe("plain language an owner can act on", () => {
  const everyTarget = buildSuggestionInbox(audit([
    finding({ id: "finding_business_title", target: "business_title" }),
    finding({ id: "finding_primary_category", target: "primary_category" }),
    finding({ id: "finding_additional_categories", target: "additional_categories", currentValue: [] }),
    finding({ id: "finding_address", target: "address" }),
    finding({ id: "finding_phone", target: "phone" }),
    finding({ id: "finding_website", target: "website" }),
    finding({ id: "finding_description", target: "description", currentValue: "Short one" }),
    finding({ id: "finding_regular_hours", target: "hours" }),
    finding({ id: "finding_special_hours", target: "special_hours" }),
    finding({ id: "finding_services", target: "services", currentValue: [{ name: "Gutter cleaning" }] }),
    finding({ id: "finding_attributes", target: "attributes" }),
    finding({ id: "finding_action_links", target: "action_links" }),
    finding({ id: "finding_media_library", target: "media", requiresOwnerFacts: false }),
    finding({ id: "finding_local_posts", target: "local_post", requiresOwnerFacts: false }),
    finding({ id: "finding_review_replies", target: "owner_reply", requiresOwnerFacts: false }),
    finding({ id: "finding_questions", target: "qna_answer", requiresOwnerFacts: false }),
    finding({ id: "finding_keyword_coverage", target: "keyword_coverage" }),
    finding({ id: "finding_source_search_console", target: "source_connection", status: "blocked", requiresOwnerFacts: false }),
    finding({ id: "finding_cover_media", target: "media", status: "blocked", confidence: 0, requiresOwnerFacts: false }),
  ]));

  it("never over-claims attribution in a title, reason or button", () => {
    for (const suggestion of everyTarget) {
      for (const text of [suggestion.title, suggestion.rationale, suggestion.nextStep]) {
        expect(lintAttributionHonesty(text, { kind: "post" })).toBeNull();
      }
    }
  });

  it("keeps product and API jargon out of every owner-facing string", () => {
    const jargon = /\bGBP\b|capabilit|endpoint|not_authorized|sourceStatus|priorityScore|schema|payload|\bAPI\b|idempot/i;
    for (const suggestion of everyTarget) {
      expect(suggestion.title).not.toMatch(jargon);
      expect(suggestion.rationale).not.toMatch(jargon);
      expect(suggestion.nextStep).not.toMatch(jargon);
    }
  });

  it("gives every row a short button and a reason that says where to go", () => {
    for (const suggestion of everyTarget) {
      expect(suggestion.nextStep.length).toBeGreaterThan(0);
      expect(suggestion.nextStep.split(" ").length).toBeLessThanOrEqual(3);
      expect(suggestion.rationale.length).toBeGreaterThan(40);
      expect(suggestion.blockers.length).toBeGreaterThan(0);
    }
  });
});
