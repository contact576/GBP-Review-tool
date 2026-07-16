import type { Milestone } from "@/lib/data/types";

/**
 * Copy + hero-number derivation for milestone share cards.
 *
 * A {@link Milestone} stores a human title/subtitle but no explicit hero
 * value, so we resolve a big celebratory number + unit label from its `kind`.
 * Live `rating` / `reviewCount` are used where they sharpen the headline
 * (e.g. the exact current rating), otherwise the milestone tier wins.
 */
export interface MilestoneHeadline {
  /** Big hero number, e.g. "25", "4.8", "2×". */
  value: string;
  /** Unit label under the hero, e.g. "Google reviews". */
  label: string;
  /** Short celebratory kicker line. */
  kicker: string;
  /** Whether to draw a star accent beside the hero (rating milestones). */
  star: boolean;
}

export function milestoneHeadline(
  milestone: Milestone,
  ctx?: { rating?: number; reviewCount?: number },
): MilestoneHeadline {
  switch (milestone.kind) {
    case "reviews_25":
      return { value: "25", label: "Google reviews", kicker: "Milestone unlocked", star: false };
    case "reviews_50":
      return { value: "50", label: "Google reviews", kicker: "Milestone unlocked", star: false };
    case "reviews_100":
      return { value: "100", label: "Google reviews", kicker: "Big milestone", star: false };
    case "rating_4_8":
      return {
        value: (ctx?.rating ?? 4.8).toFixed(1),
        label: "average star rating",
        kicker: "Top-rated",
        star: true,
      };
    case "velocity_2x":
      return { value: "2×", label: "faster review growth", kicker: "On a roll", star: false };
    case "streak_10":
      return { value: "10", label: "day capture streak", kicker: "Streak", star: false };
    default:
      return { value: String(ctx?.reviewCount ?? ""), label: "reviews", kicker: "Milestone", star: false };
  }
}

/** Filesystem-safe slug for the downloaded PNG. */
export function milestoneSlug(business: string, milestone: Milestone): string {
  const base = `${business}-${milestone.kind}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "milestone";
}
