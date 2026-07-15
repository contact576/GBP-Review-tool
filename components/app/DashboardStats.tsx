import { StatCard } from "./StatCard";
import { MICROCOPY } from "@/lib/compliance/microcopy";

export interface StatData {
  found: { value: number; delta: number; spark: number[] };
  contacted: { value: number; delta: number; spark: number[] };
  reviews: { value: number; delta: number; spark: number[] };
}

export function DashboardStats({ stats }: { stats: StatData }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">How you&apos;re doing</h2>
        <span className="text-[12px] text-sub">Last 30 days vs previous 30 days</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={MICROCOPY.foundYouLabel} icon="eye" value={stats.found.value} delta={stats.found.delta} spark={stats.found.spark} />
        <StatCard label={MICROCOPY.contactedYouLabel} icon="phone" value={stats.contacted.value} delta={stats.contacted.delta} spark={stats.contacted.spark} />
        <StatCard label={MICROCOPY.newReviewsLabel} icon="star" value={stats.reviews.value} delta={stats.reviews.delta} spark={stats.reviews.spark} />
      </div>
      <p className="mt-2 text-[11px] text-faint">{MICROCOPY.actionsNotCustomers}</p>
    </div>
  );
}
