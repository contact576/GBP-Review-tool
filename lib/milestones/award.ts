/**
 * Deciding which milestones a business has genuinely earned.
 *
 * Milestones were displayed and shareable long before anything awarded one:
 * outside the seeded demo workspace no code ever wrote a `Milestone`, so a real
 * business could pass 100 reviews and still be told "your first milestone is on
 * the way". This is the missing half.
 *
 * Every rule here reads a measured value and nothing else:
 *
 * - Review-count tiers read the Google review count from the latest sync. An
 *   unsynced workspace has a count of 0 and therefore earns nothing — the
 *   absence of a milestone is an honest "not measured", never a fabricated win.
 * - The rating tier additionally requires a real body of reviews behind the
 *   average, so a 5.0 built on two reviews is not celebrated as a rating
 *   achievement.
 * - Velocity is computed from the published dates of the imported review
 *   history, and is only evaluated when that history demonstrably covers both
 *   windows being compared. A partial import would understate the earlier
 *   window and manufacture a doubling that never happened.
 *
 * `streak_10` is deliberately never awarded here. Staff `streakDays` is seeded
 * in the demo workspace but never maintained by any real code path, so there is
 * currently no measured capture streak to celebrate. It stays unawarded until
 * there is one.
 */
import type { Milestone, MilestoneKind } from "@/lib/data/types";

const DAY_MS = 86_400_000;

/** Minimum reviews behind an average before a rating milestone means anything. */
export const RATING_MILESTONE_MIN_REVIEWS = 25;
/** Minimum reviews in the recent window before a doubling is signal, not noise. */
export const VELOCITY_MIN_RECENT = 4;
/** Minimum reviews in the earlier window, so the comparison has a real baseline. */
export const VELOCITY_MIN_BASELINE = 2;

export interface MilestoneEvidence {
  locationId: string;
  /** Measured Google review count from the latest sync. */
  reviewCount: number;
  /** Measured Google star rating from the latest sync. */
  rating: number;
  /** Imported review history — published dates are the only field read. */
  reviews: ReadonlyArray<{ publishedAt: string }>;
  /** Milestones already awarded; a kind is never awarded twice. */
  existing: ReadonlyArray<Pick<Milestone, "kind">>;
  /** Evaluation time. */
  now: Date;
}

const REVIEW_TIERS: ReadonlyArray<{ kind: MilestoneKind; at: number }> = [
  { kind: "reviews_25", at: 25 },
  { kind: "reviews_50", at: 50 },
  { kind: "reviews_100", at: 100 },
];

/** Reviews published inside `[from, to)`, ignoring rows without a usable date. */
function countBetween(reviews: MilestoneEvidence["reviews"], from: number, to: number): number {
  let n = 0;
  for (const review of reviews) {
    const at = new Date(review.publishedAt).getTime();
    if (Number.isNaN(at)) continue;
    if (at >= from && at < to) n += 1;
  }
  return n;
}

/** Oldest usable published date, or null when the history carries none. */
function earliestPublished(reviews: MilestoneEvidence["reviews"]): number | null {
  let oldest: number | null = null;
  for (const review of reviews) {
    const at = new Date(review.publishedAt).getTime();
    if (Number.isNaN(at)) continue;
    if (oldest === null || at < oldest) oldest = at;
  }
  return oldest;
}

export interface VelocityWindows {
  recent: number;
  baseline: number;
}

/**
 * Review counts for the last 30 days and the 30 before that, or null when the
 * imported history does not reach far enough back to compare them honestly.
 */
export function velocityWindows(
  reviews: MilestoneEvidence["reviews"],
  now: Date,
): VelocityWindows | null {
  const end = now.getTime();
  if (Number.isNaN(end)) return null;
  const recentStart = end - 30 * DAY_MS;
  const baselineStart = end - 60 * DAY_MS;
  const oldest = earliestPublished(reviews);
  // Without a review older than the baseline window we cannot tell an actual
  // acceleration from an import that simply starts partway through it.
  if (oldest === null || oldest > baselineStart) return null;
  return {
    recent: countBetween(reviews, recentStart, end + 1),
    baseline: countBetween(reviews, baselineStart, recentStart),
  };
}

function milestone(
  kind: MilestoneKind,
  locationId: string,
  title: string,
  subtitle: string,
  achievedAt: string,
): Milestone {
  // Deterministic id: re-running the award pass produces the same row, so an
  // idempotent insert can never duplicate a celebration.
  return { id: `ms_${kind}`, locationId, kind, title, subtitle, achievedAt, shared: false };
}

/**
 * Milestones earned but not yet recorded. Returns `[]` when nothing is newly
 * earned — including for every workspace that has no measured Google data.
 */
export function milestonesEarned(evidence: MilestoneEvidence): Milestone[] {
  const { locationId, reviewCount, rating, existing, now } = evidence;
  if (Number.isNaN(now.getTime())) return [];
  const at = now.toISOString();
  const already = new Set(existing.map((m) => m.kind));
  const earned: Milestone[] = [];

  for (const tier of REVIEW_TIERS) {
    if (already.has(tier.kind)) continue;
    if (!Number.isFinite(reviewCount) || reviewCount < tier.at) continue;
    earned.push(
      milestone(
        tier.kind,
        locationId,
        `${tier.at} reviews!`,
        `You crossed ${tier.at} Google reviews`,
        at,
      ),
    );
  }

  if (
    !already.has("rating_4_8") &&
    Number.isFinite(rating) &&
    rating >= 4.8 &&
    Number.isFinite(reviewCount) &&
    reviewCount >= RATING_MILESTONE_MIN_REVIEWS
  ) {
    earned.push(
      milestone(
        "rating_4_8",
        locationId,
        "4.8★ average",
        `${rating.toFixed(1)}★ across ${reviewCount} Google reviews`,
        at,
      ),
    );
  }

  if (!already.has("velocity_2x")) {
    const windows = velocityWindows(evidence.reviews, now);
    if (
      windows &&
      windows.baseline >= VELOCITY_MIN_BASELINE &&
      windows.recent >= VELOCITY_MIN_RECENT &&
      windows.recent >= windows.baseline * 2
    ) {
      earned.push(
        milestone(
          "velocity_2x",
          locationId,
          "Reviews doubled",
          `${windows.recent} new reviews in the last 30 days, up from ${windows.baseline} in the 30 before`,
          at,
        ),
      );
    }
  }

  return earned;
}
