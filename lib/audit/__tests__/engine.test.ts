import { describe, expect, it } from "vitest";
import { buildLocalGrowthAudit } from "@/lib/audit/engine";
import type { GbpProfileSnapshot, Location, Review } from "@/lib/data/types";

const nowIso = "2026-07-19T12:00:00.000Z";

function fixture(): { location: Location; snapshot: GbpProfileSnapshot; reviews: Review[] } {
  const snapshot: GbpProfileSnapshot = {
    schemaVersion: 1,
    source: "google_business_profile",
    accountResource: "accounts/a",
    locationResource: "locations/l",
    syncedAt: nowIso,
    location: {
      name: "locations/l",
      title: "Harbourview Physiotherapy",
      websiteUri: "https://harbourview.example",
      phoneNumbers: { primaryPhone: "+1 416 555 0100" },
      storefrontAddress: { regionCode: "CA", locality: "Toronto", addressLines: ["1 Harbour St"] },
      categories: { primaryCategory: { name: "categories/physical_therapist", displayName: "Physical therapist" } },
      profile: { description: "Physiotherapy in Toronto." },
      metadata: { placeId: "place", canModifyServiceList: true },
      serviceItems: [],
    },
    attributes: [],
    availableAttributes: [{ name: "has_wheelchair_accessible_entrance", displayName: "Wheelchair-accessible entrance" }],
    media: [{ name: "cover", category: "COVER", googleUrl: "https://google/cover" }],
    localPosts: [],
    questions: [],
    searchKeywords: [
      { keyword: "sports injury rehabilitation", impressions: 130 },
      { keyword: "physiotherapy toronto", impressions: 90 },
    ],
    googleUpdated: {
      diffMask: ["title"],
      pendingMask: [],
      location: { name: "locations/l", title: "Harbourview Physio" },
    },
    capabilities: [
      { key: "business_title", label: "Business name", status: "complete", weight: 3, evidence: "Set." },
      { key: "description", label: "Business description", status: "partial", weight: 3, evidence: "24 characters." },
      { key: "services", label: "Services", status: "missing", weight: 4, evidence: "0 services configured." },
      { key: "local_posts", label: "Local posts", status: "missing", weight: 2, evidence: "No posts synced." },
      { key: "questions", label: "Questions and answers", status: "not_applicable", weight: 1, evidence: "No questions." },
    ],
    capabilityScore: {
      score: 38,
      applicableCount: 4,
      completeCount: 1,
      partialCount: 1,
      missingCount: 2,
      unknownCount: 0,
      excludedCount: 1,
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
  const location: Location = {
    id: "loc",
    workspaceId: "ws",
    name: "Harbourview Physiotherapy",
    category: "Physical therapist",
    vertical: "physiotherapy",
    address: "1 Harbour St",
    city: "Toronto",
    region: "CA",
    timezone: "America/Toronto",
    googlePlaceId: "place",
    reviewUrl: "https://google/review",
    rating: 4.7,
    reviewCount: 1,
    joinedAt: nowIso,
    profile: {
      description: "Physiotherapy in Toronto.",
      primaryCategory: "Physical therapist",
      secondaryCategories: [],
      photoCount: 1,
      postCount: 0,
      qnaCount: 0,
      hoursSet: false,
      holidayHoursSet: false,
      servicesWithDescriptions: 0,
      servicesTotal: 0,
      responseRate: 0,
      completeness: 38,
    },
    gbpConnected: true,
    gbpSnapshot: snapshot,
  };
  const reviews: Review[] = [{
    id: "review_1",
    locationId: "loc",
    author: "Dana",
    rating: 5,
    text: "Helpful treatment.",
    publishedAt: "2026-07-18T12:00:00.000Z",
    source: "google",
    durability: "stable",
    needsReply: true,
  }];
  return { location, snapshot, reviews };
}

describe("local growth audit evidence graph", () => {
  it("links actionable findings to exact evidence and excludes non-applicable capabilities", () => {
    const audit = buildLocalGrowthAudit({ ...fixture(), nowIso });
    const services = audit.findings.find((finding) => finding.target === "services");
    expect(services).toMatchObject({ status: "open", requiresOwnerFacts: true });
    expect(services?.evidenceIds.length).toBeGreaterThan(0);
    expect(services?.evidenceIds.every((id) => audit.evidence.some((fact) => fact.id === id))).toBe(true);
    expect(audit.findings.some((finding) => finding.target === "qna_answer")).toBe(false);
    expect(audit.summary.evidenceFacts).toBe(audit.evidence.length);
  });

  it("blocks contradictory Google edits and high-demand themes until facts are confirmed", () => {
    const audit = buildLocalGrowthAudit({ ...fixture(), nowIso });
    expect(audit.conflicts).toEqual([
      expect.objectContaining({ field: "title", status: "needs_owner_confirmation" }),
    ]);
    expect(audit.findings.find((finding) => finding.id === "finding_conflict_title")).toMatchObject({
      status: "blocked",
      target: "business_title",
      requiresOwnerFacts: true,
    });
    const keywords = audit.findings.find((finding) => finding.target === "keyword_coverage");
    expect(keywords).toMatchObject({ status: "blocked" });
    expect(keywords?.suggestedValue).toBeUndefined();
    expect(keywords?.blockers[0]).toContain("genuinely offers");
  });

  it("records disconnected external sources as coverage gaps instead of invented evidence", () => {
    const audit = buildLocalGrowthAudit({ ...fixture(), nowIso });
    expect(audit.sourceCoverage).toMatchObject({
      website: "not_connected",
      instagram: "not_connected",
      search_console: "not_connected",
    });
    const externalEvidence = audit.evidence.filter((fact) =>
      fact.source === "website" || fact.source === "instagram" || fact.source === "search_console",
    );
    expect(externalEvidence).toHaveLength(0);
    expect(audit.findings.filter((finding) => finding.target === "source_connection")).toHaveLength(3);
  });

  it("uses connected external evidence and blocks contradictory contact facts", () => {
    const input = fixture();
    input.snapshot.externalEvidence = {
      website: {
        status: "synced",
        observedAt: nowIso,
        requestedUrl: "https://harbourview.example",
        finalUrl: "https://harbourview.example/",
        pages: [],
        facts: {
          businessNames: ["Harbourview Physiotherapy"],
          phones: ["+1 647 555 0100"],
          emails: [],
          addresses: ["1 Harbour St, Toronto"],
          services: ["Sports injury rehabilitation"],
          socialProfiles: [],
        },
      },
      searchConsole: {
        status: "synced",
        observedAt: nowIso,
        siteUrl: "sc-domain:harbourview.example",
        rows: [{ query: "sports physio toronto", clicks: 8, impressions: 120, ctr: 0.066, position: 5.4 }],
      },
      instagram: { status: "not_connected", observedAt: nowIso, media: [] },
    };
    const audit = buildLocalGrowthAudit({ ...input, nowIso });
    expect(audit.sourceCoverage).toMatchObject({ website: "connected", search_console: "connected", instagram: "not_connected" });
    expect(audit.evidence.some((fact) => fact.source === "website")).toBe(true);
    expect(audit.evidence.some((fact) => fact.source === "search_console")).toBe(true);
    expect(audit.conflicts).toContainEqual(expect.objectContaining({ id: "conflict_external_phone", status: "needs_owner_confirmation" }));
    expect(audit.findings.filter((finding) => finding.target === "source_connection")).toHaveLength(1);
  });
});
