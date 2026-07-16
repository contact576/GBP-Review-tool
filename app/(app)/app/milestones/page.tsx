import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { ReferralCard } from "@/components/app/ReferralCard";
import { ShareMilestone } from "./ShareMilestone";

export default async function MilestonesPage() {
  const data = await getData();
  const milestones = data.milestones ?? [];
  const location = data.location;
  const reviewCount = location.reviewCount;

  // Next review milestone teaser.
  const tiers = [25, 50, 100];
  const nextTier = tiers.find((t) => reviewCount < t) ?? tiers[tiers.length - 1] ?? 50;
  const prevTier = tiers.filter((t) => t <= reviewCount).pop() ?? 0;
  const span = nextTier - prevTier || nextTier;
  const progress = Math.min(100, Math.max(0, Math.round(((reviewCount - prevTier) / span) * 100)));
  const remaining = Math.max(0, nextTier - reviewCount);

  return (
    <div className="space-y-5">
      <PageHeader title="Milestones" sub="Real wins worth celebrating — and sharing." />

      {/* Next milestone teaser */}
      <Card className="border-primary/30 bg-primary-wash/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-gold text-hero">
              <Icon name="trophy" size={20} />
            </div>
            <div>
              <div className="text-[16px] font-bold text-ink">Next up: {nextTier} reviews</div>
              <p className="mt-0.5 text-[14px] text-sub">
                {remaining > 0
                  ? `You're ${remaining} review${remaining === 1 ? "" : "s"} away — keep the request habit going.`
                  : "You've crossed every milestone here. Incredible."}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-primary-dark">
            {reviewCount}/{nextTier}
          </span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/70">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      {/* Milestone grid */}
      {milestones.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {milestones.map((m) => (
            <ShareMilestone
              key={m.id}
              milestone={m}
              business={location.name}
              rating={location.rating}
              reviewCount={location.reviewCount}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon="trophy"
            title="Your first milestone is on the way…"
            description={
              remaining > 0
                ? `Your first shareable celebration unlocks at ${nextTier} reviews — just ${remaining} to go.`
                : "Your first celebration unlocks at 25 reviews — you're closer than you think."
            }
          />
        </Card>
      )}

      <div className="flex items-center gap-2 px-1">
        <Icon name="shield" size={14} className="text-faint" />
        <p className="text-[13px] text-faint">Milestones fire on genuine achievements — never fabricated.</p>
      </div>

      <ReferralCard />
    </div>
  );
}
