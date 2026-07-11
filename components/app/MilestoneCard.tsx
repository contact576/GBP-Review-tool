import { Icon, type IconName } from "@/components/icons";
import type { Milestone } from "@/lib/data/types";

const KIND_ICON: Record<Milestone["kind"], IconName> = {
  reviews_25: "star", reviews_50: "star", reviews_100: "trophy",
  rating_4_8: "star-fill", velocity_2x: "trend", streak_10: "flame",
};

/** Shareable, watermarked celebration card. */
export function MilestoneCard({ milestone }: { milestone: Milestone }) {
  return (
    <div className="on-hero relative overflow-hidden rounded-card bg-hero p-6 text-white shadow-lg">
      <div className="absolute -right-6 -top-6 size-28 rounded-full bg-gold/15" />
      <div className="relative">
        <div className="mb-3 inline-grid size-12 place-items-center rounded-btn bg-gold text-hero">
          <Icon name={KIND_ICON[milestone.kind]} size={24} />
        </div>
        <div className="text-[26px] font-extrabold leading-tight">{milestone.title}</div>
        <div className="mt-1 text-[14px] text-white/80">{milestone.subtitle}</div>
        <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-3">
          <span className="text-[11px] text-white/60">
            {new Date(milestone.achievedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-white/90">
            <Icon name="sparkles" size={14} className="text-gold" /> Foundly
          </span>
        </div>
      </div>
    </div>
  );
}
