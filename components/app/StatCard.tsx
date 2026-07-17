import { StatTile } from "@/components/charts";

/**
 * Honest action stat — "People who found you", never "customers gained".
 *
 * Now a thin adapter over the canonical {@link StatTile} spec-cell (mono
 * micro-label / huge tabular value / favourable-aware delta arrow / bottom
 * sparkline). Pass `boxless` for hairline-divided spec rows; omit it for a
 * self-contained card.
 */
export function StatCard({
  label, value, delta, spark, favorableWhenUp = true, boxless = false, className,
}: {
  label: string;
  value: number;
  delta: number;
  spark: number[];
  /** Whether an increase is the favourable direction for THIS metric. */
  favorableWhenUp?: boolean;
  boxless?: boolean;
  className?: string;
}) {
  return (
    <StatTile
      label={label}
      value={value}
      delta={delta}
      favorableWhenUp={favorableWhenUp}
      spark={spark}
      boxless={boxless}
      className={className}
    />
  );
}
