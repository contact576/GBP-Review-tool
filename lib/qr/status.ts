import {
  QR_GRACE_DAYS,
  graceEndsAt,
  isLapsedSubscription,
  isSafeRedirectTarget,
  lapseAnchor,
  type LapseAnchorSource,
} from "./degrade";
import type { QrSubscriptionSnapshot } from "./types";

/**
 * What the Studio is allowed to promise about printed codes, computed from the
 * same inputs the public scan endpoint uses. The UI must never claim behaviour
 * this object does not report.
 */
export interface QrDegradeStatus {
  /** Paid access has ended — codes are already redirecting to Google. */
  lapsed: boolean;
  /** A public Google review URL is on file, so there is somewhere to redirect. */
  hasReviewTarget: boolean;
  /** ISO end of the grace window; null when the lapse cannot be dated yet. */
  graceEndsAt: string | null;
  /** Which billing date the window is measured from. */
  anchorSource: LapseAnchorSource | null;
  /** Whole days of grace left; null when unknown or not lapsed. */
  daysLeft: number | null;
  graceDays: number;
}

const DAY_MS = 86_400_000;

export function qrDegradeStatus(input: {
  subscription: Partial<QrSubscriptionSnapshot> | null | undefined;
  reviewUrl: string | null | undefined;
  now?: Date | string;
  graceDays?: number;
}): QrDegradeStatus {
  const graceDays = input.graceDays ?? QR_GRACE_DAYS;
  const lapsed = isLapsedSubscription(input.subscription?.status);
  const anchor = lapseAnchor(input.subscription);
  const ends = anchor ? graceEndsAt(anchor.at, graceDays) : null;

  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : typeof input.now === "string" && Number.isFinite(Date.parse(input.now))
        ? Date.parse(input.now)
        : Date.now();

  const daysLeft =
    lapsed && ends ? Math.max(0, Math.ceil((Date.parse(ends) - nowMs) / DAY_MS)) : null;

  return {
    lapsed,
    hasReviewTarget: isSafeRedirectTarget(input.reviewUrl),
    graceEndsAt: ends,
    anchorSource: anchor?.source ?? null,
    daysLeft,
    graceDays,
  };
}

/**
 * Open rate as a whole percentage, or null when there is nothing real to
 * divide. Never returns a number the underlying counters cannot support.
 */
export function qrOpenRate(scans: number, pageOpens: number): number | null {
  if (!Number.isFinite(scans) || scans <= 0) return null;
  if (!Number.isFinite(pageOpens) || pageOpens < 0) return null;
  // Deliberately unclamped: opens are a strict subset of scans by construction,
  // so anything above 100% is a data fault the owner should be able to see.
  return Math.round((pageOpens / scans) * 100);
}
