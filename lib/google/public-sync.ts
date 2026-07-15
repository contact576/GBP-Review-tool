import type { PlaceDetails } from "./places";
import type { Location, MetricSnapshot, Review } from "@/lib/data/types";
import { computePublicScore } from "@/lib/data/selectors";

/**
 * Pure transform: real public Google data (Places Place Details) → the pieces
 * a provider persists. Kept side-effect-free so it can be unit-tested without
 * a database or network.
 *
 * Honesty rules baked in here:
 *  - `reviewCount` is the REAL aggregate (every Google review), never the
 *    sample length.
 *  - `reviews` is a SAMPLE (≤5, all Google exposes publicly). Each is tagged
 *    with the PUBLIC_REVIEW_ID_PREFIX so it can be distinguished from — and
 *    replaced by — the full history a future Business Profile sync imports.
 *  - the score snapshot is COMPUTED from real inputs (rating, count, recency)
 *    via the same function the public free-score tool uses; activity metrics
 *    Google's public API can't provide (found/contacted/new-in-window) stay 0.
 */

/** Id conventions for machine-imported reviews (kept in this dependency-free
 *  module so the data layer can reference them without pulling server-only
 *  Google code into its static import graph). */
export const PUBLIC_REVIEW_ID_PREFIX = "rev_gpub_"; // Places public sample (≤5)
export const GBP_REVIEW_ID_PREFIX = "rev_gbp_"; // Business Profile full history

/** True for reviews imported from the public Places sample (not GBP history). */
export function isPublicSampleReview(id: string): boolean {
  return id.startsWith(PUBLIC_REVIEW_ID_PREFIX);
}

/** True for reviews imported from the Business Profile API (full history). */
export function isGbpReview(id: string): boolean {
  return id.startsWith(GBP_REVIEW_ID_PREFIX);
}

/** True for any machine-imported Google review (public sample or GBP). */
export function isImportedGoogleReview(id: string): boolean {
  return isPublicSampleReview(id) || isGbpReview(id);
}

export interface GooglePublicUpdate {
  rating: number;
  reviewCount: number;
  /** Sample review records (ids prefixed so a full sync can replace them). */
  reviews: Review[];
  /** Today's snapshot with a real computed score; activity fields are 0. */
  snapshot: MetricSnapshot;
  syncedAt: string;
}

/** Non-technical message for a Places lookup failure. */
export function friendlyPlacesError(reason: "no_key" | "not_found" | "error"): string {
  switch (reason) {
    case "no_key":
      return "Google lookup isn't configured yet (GOOGLE_MAPS_API_KEY).";
    case "not_found":
      return "We couldn't find this business on Google — re-match it in onboarding.";
    default:
      return "Google lookup failed — please try again in a moment.";
  }
}

export function daysSince(iso: string | undefined, now: number): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.round((now - t) / 86_400_000));
}

export function buildGooglePublicUpdate(
  details: PlaceDetails,
  location: Location,
  nowIso: string,
): GooglePublicUpdate {
  const now = new Date(nowIso).getTime();
  const mostRecent = details.reviews
    .map((r) => r.publishedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();
  const daysSinceLastReview =
    details.reviewCount > 0 ? daysSince(mostRecent, now) : 999;

  const scores = computePublicScore({
    rating: details.rating,
    reviewCount: details.reviewCount,
    daysSinceLastReview,
    photoCount: location.profile.photoCount,
    responseRate: location.profile.responseRate,
    profileCompleteness: location.profile.completeness,
  });

  const reviews: Review[] = details.reviews
    .filter((r) => r.text.trim().length > 0)
    .map((r, i) => ({
      id: `${PUBLIC_REVIEW_ID_PREFIX}${location.id}_${i}`,
      locationId: location.id,
      author: r.author,
      rating: r.rating,
      text: r.text,
      publishedAt: r.publishedAt ?? nowIso,
      source: "google",
      durability: "stable",
      needsReply: false,
    }));

  const snapshot: MetricSnapshot = {
    locationId: location.id,
    date: nowIso.slice(0, 10),
    foundYou: 0,
    contactedYou: 0,
    newReviews: 0,
    growthScore: scores.growth,
    reviewsScore: scores.reviews,
    profileScore: scores.profile,
  };

  return {
    rating: details.rating,
    reviewCount: details.reviewCount,
    reviews,
    snapshot,
    syncedAt: nowIso,
  };
}

/** Merge today's snapshot into an existing metric series (replace same-day). */
export function upsertSnapshot(
  metrics: MetricSnapshot[],
  snapshot: MetricSnapshot,
): MetricSnapshot[] {
  const withoutToday = metrics.filter((m) => m.date !== snapshot.date);
  return [...withoutToday, snapshot];
}
