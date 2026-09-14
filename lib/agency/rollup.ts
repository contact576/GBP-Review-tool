import type { AgencyClient, AgencyClientLive } from "@/lib/data/types";

/**
 * The agency client book, made live — the pure half.
 *
 * The book itself (`dataset_meta.agency.clients`) stores what the agency
 * entered: the client's contact email and when the last branded report went
 * out. Everything a client *is* — its name, rating, reviews, plan, whether its
 * listing is linked, whether the client can log in — lives in the client's own
 * workspace and must be read from there on every render, or the book drifts
 * from reality within a day.
 *
 * Both providers call this with the stored entry and a live read of the
 * child workspace, so the health rule and the trend rule are written once
 * and unit-tested against fixtures rather than against a database.
 */

export const NEW_REVIEWS_WINDOW_DAYS = 30;

/** How many measured Growth Scores make up the trail in the client book. */
export const TREND_POINTS = 6;

/** How many calendar months the portfolio review chart spans. */
export const REVIEW_MONTHS = 6;

export function clientStatus(growthScore: number, needsReply: number): AgencyClient["status"] {
  if (growthScore < 50 || needsReply > 7) return "at_risk";
  if (growthScore < 70 || needsReply > 3) return "attention";
  return "healthy";
}

/**
 * Measured Growth Scores, oldest first. A snapshot counts only when its
 * scores came from Google-sourced data (`sources.scores` set); demo fixtures
 * and un-synced workspaces contribute nothing, so the trail is never a curve
 * drawn around a single guessed number.
 */
export function growthTrend(
  metrics: AgencyClientLive["metrics"],
  points: number = TREND_POINTS,
): number[] {
  const trusted = metrics
    .filter((snapshot) => Boolean(snapshot.sources?.scores))
    .sort((a, b) => a.date.localeCompare(b.date));
  return trusted.slice(-points).map((snapshot) => snapshot.growthScore);
}

/**
 * Reviews per calendar month for the last `months` months, oldest first and
 * ending with the current month — the buckets are always present so charts
 * across clients line up, and a month with nothing detected is an honest 0.
 */
export function reviewsByMonth(
  reviews: AgencyClientLive["reviews"],
  now: Date = new Date(),
  months: number = REVIEW_MONTHS,
): { month: string; count: number }[] {
  const buckets = Array.from({ length: months }, (_, offset) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - offset), 1));
    return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, count: 0 };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.month, bucket]));
  for (const review of reviews) {
    const bucket = byKey.get(review.publishedAt.slice(0, 7));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export function rollupAgencyClient(
  stored: AgencyClient,
  live: AgencyClientLive,
  now: Date = new Date(),
): AgencyClient {
  const cutoff = now.getTime() - NEW_REVIEWS_WINDOW_DAYS * 86_400_000;
  const trend = growthTrend(live.metrics);
  const growthScore = trend.length ? trend[trend.length - 1]! : 0;
  const needsReply = live.reviews.filter((review) => review.needsReply).length;
  const newReviews30d = live.reviews.filter(
    (review) => new Date(review.publishedAt).getTime() >= cutoff,
  ).length;
  const lastReviewAt = live.reviews.reduce<string | undefined>(
    (latest, review) => (!latest || review.publishedAt > latest ? review.publishedAt : latest),
    undefined,
  );
  return {
    ...stored,
    workspaceId: live.workspaceId,
    name: live.name,
    city: live.city,
    growthScore,
    rating: live.rating,
    reviewCount: live.reviewCount,
    newReviews30d,
    needsReply,
    plan: live.tier,
    status: clientStatus(growthScore, needsReply),
    trend,
    googleLinked: live.googleLinked,
    gbpConnected: live.gbpConnected,
    ownerEmail: live.ownerEmail,
    ownerHasLogin: live.ownerHasLogin,
    reviewsByMonth: reviewsByMonth(live.reviews, now),
    lastReviewAt,
  };
}

/**
 * Merge the stored book with live reads. A book entry whose workspace can no
 * longer be read (deleted out from under the agency, or not a sibling any
 * more) is returned as stored, so the agency still sees it and can remove it.
 */
export function rollupAgencyBook(
  stored: AgencyClient[],
  live: Map<string, AgencyClientLive>,
  now: Date = new Date(),
): AgencyClient[] {
  return stored.map((entry) => {
    const child = live.get(entry.locationId);
    return child ? rollupAgencyClient(entry, child, now) : entry;
  });
}
