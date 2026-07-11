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

/** Compare the latest 30d window to the prior 30d window. */
export function sinceJoined(metrics: MetricSnapshot[]): SinceJoined {
  const last30 = metrics.slice(-30);
  const prev30 = metrics.slice(-60, -30);
  const sum = (arr: MetricSnapshot[], k: keyof MetricSnapshot) =>
    arr.reduce((a, m) => a + (m[k] as number), 0);
  const avg = (arr: MetricSnapshot[], k: keyof MetricSnapshot) =>
    arr.length ? Math.round(sum(arr, k) / arr.length) : 0;
  const pct = (nowV: number, prevV: number) =>
    prevV === 0 ? 0 : Math.round(((nowV - prevV) / prevV) * 100);

  const foundNow = avg(last30, "foundYou");
  const foundPrev = avg(prev30, "foundYou");
  const contactNow = avg(last30, "contactedYou");
  const contactPrev = avg(prev30, "contactedYou");
  const revNow = sum(last30, "newReviews");
  const revPrev = sum(prev30, "newReviews");

  return {
    foundYou: { now: foundNow, delta: pct(foundNow, foundPrev) },
    contactedYou: { now: contactNow, delta: pct(contactNow, contactPrev) },
    newReviews: { now: revNow, delta: pct(revNow, revPrev) },
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

/** Compute a public Local Growth Score from public-ish signals (free tool). */
export function computePublicScore(input: {
  rating: number;
  reviewCount: number;
  daysSinceLastReview: number;
  photoCount: number;
  responseRate: number;
  profileCompleteness: number;
}): { growth: number; reviews: number; profile: number } {
  const ratingScore = Math.min(100, (input.rating / 5) * 100);
  const countScore = Math.min(100, (input.reviewCount / 60) * 100);
  const recencyScore = Math.max(0, 100 - input.daysSinceLastReview * 2);
  const reviews = Math.round(ratingScore * 0.4 + countScore * 0.3 + recencyScore * 0.3);
  const profile = Math.round(
    Math.min(100, (input.photoCount / 20) * 100) * 0.3 +
      input.responseRate * 100 * 0.3 +
      input.profileCompleteness * 0.4,
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
