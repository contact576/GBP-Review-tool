import { StatTile } from "@/components/charts";
import { Card, CardHeader } from "@/components/ds/Card";
import { MICROCOPY } from "@/lib/compliance/microcopy";

export interface StatData {
  found: { value: number; delta: number; spark: number[] };
  contacted: { value: number; delta: number; spark: number[] };
  reviews: { value: number; delta: number; spark: number[] };
}

/**
 * Three honest metrics as boxless spec-cells inside one hairline-divided
 * readout: mono micro-label / huge tabular value / favourable-aware delta /
 * bottom sparkline. All three favour an increase. "found you / contacted you".
 */
export function DashboardStats({ stats }: { stats: StatData }) {
  return (
    <Card>
      <CardHeader
        kicker="Last 30 days"
        title="How you're doing"
        action={<span className="hidden text-[13px] text-sub sm:inline">vs previous 30 days</span>}
      />

      <div className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StatTile
          boxless
          className="py-4 first:pt-0 sm:px-5 sm:py-0 sm:first:pl-0"
          label={MICROCOPY.foundYouLabel}
          value={stats.found.value}
          delta={stats.found.delta}
          spark={stats.found.spark}
        />
        <StatTile
          boxless
          className="py-4 sm:px-5 sm:py-0"
          label={MICROCOPY.contactedYouLabel}
          value={stats.contacted.value}
          delta={stats.contacted.delta}
          spark={stats.contacted.spark}
        />
        <StatTile
          boxless
          className="py-4 last:pb-0 sm:px-5 sm:py-0 sm:last:pr-0"
          label={MICROCOPY.newReviewsLabel}
          value={stats.reviews.value}
          delta={stats.reviews.delta}
          spark={stats.reviews.spark}
        />
      </div>

      <p className="mt-4 border-t border-hairline pt-3 text-[12px] text-faint">
        {MICROCOPY.actionsNotCustomers}
      </p>
    </Card>
  );
}
