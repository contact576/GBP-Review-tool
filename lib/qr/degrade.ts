import type { QrScanContext, QrSubscriptionSnapshot } from "./types";

/**
 * Degrade behaviour for printed QR codes.
 *
 * Printed codes live on table tents, counter cards and staff badges. They
 * outlive subscriptions, so a lapse must never turn physical print into a dead
 * end. The product promise is: when the plan lapses, scans keep working by
 * redirecting straight to the business's own public Google review page for a
 * fixed grace window; only after that window do scans land on the plain
 * "code isn't active" page.
 *
 * Everything here is pure so the exact same decision is made by the data
 * providers (which decide whether to mint) and by the public /q/{slug} route
 * (which decides where to send the scanner).
 */

/** Length of the grace window promised in the Studio, in days. */
export const QR_GRACE_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * Statuses that mean paid access has genuinely ENDED.
 *
 * `past_due` is dunning (Stripe is still retrying) and `paused` is a
 * deliberate, reversible hold — codes keep full function in both, because
 * degrading them early would break working print for a customer who has not
 * actually left. Only `canceled` is a lapse.
 */
export function isLapsedSubscription(status: string | null | undefined): boolean {
  return status === "canceled";
}

/**
 * An asset behaves as degraded when it is explicitly flagged OR when the
 * workspace subscription has lapsed. The second half is what makes the grace
 * window self-triggering: no cron, no webhook and no backfill is required for
 * the promise to hold — the state is derived at scan time from real billing
 * data.
 */
export function isAssetEffectivelyDegraded(input: {
  degraded: boolean;
  subscriptionStatus?: string | null;
}): boolean {
  return input.degraded || isLapsedSubscription(input.subscriptionStatus);
}

export type LapseAnchorSource = "current_period_end" | "trial_end";

export interface LapseAnchor {
  /** ISO timestamp the grace window is measured from. */
  at: string;
  source: LapseAnchorSource;
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function toMs(now: Date | string | undefined): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "string") {
    const parsed = Date.parse(now);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * When paid access ended, taken from real billing data rather than a
 * hardcoded date: the end of the last paid period, falling back to the trial
 * end for a subscription that lapsed before it ever billed.
 */
export function lapseAnchor(
  subscription: Partial<QrSubscriptionSnapshot> | null | undefined,
): LapseAnchor | null {
  if (!subscription) return null;
  const periodEnd = validIso(subscription.currentPeriodEnd);
  if (periodEnd) return { at: periodEnd, source: "current_period_end" };
  const trialEnd = validIso(subscription.trialEndsAt);
  if (trialEnd) return { at: trialEnd, source: "trial_end" };
  return null;
}

/** End of the grace window for a lapse that happened at `anchorIso`. */
export function graceEndsAt(
  anchorIso: string,
  graceDays: number = QR_GRACE_DAYS,
): string | null {
  const ms = Date.parse(anchorIso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + graceDays * DAY_MS).toISOString();
}

/**
 * Only ever hand a scanner an absolute http(s) URL. The review URL is
 * owner-supplied data, so a blank or malformed value must degrade to the
 * expired page rather than producing a broken or unsafe redirect.
 */
export function isSafeRedirectTarget(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export type QrDegradedOutcome =
  | {
      kind: "google_review";
      url: string;
      /** ISO end of the window, or null when the lapse date is unknown. */
      graceEndsAt: string | null;
      basis: "within_grace" | "lapse_date_unknown";
    }
  | {
      kind: "expired";
      reason: "grace_elapsed" | "no_review_url";
      graceEndsAt: string | null;
    };

/**
 * Where a scan of a degraded code should go.
 *
 * - inside the window → the business's public Google review page;
 * - after it → the honest expired page;
 * - no usable review URL → the expired page (we cannot keep the promise, and
 *   pretending otherwise would send the customer to a broken link);
 * - lapse date unknown → the Google page. We cannot prove the window has
 *   elapsed, and the customer landing somewhere useful is never the wrong
 *   answer; this errs generous, never short.
 */
export function resolveDegradedScan(input: {
  reviewUrl?: string | null;
  lapsedAt?: string | null;
  now?: Date | string;
  graceDays?: number;
}): QrDegradedOutcome {
  const anchor = validIso(input.lapsedAt);
  const ends = anchor ? graceEndsAt(anchor, input.graceDays ?? QR_GRACE_DAYS) : null;
  const url = input.reviewUrl?.trim() ?? "";

  if (!isSafeRedirectTarget(url)) {
    return { kind: "expired", reason: "no_review_url", graceEndsAt: ends };
  }
  if (!ends) {
    return { kind: "google_review", url, graceEndsAt: null, basis: "lapse_date_unknown" };
  }
  if (toMs(input.now) >= Date.parse(ends)) {
    return { kind: "expired", reason: "grace_elapsed", graceEndsAt: ends };
  }
  return { kind: "google_review", url, graceEndsAt: ends, basis: "within_grace" };
}

/** `resolveDegradedScan` driven straight off a scan context. */
export function resolveDegradedScanContext(
  context: QrScanContext,
  now?: Date | string,
): QrDegradedOutcome {
  return resolveDegradedScan({
    reviewUrl: context.reviewUrl,
    lapsedAt: lapseAnchor(context.subscription)?.at ?? null,
    now,
  });
}
