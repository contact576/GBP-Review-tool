import { cn } from "@/lib/utils/cn";

type MeterTone = "green" | "gold" | "danger";

const fillTone: Record<MeterTone, string> = {
  green: "bg-primary",
  gold: "bg-gold",
  danger: "bg-danger",
};
const textTone: Record<MeterTone, string> = {
  green: "text-primary-dark",
  gold: "text-gold-deep",
  danger: "text-danger",
};

/**
 * Quiet green usage / progress bar. Single tinted fill, rounded caps,
 * value-as-text. Uses role="progressbar" so the value is exposed natively.
 *
 * Colour intent:
 *  - default is always green.
 *  - `nearLimitAt` (fraction) auto-switches the fill to `nearLimitTone` when
 *    usage crosses it. Per DESIGN, routine usage near/over quota should be
 *    "danger" (the default) — gold is reserved for genuine earned thresholds,
 *    so pass `nearLimitTone="gold"` only for a positive milestone meter.
 *  - `tone` hard-overrides everything.
 */
export function ProgressMeter({
  value,
  max = 100,
  label,
  valueText,
  showValue = true,
  tone,
  nearLimitAt,
  nearLimitTone = "danger",
  height = 8,
  formatValue = (n) => new Intl.NumberFormat("en").format(n),
  unit = "",
  onHero = false,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  /** Custom value-as-text, e.g. "820 / 1,000 requests". Overrides the default. */
  valueText?: string;
  showValue?: boolean;
  /** Hard colour override. */
  tone?: MeterTone;
  /** Fraction 0–1; crossing it switches the fill to `nearLimitTone`. */
  nearLimitAt?: number;
  nearLimitTone?: "gold" | "danger";
  height?: number;
  formatValue?: (n: number) => string;
  unit?: string;
  onHero?: boolean;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const frac = Math.max(0, Math.min(1, value / safeMax));
  const pct = Math.round(frac * 100);

  const resolvedTone: MeterTone =
    tone ?? (nearLimitAt !== undefined && frac >= nearLimitAt ? nearLimitTone : "green");

  const defaultText = `${formatValue(value)}${unit} of ${formatValue(safeMax)}${unit}`;
  const readout = valueText ?? defaultText;

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label ? (
            <span className={cn("text-[13px] font-medium", onHero ? "text-white/80" : "text-ink")}>{label}</span>
          ) : (
            <span />
          )}
          {showValue ? (
            <span className={cn("data-chip tabular-nums", onHero ? "text-white" : textTone[resolvedTone])}>
              {readout}
            </span>
          ) : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={value}
        aria-valuetext={readout}
        aria-label={label}
        className={cn("w-full overflow-hidden rounded-chip", onHero ? "bg-white/15" : "bg-primary-wash")}
        style={{ height }}
      >
        <div
          className={cn(
            "h-full rounded-chip transition-[width] duration-350",
            onHero ? "bg-white" : fillTone[resolvedTone],
          )}
          style={{ width: `${Math.max(frac > 0 ? 4 : 0, pct)}%` }}
        />
      </div>
    </div>
  );
}
