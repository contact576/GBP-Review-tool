import { describe, expect, it } from "vitest";
import { QR_GRACE_DAYS } from "@/lib/qr/degrade";
import { qrDegradeStatus, qrOpenRate } from "@/lib/qr/status";

const DAY = 86_400_000;
const REVIEW_URL = "https://search.google.com/local/writereview?placeid=PLACE_123";

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString();
}

describe("Studio degrade status", () => {
  it("reports a healthy plan as not lapsed, with the promise deliverable", () => {
    const status = qrDegradeStatus({
      subscription: { status: "active", currentPeriodEnd: iso(20), trialEndsAt: null },
      reviewUrl: REVIEW_URL,
    });
    expect(status.lapsed).toBe(false);
    expect(status.hasReviewTarget).toBe(true);
    expect(status.daysLeft).toBeNull();
    expect(status.graceDays).toBe(QR_GRACE_DAYS);
  });

  it("reports the real remaining grace once the plan is cancelled", () => {
    const status = qrDegradeStatus({
      subscription: { status: "canceled", currentPeriodEnd: iso(-30), trialEndsAt: null },
      reviewUrl: REVIEW_URL,
    });
    expect(status.lapsed).toBe(true);
    expect(status.anchorSource).toBe("current_period_end");
    expect(status.daysLeft).toBe(QR_GRACE_DAYS - 30);
  });

  it("never reports negative days left after the window closes", () => {
    const status = qrDegradeStatus({
      subscription: { status: "canceled", currentPeriodEnd: iso(-(QR_GRACE_DAYS + 40)), trialEndsAt: null },
      reviewUrl: REVIEW_URL,
    });
    expect(status.daysLeft).toBe(0);
  });

  it("flags a missing Google review URL so the UI cannot promise a redirect", () => {
    const status = qrDegradeStatus({
      subscription: { status: "active", currentPeriodEnd: null, trialEndsAt: iso(9) },
      reviewUrl: "",
    });
    expect(status.hasReviewTarget).toBe(false);
  });
});

describe("open rate", () => {
  it("returns null rather than a fabricated 0% when nothing has been scanned", () => {
    expect(qrOpenRate(0, 0)).toBeNull();
    expect(qrOpenRate(-1, 5)).toBeNull();
  });

  it("computes a real ratio from independent counters", () => {
    expect(qrOpenRate(4, 1)).toBe(25);
    expect(qrOpenRate(200, 150)).toBe(75);
  });
});
