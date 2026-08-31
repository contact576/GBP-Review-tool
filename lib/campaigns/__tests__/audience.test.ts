import { describe, expect, it } from "vitest";
import {
  EXCLUSION_REASONS,
  buildAudienceSnapshot,
  decideEligibility,
  isGloballySuppressed,
  personalize,
} from "../audience";
import { consent, customer, suppressionEntry } from "./fixtures";

/**
 * The consent gate. Everything else in the campaign pipeline is a convenience;
 * this is the part that keeps the product legal, so it is tested from the
 * outside in — "would this person receive the email?" — not by poking at
 * internals.
 */

const NOW = new Date("2026-07-25T15:00:00.000Z");

describe("campaign audience — marketing consent", () => {
  it("excludes a customer who never opted in to marketing", () => {
    const snapshot = buildAudienceSnapshot({
      customers: [
        customer({ id: "c_in" }),
        customer({ id: "c_out", consent: consent({ marketingConsent: false }) }),
      ],
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });

    expect(snapshot.eligible).toBe(1);
    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(["c_in"]);
    expect(snapshot.excluded).toContainEqual({
      reason: EXCLUSION_REASONS.noMarketingConsent,
      count: 1,
    });
  });

  it("excludes a customer who opted in then withdrew, and says so distinctly", () => {
    const snapshot = buildAudienceSnapshot({
      customers: [
        customer({ id: "c_in" }),
        customer({
          id: "c_gone",
          consent: consent({ withdrawnAt: "2026-06-01T00:00:00.000Z" }),
        }),
      ],
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });

    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(["c_in"]);
    expect(snapshot.excluded).toContainEqual({ reason: EXCLUSION_REASONS.withdrawn, count: 1 });
  });

  it("does NOT treat service consent as permission to send marketing", () => {
    const serviceOnly = customer({
      id: "c_service",
      consent: consent({ serviceConsent: true, marketingConsent: false }),
    });

    expect(
      decideEligibility({
        customer: serviceOnly,
        consentBasis: "marketing",
        channel: "email",
        suppression: [],
      }).eligible,
    ).toBe(false);
    expect(
      decideEligibility({
        customer: serviceOnly,
        consentBasis: "service",
        channel: "email",
        suppression: [],
      }).eligible,
    ).toBe(true);
  });
});

describe("campaign audience — suppression", () => {
  it("excludes a per-customer suppression even with valid consent", () => {
    const snapshot = buildAudienceSnapshot({
      customers: [
        customer({ id: "c_ok" }),
        customer({ id: "c_bounced", suppressedReason: "Hard bounce" }),
      ],
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });

    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(["c_ok"]);
    expect(snapshot.excluded).toContainEqual({ reason: EXCLUSION_REASONS.suppressed, count: 1 });
  });

  it("excludes a globally suppressed phone regardless of its formatting", () => {
    const stopped = customer({ id: "c_stop", phone: "+1 (415) 555-0199" });
    const suppression = [suppressionEntry({ matchType: "phone", value: "4155550199" })];

    expect(isGloballySuppressed(stopped, suppression)).toBe(true);

    const snapshot = buildAudienceSnapshot({
      customers: [customer({ id: "c_ok" }), stopped],
      suppression,
      consentBasis: "marketing",
      channel: "sms",
      now: NOW,
    });
    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(["c_ok"]);
    expect(snapshot.excluded).toContainEqual({ reason: EXCLUSION_REASONS.globalOptOut, count: 1 });
  });

  it("excludes a globally suppressed email and its whole domain", () => {
    const snapshot = buildAudienceSnapshot({
      customers: [
        customer({ id: "c_ok", email: "ok@good.test" }),
        customer({ id: "c_addr", email: "blocked@good.test" }),
        customer({ id: "c_dom", email: "anyone@spamtrap.test" }),
      ],
      suppression: [
        suppressionEntry({ matchType: "email", value: "blocked@good.test" }),
        suppressionEntry({ matchType: "domain", value: "spamtrap.test" }),
      ],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });

    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(["c_ok"]);
    expect(snapshot.excluded).toContainEqual({ reason: EXCLUSION_REASONS.globalOptOut, count: 2 });
  });
});

describe("campaign audience — channel reachability", () => {
  it("drops customers with no destination for the chosen channel", () => {
    const byEmail = buildAudienceSnapshot({
      customers: [customer({ id: "c_ok" }), customer({ id: "c_nomail", email: undefined })],
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });
    expect(byEmail.excluded).toContainEqual({ reason: EXCLUSION_REASONS.noEmail, count: 1 });

    const bySms = buildAudienceSnapshot({
      customers: [
        customer({ id: "c_ok" }),
        customer({ id: "c_nophone", phone: undefined }),
        customer({ id: "c_badphone", phone: "555-0100" }),
      ],
      suppression: [],
      consentBasis: "marketing",
      channel: "sms",
      now: NOW,
    });
    expect(bySms.eligible).toBe(1);
    expect(bySms.excluded).toContainEqual({ reason: EXCLUSION_REASONS.noPhone, count: 1 });
    expect(bySms.excluded).toContainEqual({ reason: EXCLUSION_REASONS.badPhone, count: 1 });
  });

  it("counts every excluded customer exactly once so the totals reconcile", () => {
    const customers = [
      customer({ id: "c_ok" }),
      customer({ id: "c_noconsent", consent: consent({ marketingConsent: false }) }),
      customer({ id: "c_suppressed", suppressedReason: "Complaint" }),
      customer({ id: "c_nomail", email: undefined }),
    ];
    const snapshot = buildAudienceSnapshot({
      customers,
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });

    const excludedTotal = snapshot.excluded.reduce((sum, entry) => sum + entry.count, 0);
    expect(snapshot.eligible + excludedTotal).toBe(customers.length);
    expect(snapshot.total).toBe(customers.length);
  });
});

describe("campaign audience — snapshot immutability", () => {
  it("does not rewrite a frozen snapshot when consent changes afterwards", () => {
    const opted = customer({ id: "c_a" });
    const customers = [opted, customer({ id: "c_b" })];

    const snapshot = buildAudienceSnapshot({
      customers,
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });
    expect(snapshot.eligible).toBe(2);
    const frozenIds = snapshot.recipients.map((r) => r.customerId);

    // The customer unsubscribes AFTER the send was committed.
    opted.consent = consent({ marketingConsent: false });

    // The historical record is untouched...
    expect(snapshot.eligible).toBe(2);
    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(frozenIds);
    expect(snapshot.takenAt).toBe(NOW.toISOString());

    // ...while a freshly computed audience reflects the withdrawal.
    const later = buildAudienceSnapshot({
      customers,
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: new Date("2026-07-26T15:00:00.000Z"),
    });
    expect(later.recipients.map((r) => r.customerId)).toEqual(["c_b"]);
  });

  it("carries the real destination so a scheduled send needs no re-derivation", () => {
    const snapshot = buildAudienceSnapshot({
      customers: [customer({ id: "c_a", email: "sam@example.test" })],
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW,
    });
    expect(snapshot.recipients[0]?.destination).toBe("sam@example.test");
    expect(snapshot.recipients[0]?.outcome).toBe("pending");
  });
});

describe("personalisation", () => {
  it("substitutes the tokens the composer advertises", () => {
    expect(personalize("Hi {first_name}, welcome back.", "Sam Rivera")).toBe(
      "Hi Sam, welcome back.",
    );
    expect(personalize("Hi {name}.", "Sam Rivera")).toBe("Hi Sam Rivera.");
    expect(personalize("Hi {first_name}.", "  ")).toBe("Hi there.");
  });
});
