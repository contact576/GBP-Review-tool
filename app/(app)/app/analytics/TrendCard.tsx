"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ds/Card";
import { Icon } from "@/components/icons";
import { LineArea, type LinePoint } from "@/components/charts/LineArea";

const RANGES = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
] as const;

const nf = new Intl.NumberFormat("en");

/** Format an ISO date (YYYY-MM-DD) as a short mono axis label. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en", { month: "short", day: "numeric" });
}

/**
 * Favourable-aware delta chip: the arrow shows direction (sign), the colour
 * shows whether that direction is favourable for THIS metric (DESIGN §5).
 */
function FavDelta({ value, favorableWhenUp }: { value: number; favorableWhenUp: boolean }) {
  const up = value >= 0;
  const favorable = up === favorableWhenUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 data-chip font-semibold",
        favorable ? "text-primary" : "text-danger",
      )}
    >
      <Icon name={up ? "arrow-up" : "arrow-down"} size={12} />
      <span className="sr-only">
        {up ? "up" : "down"}, {favorable ? "favorable" : "unfavorable"}{" "}
      </span>
      <span className="tabular-nums">
        {Math.abs(value)}%
      </span>
    </span>
  );
}

/**
 * Trend chart card with the canonical anatomy (DESIGN-MAKEOVER §Analytics):
 * value + delta header, a single green-tint area body, and a segmented
 * timeframe footer. Client-owned so the timeframe can slice the series.
 */
export function TrendCard({
  kicker,
  label,
  series,
  favorableWhenUp = true,
}: {
  kicker: string;
  label: string;
  /** Full 90-day series; `label` is the ISO date, gaps stay `null`. */
  series: LinePoint[];
  favorableWhenUp?: boolean;
}) {
  const [days, setDays] = useState<number>(30);
  const view = series.slice(-days);

  const nums = view.map((p) => p.value).filter((v): v is number => v !== null);
  const first = nums[0] ?? 0;
  const latest = nums.length ? nums[nums.length - 1]! : 0;
  const pct = first === 0 ? 0 : Math.round(((latest - first) / first) * 100);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="kicker normal-case">{label}</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-[32px] font-extrabold leading-none tracking-tight tabular-nums text-ink">
              {nf.format(latest)}
            </span>
            {nums.length >= 2 ? <FavDelta value={pct} favorableWhenUp={favorableWhenUp} /> : null}
          </div>
          <p className="mt-1 data-chip text-faint">
            {kicker} · last {days} days
          </p>
        </div>
      </div>

      <div className="mt-4">
        <LineArea
          data={view}
          height={190}
          formatValue={(n) => nf.format(n)}
          formatLabel={shortDate}
          title={label}
        />
      </div>

      <div className="mt-3 flex items-center justify-end border-t border-hairline pt-3">
        <div
          className="inline-flex rounded-chip border border-hairline bg-card p-0.5"
          role="group"
          aria-label="Timeframe"
        >
          {RANGES.map((r) => {
            const on = days === r.days;
            return (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                aria-pressed={on}
                className={cn(
                  "min-h-[32px] rounded-chip px-3 py-1 text-[12px] font-semibold tabular-nums transition-colors",
                  on ? "bg-ink text-white" : "text-sub hover:text-ink",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
