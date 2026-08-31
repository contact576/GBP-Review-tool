import type { PlaceDetails } from "./places";
import type {
  Location,
  LocalGrowthAudit,
  MetricSnapshot,
  ProfileSuggestion,
  Review,
} from "@/lib/data/types";
import { computePublicScore } from "@/lib/data/selectors";
import { buildPublicProfileAudit } from "@/lib/audit/public-audit";
import { buildSuggestionInbox } from "@/lib/suggestions/inbox";
import { PRE_RECONCILE_DURABILITY } from "@/lib/reviews/durability";

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

/**
 * Content-derived id for a public sample review.
 *
 * The Places sample has no review id and Google rotates which ≤5 it returns, so
 * a positional id (`..._0`, `..._1`) renames the same review between syncs and
 * loses everything we learned about it. Hashing the immutable content instead
 * gives the same review the same id every time, which is what lets durability
 * and match attribution survive a refresh. FNV-1a: tiny, dependency-free, and
 * only ever used as a local key (never as a security primitive).
 */
export function publicSampleReviewId(
  locationId: string,
  review: { author: string; text: string; publishedAt?: string },
): string {
  const seed = `${review.author}|${review.publishedAt ?? ""}|${review.text}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${PUBLIC_REVIEW_ID_PREFIX}${locationId}_${hash.toString(36)}`;
}

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
  /**
   * Profile audit derived from the public listing. Callers must only persist
   * this when no Business Profile snapshot exists — a real GBP audit sees far
   * more and must never be overwritten by the public one.
   */
  audit: LocalGrowthAudit;
  /** Inbox entries built from `audit`, same shape the GBP path produces. */
  suggestions: ProfileSuggestion[];
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
    .map((r) => ({
      id: publicSampleReviewId(location.id, r),
      locationId: location.id,
      author: r.author,
      rating: r.rating,
      text: r.text,
      publishedAt: r.publishedAt ?? nowIso,
      source: "google",
      // Provisional only. The public sample is a rotating ≤5 subset, so absence
      // from it proves nothing; the provider reconciles this against stored
      // history (lib/reviews/durability.ts) and that is what decides the value.
      durability: PRE_RECONCILE_DURABILITY,
      needsReply: false,
    }));

  const snapshot: MetricSnapshot = {
    locationId: location.id,
    date: nowIso.slice(0, 10),
    window: "rolling_30d",
    sources: { scores: "google_places" },
    foundYou: 0,
    contactedYou: 0,
    newReviews: 0,
    growthScore: scores.growth,
    reviewsScore: scores.reviews,
    profileScore: scores.profile,
  };

  const audit = buildPublicProfileAudit({ location, details, nowIso });

  return {
    rating: details.rating,
    reviewCount: details.reviewCount,
    reviews,
    snapshot,
    syncedAt: nowIso,
    audit,
    suggestions: buildSuggestionInbox(audit),
  };
}

/** Merge today's snapshot into an existing metric series (replace same-day). */
export function upsertSnapshot(
  metrics: MetricSnapshot[],
  snapshot: MetricSnapshot,
): MetricSnapshot[] {
  const existing = metrics.find((m) => m.date === snapshot.date);
  const hasProvenance = Boolean(existing?.sources || snapshot.sources);
  let next = snapshot;

  // A public-score refresh and a GBP performance refresh may land on the same
  // date. Merge only fields whose source is present so one sync cannot erase
  // another integration's trustworthy metrics with placeholder zeros.
  if (existing && hasProvenance) {
    const incoming = snapshot.sources ?? {};
    next = {
      ...existing,
      ...snapshot,
      foundYou: incoming.foundYou ? snapshot.foundYou : existing.foundYou,
      contactedYou: incoming.contactedYou
        ? snapshot.contactedYou
        : existing.contactedYou,
      newReviews: incoming.newReviews ? snapshot.newReviews : existing.newReviews,
      growthScore: incoming.scores ? snapshot.growthScore : existing.growthScore,
      reviewsScore: incoming.scores ? snapshot.reviewsScore : existing.reviewsScore,
      profileScore: incoming.scores ? snapshot.profileScore : existing.profileScore,
      sources: { ...existing.sources, ...snapshot.sources },
    };
  }

  return [...metrics.filter((m) => m.date !== snapshot.date), next].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
