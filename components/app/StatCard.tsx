"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { Delta } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { formatNumber } from "@/lib/utils/format";

/** Honest action stat — "People who found you", etc. Never "customers gained". */
export function StatCard({
  label, icon, value, delta, spark,
}: {
  label: string;
  icon: IconName;
  value: number;
  delta: number;
  spark: number[];
}) {
  return (
    <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sub">
        <Icon name={icon} size={16} />
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-[30px] font-extrabold leading-none tabular-nums text-ink">{formatNumber(value)}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <Delta value={delta} />
            <span className="text-[12px] text-faint">vs previous 30 days</span>
          </div>
        </div>
        <Sparkline data={spark} width={72} height={32} />
      </div>
    </div>
  );
}
