import "server-only";
import type { DataProvider } from "@/lib/data/provider";
import type { FoundlyData, Milestone } from "@/lib/data/types";
import { milestonesEarned } from "./award";

/**
 * Record any milestone the measured data now supports, and tell the owner.
 *
 * Called after a Google sync — the only moment the review count and rating can
 * change — from both the daily monitor and the owner's manual sync, so a
 * milestone is never held back a day waiting for the cron.
 *
 * Writes are idempotent at every level (deterministic milestone ids, a
 * kind-uniqueness check in both providers, deterministic notification ids), so
 * running this on every sync cannot duplicate a celebration.
 */
export async function awardMilestones(input: {
  provider: DataProvider;
  workspaceId: string;
  data: FoundlyData;
  now: Date;
}): Promise<Milestone[]> {
  const { provider, workspaceId, data, now } = input;
  // The demo workspace ships with its own curated milestones; awarding against
  // seeded numbers would rewrite the demo rather than reflect a real business.
  if (data.workspace.isDemo) return [];

  const earned = milestonesEarned({
    locationId: data.location.id,
    reviewCount: data.location.reviewCount,
    rating: data.location.rating,
    reviews: data.reviews,
    existing: data.milestones ?? [],
    now,
  });
  if (!earned.length) return [];

  const at = now.toISOString();
  const recorded: Milestone[] = [];
  for (const milestone of earned) {
    try {
      await provider.appendMilestone(workspaceId, milestone);
      await provider.appendNotification(workspaceId, {
        // Tied to the milestone, so a re-run cannot post the same news twice.
        id: `ntf_${milestone.id}`,
        locationId: data.location.id,
        kind: "milestone",
        title: milestone.title,
        body: `${milestone.subtitle}. Open Milestones to share it.`,
        createdAt: at,
        read: false,
      });
      recorded.push(milestone);
    } catch {
      // A milestone is a celebration, not a critical write: never let one fail
      // the sync that produced the numbers behind it.
    }
  }
  return recorded;
}
