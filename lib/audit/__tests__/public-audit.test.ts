import { describe, it, expect } from "vitest";
import { buildPublicProfileAudit } from "@/lib/audit/public-audit";
import { buildSuggestionInbox } from "@/lib/suggestions/inbox";
import type { PlaceDetails } from "@/lib/google/places";
import type { Location } from "@/lib/data/types";

const now = "2026-08-04T00:00:00.000Z";

const location = {
  id: "loc_1",
  workspaceId: "ws_1",
  name: "Test Biz",
  category: "Cafe",
  vertical: "restaurant",
  address: "1 Main St",
  city: "Toronto",
  rating: 4.6,
  reviewCount: 128,
  profile: { photoCount: 0, responseRate: 0, completeness: 10 },
} as unknown as Location;

/** A listing with everything Places can see filled in correctly. */
const complete: PlaceDetails = {
  placeId: "ChIJtest",
  name: "Test Biz",
  address: "1 Main St, Toronto",
  rating: 4.6,
  reviewCount: 128,
  category: "Cafe",
  websiteUri: "https://testbiz.example",
  phone: "(416) 555-0100",
  hasHours: true,
  openDayCount: 7,
  photoCount: 12,
  editorialSummary: "A neighbourhood cafe.",
  types: ["cafe", "food", "point_of_interest"],
  businessStatus: "OPERATIONAL",
  reviews: [
    { author: "Sam", rating: 5, text: "Great", relativeTime: "2 days ago", publishedAt: "2026-08-02T00:00:00.000Z" },
  ],
};

/** The same listing with every visible field missing or weak. */
const bare: PlaceDetails = {
  ...complete,
  rating: 3.1,
  reviewCount: 2,
  websiteUri: undefined,
  phone: undefined,
  hasHours: false,
  openDayCount: 0,
  photoCount: 0,
  editorialSummary: undefined,
  types: ["cafe"],
  businessStatus: "CLOSED_TEMPORARILY",
  reviews: [
    { author: "Old", rating: 3, text: "Meh", relativeTime: "a year ago", publishedAt: "2025-06-01T00:00:00.000Z" },
  ],
};

describe("buildPublicProfileAudit", () => {
  it("scores a complete public listing far above a bare one", () => {
    const good = buildPublicProfileAudit({ location, details: complete, nowIso: now });
    const bad = buildPublicProfileAudit({ location, details: bare, nowIso: now });
    expect(good.applicableProfileScore).toBeGreaterThan(90);
    expect(bad.applicableProfileScore).toBeLessThan(20);
    expect(good.applicableProfileScore).toBeGreaterThan(bad.applicableProfileScore);
  });

  it("raises a specific open finding for each visible gap", () => {
    const audit = buildPublicProfileAudit({ location, details: bare, nowIso: now });
    const open = audit.findings.filter((f) => f.status === "open").map((f) => f.id);
    expect(open).toContain("finding_places_website");
    expect(open).toContain("finding_places_phone");
    expect(open).toContain("finding_places_hours");
    expect(open).toContain("finding_places_photos");
    expect(open).toContain("finding_places_business_status");
  });

  it("raises no open findings when the visible profile is complete", () => {
    const audit = buildPublicProfileAudit({ location, details: complete, nowIso: now });
    expect(audit.findings.filter((f) => f.status === "open")).toHaveLength(0);
  });

  it("reports what Places cannot see as blocked, never as passing", () => {
    const audit = buildPublicProfileAudit({ location, details: complete, nowIso: now });
    const blocked = audit.findings.filter((f) => f.status === "blocked").map((f) => f.id);
    expect(blocked).toContain("finding_places_unknown_review_replies");
    expect(blocked).toContain("finding_places_unknown_local_posts");
    expect(blocked).toContain("finding_places_unknown_questions");
    for (const finding of audit.findings.filter((f) => f.status === "blocked")) {
      expect(finding.blockers.join(" ")).toMatch(/Business Profile/);
    }
  });

  it("never claims a source it did not read", () => {
    const audit = buildPublicProfileAudit({ location, details: complete, nowIso: now });
    expect(audit.sourceCoverage.google_posts).toBe("not_connected");
    expect(audit.sourceCoverage.google_qna).toBe("not_connected");
    expect(audit.sourceCoverage.search_console).toBe("not_connected");
    // Places sees the public listing only — never a full "connected" claim.
    expect(audit.sourceCoverage.google_profile).toBe("partial");
  });

  it("scores only over checks Places can see, so it cannot exceed 100", () => {
    for (const details of [complete, bare]) {
      const audit = buildPublicProfileAudit({ location, details, nowIso: now });
      expect(audit.applicableProfileScore).toBeGreaterThanOrEqual(0);
      expect(audit.applicableProfileScore).toBeLessThanOrEqual(100);
    }
  });

  it("feeds the existing suggestion inbox without modification", () => {
    const audit = buildPublicProfileAudit({ location, details: bare, nowIso: now });
    const inbox = buildSuggestionInbox(audit);
    expect(inbox.length).toBeGreaterThan(0);
    for (const suggestion of inbox) {
      expect(suggestion.workspaceId).toBe("ws_1");
      expect(suggestion.locationId).toBe("loc_1");
      expect(suggestion.nextStep.length).toBeGreaterThan(0);
      // An audit-derived suggestion is never pre-approved.
      expect(suggestion.exactPreviewReady).toBe(false);
    }
  });

  it("counts a permanently closed listing as critical", () => {
    const audit = buildPublicProfileAudit({ location, details: bare, nowIso: now });
    const status = audit.findings.find((f) => f.id === "finding_places_business_status");
    expect(status?.severity).toBe("critical");
    expect(audit.summary.criticalFindings).toBeGreaterThan(0);
  });
});
