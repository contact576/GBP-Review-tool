import { getProviderFor, getSessionAndData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { ProgressMeter } from "@/components/charts";
import { ReferralCard } from "@/components/app/ReferralCard";
import { ShareMilestone } from "./ShareMilestone";
import { formatDate } from "@/lib/utils/format";
import type { Milestone } from "@/lib/data/types";
import { createReferralCode } from "@/lib/referrals/code";
import { appUrl } from "@/lib/utils/app-url";

const KIND_ICON: Record<Milestone["kind"], IconName> = {
  reviews_25: "star", reviews_50: "star", reviews_100: "trophy",
  rating_4_8: "star-fill", velocity_2x: "trend", streak_10: "flame",
};

export default async function MilestonesPage() {
  const { data, session } = await getSessionAndData();
  const provider = await getProviderFor(session);
  const referralSummary = await provider.getReferralSummary(session.workspaceId);
  const referralLink = `${await appUrl()}/sign-up?ref=${encodeURIComponent(createReferralCode(session.workspaceId))}`;
  const location = data.location;
  const reviewCount = location.reviewCount;

  // Timeline runs newest-first — most recent win at the top.
  const milestones = [...(data.milestones ?? [])].sort(
    (a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime(),
  );

  // Next review milestone teaser.
  const tiers = [25, 50, 100];
  const nextTier = tiers.find((t) => reviewCount < t) ?? tiers[tiers.length - 1] ?? 50;
  const remaining = Math.max(0, nextTier - reviewCount);

  return (
    <div className="space-y-5">
      <PageHeader title="Milestones" sub="Real wins worth celebrating — and sharing." />

      {/* Next milestone teaser */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-gold-tint text-gold-deep">
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
          <span className="shrink-0 data-chip font-semibold text-ink">
            {reviewCount}/{nextTier}
          </span>
        </div>
        <ProgressMeter
          className="mt-3"
          value={reviewCount}
          max={nextTier}
          valueText={`${reviewCount} of ${nextTier} reviews toward the next milestone`}
          showValue={false}
        />
      </Card>

      {/* Milestone timeline */}
      {milestones.length ? (
        <ol className="relative">
          {milestones.map((m, i) => {
            const isLast = i === milestones.length - 1;
            return (
              <li key={m.id} className="relative flex gap-4 sm:gap-5">
                {/* Rail: node + connector */}
                <div className="relative flex w-9 shrink-0 flex-col items-center">
                  <div className="z-10 grid size-9 shrink-0 place-items-center rounded-full bg-hero text-gold ring-4 ring-paper">
                    <Icon name={KIND_ICON[m.kind]} size={17} />
                  </div>
                  {!isLast ? <div className="w-px flex-1 bg-hairline" /> : null}
                </div>

                {/* Card + achieved date */}
                <div className={isLast ? "min-w-0 flex-1" : "min-w-0 flex-1 pb-6"}>
                  <div className="kicker mb-1.5 flex items-center gap-1.5 normal-case">
                    <Icon name="check-circle" size={12} className="text-primary" />
                    Achieved {formatDate(m.achievedAt)}
                  </div>
                  <ShareMilestone
                    milestone={m}
                    business={location.name}
                    rating={location.rating}
                    reviewCount={location.reviewCount}
                  />
                </div>
              </li>
            );
          })}
        </ol>
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

      <ReferralCard link={referralLink} summary={referralSummary} />
    </div>
  );
}
