import { describe, expect, it } from "vitest";
import {
  QR_GRACE_DAYS,
  graceEndsAt,
  isAssetEffectivelyDegraded,
  isLapsedSubscription,
  isSafeRedirectTarget,
  lapseAnchor,
  resolveDegradedScan,
} from "@/lib/qr/degrade";

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=PLACE_123";
const DAY = 86_400_000;

function iso(offsetDays: number, from = Date.now()): string {
  return new Date(from + offsetDays * DAY).toISOString();
}

describe("subscription lapse detection", () => {
  it("treats only a cancelled subscription as a lapse", () => {
    expect(isLapsedSubscription("canceled")).toBe(true);
    for (const status of ["active", "trialing", "free", "paused", null, undefined]) {
      expect(isLapsedSubscription(status)).toBe(false);
    }
  });

  it("keeps codes fully live during dunning — past_due is not a lapse", () => {
    // Stripe is still retrying; degrading print here would break a customer
    // who has not actually left.
    expect(isAssetEffectivelyDegraded({ degraded: false, subscriptionStatus: "past_due" })).toBe(false);
  });

  it("degrades on the stored flag OR a lapsed subscription", () => {
    expect(isAssetEffectivelyDegraded({ degraded: true, subscriptionStatus: "active" })).toBe(true);
    expect(isAssetEffectivelyDegraded({ degraded: false, subscriptionStatus: "canceled" })).toBe(true);
    expect(isAssetEffectivelyDegraded({ degraded: false, subscriptionStatus: "active" })).toBe(false);
  });
});

describe("grace window anchoring", () => {
  it("anchors on the end of the last paid period", () => {
    const at = iso(-10);
    expect(lapseAnchor({ status: "canceled", currentPeriodEnd: at, trialEndsAt: iso(-90) })).toEqual({
      at,
      source: "current_period_end",
    });
  });

  it("falls back to the trial end when a trial lapsed before it ever billed", () => {
    const at = iso(-3);
    expect(lapseAnchor({ status: "canceled", currentPeriodEnd: null, trialEndsAt: at })).toEqual({
      at,
      source: "trial_end",
    });
  });

  it("reports no anchor rather than inventing one", () => {
    expect(lapseAnchor({ status: "canceled", currentPeriodEnd: null, trialEndsAt: null })).toBeNull();
    expect(lapseAnchor({ currentPeriodEnd: "not-a-date" })).toBeNull();
    expect(lapseAnchor(null)).toBeNull();
  });

  it("measures the promised window from the anchor", () => {
    const anchor = "2026-01-01T00:00:00.000Z";
    expect(graceEndsAt(anchor)).toBe(new Date(Date.parse(anchor) + QR_GRACE_DAYS * DAY).toISOString());
    expect(graceEndsAt("nonsense")).toBeNull();
  });
});

describe("redirect target safety", () => {
  it("accepts absolute http(s) review URLs only", () => {
    expect(isSafeRedirectTarget(REVIEW_URL)).toBe(true);
    expect(isSafeRedirectTarget("http://example.com/review")).toBe(true);
    expect(isSafeRedirectTarget("")).toBe(false);
    expect(isSafeRedirectTarget(undefined)).toBe(false);
    expect(isSafeRedirectTarget("/relative/path")).toBe(false);
    expect(isSafeRedirectTarget("javascript:alert(1)")).toBe(false);
  });
});

describe("degraded scan destination", () => {
  it("sends the scanner to the public Google review page inside the window", () => {
    const outcome = resolveDegradedScan({
      reviewUrl: REVIEW_URL,
      lapsedAt: iso(-30),
      now: new Date(),
    });
    expect(outcome).toMatchObject({ kind: "google_review", url: REVIEW_URL, basis: "within_grace" });
  });

  it("still redirects on the last day of the window", () => {
    const lapsedAt = iso(-(QR_GRACE_DAYS - 1));
    const outcome = resolveDegradedScan({ reviewUrl: REVIEW_URL, lapsedAt, now: new Date() });
    expect(outcome.kind).toBe("google_review");
  });

  it("falls to the honest expired page once the window has elapsed", () => {
    const outcome = resolveDegradedScan({
      reviewUrl: REVIEW_URL,
      lapsedAt: iso(-(QR_GRACE_DAYS + 1)),
      now: new Date(),
    });
    expect(outcome).toMatchObject({ kind: "expired", reason: "grace_elapsed" });
  });

  it("expires exactly at the boundary, not a day late", () => {
    const lapsedAt = "2026-01-01T00:00:00.000Z";
    const boundary = graceEndsAt(lapsedAt)!;
    expect(resolveDegradedScan({ reviewUrl: REVIEW_URL, lapsedAt, now: boundary }).kind).toBe("expired");
    expect(
      resolveDegradedScan({ reviewUrl: REVIEW_URL, lapsedAt, now: new Date(Date.parse(boundary) - 1000) }).kind,
    ).toBe("google_review");
  });

  it("never sends a customer to a blank or unsafe review URL", () => {
    expect(resolveDegradedScan({ reviewUrl: "", lapsedAt: iso(-1) })).toMatchObject({
      kind: "expired",
      reason: "no_review_url",
    });
  });

  it("errs generous when the lapse cannot be dated", () => {
    const outcome = resolveDegradedScan({ reviewUrl: REVIEW_URL, lapsedAt: null });
    expect(outcome).toMatchObject({
      kind: "google_review",
      basis: "lapse_date_unknown",
      graceEndsAt: null,
    });
  });
});
