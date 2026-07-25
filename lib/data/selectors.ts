import type {
  FoundlyData,
  MetricSnapshot,
  Review,
  ReviewRequest,
  Customer,
} from "./types";

/** Pure derived-metric helpers shared across dashboard, reports, free-score. */

export interface FunnelCounts {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  posted: number;
}

export function funnelCounts(requests: ReviewRequest[]): FunnelCounts {
  const reached = (s: ReviewRequest["status"], order: number) => {
    const rank: Record<ReviewRequest["status"], number> = {
      queued: 0, suppressed: 0, failed: 0,
      sent: 1, delivered: 2, opened: 3, clicked: 4,
      posted_google: 5, private_feedback: 4,
    };
    return rank[s] >= order;
  };
  return {
    sent: requests.filter((r) => reached(r.status, 1)).length,
    delivered: requests.filter((r) => reached(r.status, 2)).length,
    opened: requests.filter((r) => reached(r.status, 3)).length,
    clicked: requests.filter((r) => reached(r.status, 4)).length,
    posted: requests.filter((r) => r.status === "posted_google").length,
  };
}

/** Monthly review velocity from imported timestamps (last N months). */
export function monthlyVelocity(reviews: Review[], months = 6): { label: string; count: number }[] {
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(d.toLocaleString("en", { month: "short" }), 0);
  }
  for (const rev of reviews) {
    const d = new Date(rev.publishedAt);
    const label = d.toLocaleString("en", { month: "short" });
    if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([label, count]) => ({ label, count }));
}

/** Baseline velocity before joining vs now (for the "since you joined" story). */
export function baselineVelocity(reviews: Review[], joinedAt: string): { before: number; after: number } {
  const join = new Date(joinedAt).getTime();
  const monthMs = 30 * 86_400_000;
  const before = reviews.filter((r) => new Date(r.publishedAt).getTime() < join);
  const after = reviews.filter((r) => new Date(r.publishedAt).getTime() >= join);
  const beforeMonths = Math.max(1, (join - new Date(before[before.length - 1]?.publishedAt ?? joinedAt).getTime()) / monthMs);
  const afterMonths = Math.max(1, (Date.now() - join) / monthMs);
  return {
    before: Math.round((before.length / beforeMonths) * 10) / 10,
    after: Math.round((after.length / afterMonths) * 10) / 10,
  };
}

export interface SinceJoined {
  foundYou: { now: number; delta: number };
  contactedYou: { now: number; delta: number };
  newReviews: { now: number; delta: number };
}

/** Compare the latest rolling-30d observation to the observation 30 days prior. */
export function sinceJoined(metrics: MetricSnapshot[]): SinceJoined {
  const ordered = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ordered[ordered.length - 1];
  if (!latest) {
    return {
      foundYou: { now: 0, delta: 0 },
      contactedYou: { now: 0, delta: 0 },
      newReviews: { now: 0, delta: 0 },
    };
  }
  const latestAt = new Date(`${latest.date}T00:00:00Z`).getTime();
  const priorCutoff = latestAt - 30 * 86_400_000;
  const prior = [...ordered]
    .reverse()
    .find((point) => new Date(`${point.date}T00:00:00Z`).getTime() <= priorCutoff) ?? ordered[0] ?? latest;
  const pct = (nowV: number, prevV: number) =>
    prevV === 0 ? 0 : Math.round(((nowV - prevV) / prevV) * 100);

  return {
    foundYou: { now: latest.foundYou, delta: pct(latest.foundYou, prior.foundYou) },
    contactedYou: {
      now: latest.contactedYou,
      delta: pct(latest.contactedYou, prior.contactedYou),
    },
    newReviews: {
      now: latest.newReviews,
      delta: pct(latest.newReviews, prior.newReviews),
    },
  };
}

/** Latest Local Growth Score + sub-scores. */
export function currentScore(metrics: MetricSnapshot[]): {
  growth: number;
  reviews: number;
  profile: number;
  delta: number;
} {
  const latest = metrics[metrics.length - 1];
  const monthAgo = metrics[Math.max(0, metrics.length - 31)];
  if (!latest) return { growth: 0, reviews: 0, profile: 0, delta: 0 };
  return {
    growth: latest.growthScore,
    reviews: latest.reviewsScore,
    profile: latest.profileScore,
    delta: latest.growthScore - (monthAgo?.growthScore ?? latest.growthScore),
  };
}

export function needsReplyReviews(reviews: Review[]): Review[] {
  return reviews.filter((r) => r.needsReply);
}

export function marketingConsented(customers: Customer[]): number {
  return customers.filter((c) => c.consent.marketingConsent && !c.consent.withdrawnAt).length;
}

export function sparklinePoints(metrics: MetricSnapshot[], key: keyof MetricSnapshot, n = 30): number[] {
  return metrics.slice(-n).map((m) => m[key] as number);
}

/**
 * Sub-score weights. Each sums to 1 when every signal is present; when a signal
 * is genuinely unknowable the remaining weights are renormalised (see below).
 */
const REVIEW_WEIGHTS = { rating: 0.4, count: 0.3, recency: 0.3 } as const;
const PROFILE_WEIGHTS = { photos: 0.3, responseRate: 0.3, completeness: 0.4 } as const;

/**
 * Compute a public Local Growth Score from real signals.
 *
 * Every input must be MEASURED — this function is the last stop before a number
 * reaches a user, and it must never be fed an estimate.
 *
 * Two inputs are OPTIONAL because they are not always knowable:
 *
 *  · `responseRate` — whether an owner replied is never exposed by Google's
 *    public APIs. Business Profile sync has it; the public free-score tool
 *    does not.
 *  · `daysSinceLastReview` — derivable only when Google returns at least one
 *    timestamped review. (A business with zero reviews is a KNOWN fact, not an
 *    unknown one: callers pass a large number for it.)
 *
 * When either is omitted its sub-score is renormalised across the signals that
 * remain, preserving their relative weights (e.g. photos 0.3/0.7 and
 * completeness 0.4/0.7) rather than scoring a missing signal as zero — which
 * would fabricate a penalty the business never earned.
 */
export function computePublicScore(input: {
  rating: number;
  reviewCount: number;
  /** Days since the newest known review. Omit when no timestamp is knowable. */
  daysSinceLastReview?: number;
  photoCount: number;
  /** Share of reviews the owner replied to (0..1). Omit when not knowable. */
  responseRate?: number;
  profileCompleteness: number;
}): { growth: number; reviews: number; profile: number } {
  const ratingScore = Math.min(100, (input.rating / 5) * 100);
  const countScore = Math.min(100, (input.reviewCount / 60) * 100);
  const weightedReviews =
    ratingScore * REVIEW_WEIGHTS.rating + countScore * REVIEW_WEIGHTS.count;
  const reviews = Math.round(
    input.daysSinceLastReview === undefined
      ? weightedReviews / (REVIEW_WEIGHTS.rating + REVIEW_WEIGHTS.count)
      : weightedReviews +
          Math.max(0, 100 - input.daysSinceLastReview * 2) * REVIEW_WEIGHTS.recency,
  );

  const photoScore = Math.min(100, (input.photoCount / 20) * 100);
  const completenessScore = Math.min(100, Math.max(0, input.profileCompleteness));
  const weighted =
    photoScore * PROFILE_WEIGHTS.photos + completenessScore * PROFILE_WEIGHTS.completeness;
  const profile = Math.round(
    input.responseRate === undefined
      ? weighted / (PROFILE_WEIGHTS.photos + PROFILE_WEIGHTS.completeness)
      : weighted + input.responseRate * 100 * PROFILE_WEIGHTS.responseRate,
  );

  const growth = Math.round(reviews * 0.6 + profile * 0.4);
  return { growth, reviews, profile };
}

export function scoreBand(score: number): "low" | "mid" | "high" {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

export type { FoundlyData };
