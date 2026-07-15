import "server-only";
import type { GoogleCredential } from "@/lib/data/provider";
import type { Location, MetricSnapshot, Review } from "@/lib/data/types";
import { computePublicScore } from "@/lib/data/selectors";
import { decryptSecret } from "./crypto";
import {
  listAccounts,
  listLocations,
  listReviews,
  refreshAccessToken,
  type GbpReview,
} from "./gbp";
import { daysSince, GBP_REVIEW_ID_PREFIX } from "./public-sync";

/**
 * Google Business Profile (owned-profile) sync — the deeper integration that
 * imports your FULL review history and drives real dashboard numbers.
 *
 * GATED BY GOOGLE APPROVAL: GBP API access is granted per Cloud project and
 * typically takes 1–2 weeks. Until then every call 403s and this returns
 * `{ ok: true, pendingApproval: true }` so the app waits honestly instead of
 * pretending. This path is built and unit-tested for parsing/gating, but it
 * has NOT been exercised against live GBP data (approval pending).
 */

export { GBP_REVIEW_ID_PREFIX };

export interface ProfileSyncOutcome {
  ok: boolean;
  pendingApproval?: boolean;
  error?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: Review[];
  snapshot?: MetricSnapshot;
}

export async function fetchGoogleProfile(
  credential: GoogleCredential | null,
  location: Location,
  nowIso: string,
): Promise<ProfileSyncOutcome> {
  if (!credential) {
    return {
      ok: false,
      error:
        "Google Business Profile isn't connected yet — connect it in Settings → Integrations.",
    };
  }
  const refreshToken = decryptSecret(credential.encryptedRefreshToken);
  if (!refreshToken) {
    return { ok: false, error: "Stored Google credential couldn't be read — reconnect Google." };
  }

  const token = await refreshAccessToken(refreshToken);
  if (!token.ok) {
    return {
      ok: false,
      error:
        token.reason === "unauthorized"
          ? "Google connection expired — reconnect Google in Settings → Integrations."
          : token.detail,
    };
  }
  const accessToken = token.data.accessToken;

  const located = await resolveLocationResource(accessToken, credential, location);
  if (!located.ok) {
    if (located.pendingApproval) return { ok: true, pendingApproval: true };
    return { ok: false, error: located.error };
  }

  const reviewsRes = await listReviews(accessToken, located.resource);
  if (!reviewsRes.ok) {
    if (reviewsRes.reason === "not_approved") return { ok: true, pendingApproval: true };
    return { ok: false, error: reviewsRes.detail };
  }

  const page = reviewsRes.data;
  const reviews = mapReviews(page.reviews, location.id, nowIso);
  const reviewCount = page.totalReviewCount || reviews.length;
  const rating = page.averageRating || aggregateRating(reviews);
  const snapshot = buildSnapshot(location, rating, reviewCount, reviews, nowIso);

  return { ok: true, rating, reviewCount, reviews, snapshot };
}

type ResolveResult =
  | { ok: true; resource: string }
  | { ok: false; pendingApproval?: boolean; error?: string };

/** Find "accounts/{a}/locations/{l}" for this workspace's Place ID. */
async function resolveLocationResource(
  accessToken: string,
  credential: GoogleCredential,
  location: Location,
): Promise<ResolveResult> {
  const accounts = await listAccounts(accessToken);
  if (!accounts.ok) {
    if (accounts.reason === "not_approved") return { ok: false, pendingApproval: true };
    return { ok: false, error: accounts.detail };
  }
  // Prefer the stored account when present, else scan all manageable accounts.
  const names = credential.googleAccount
    ? [credential.googleAccount, ...accounts.data.map((a) => a.name)]
    : accounts.data.map((a) => a.name);
  const seen = new Set<string>();

  for (const account of names) {
    if (seen.has(account)) continue;
    seen.add(account);
    const locs = await listLocations(accessToken, account);
    if (!locs.ok) {
      if (locs.reason === "not_approved") return { ok: false, pendingApproval: true };
      continue;
    }
    const match = location.googlePlaceId
      ? locs.data.find((l) => l.metadata?.placeId === location.googlePlaceId)
      : locs.data[0];
    if (match) return { ok: true, resource: `${account}/${match.name}` };
  }
  return {
    ok: false,
    error:
      "Couldn't find your business under the connected Google account. Make sure you connect the account that owns this profile.",
  };
}

function mapReviews(gbp: GbpReview[], locationId: string, nowIso: string): Review[] {
  return gbp.map((r, i) => ({
    id: `${GBP_REVIEW_ID_PREFIX}${r.reviewId || i}`,
    locationId,
    author: r.author,
    rating: r.rating,
    text: r.text,
    publishedAt: r.createTime ?? nowIso,
    source: "google" as const,
    durability: "stable" as const,
    needsReply: !r.reply,
  }));
}

function aggregateRating(reviews: Review[]): number {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function buildSnapshot(
  location: Location,
  rating: number,
  reviewCount: number,
  reviews: Review[],
  nowIso: string,
): MetricSnapshot {
  const now = new Date(nowIso).getTime();
  const mostRecent = reviews
    .map((r) => r.publishedAt)
    .filter(Boolean)
    .sort()
    .pop();
  const scores = computePublicScore({
    rating,
    reviewCount,
    daysSinceLastReview: reviewCount > 0 ? daysSince(mostRecent, now) : 999,
    photoCount: location.profile.photoCount,
    responseRate: location.profile.responseRate,
    profileCompleteness: location.profile.completeness,
  });
  return {
    locationId: location.id,
    date: nowIso.slice(0, 10),
    foundYou: 0,
    contactedYou: 0,
    newReviews: 0,
    growthScore: scores.growth,
    reviewsScore: scores.reviews,
    profileScore: scores.profile,
  };
}
