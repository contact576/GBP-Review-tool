import { cn } from "@/lib/utils/cn";
import { Sparkline } from "./Sparkline";
import { CHART } from "./tokens";

/**
 * Delta chip — arrow shows DIRECTION (sign), colour shows whether that
 * direction is FAVOURABLE for this metric (not raw up/down). A drop in 1–3★
 * volume is favourable → green with a down arrow. Meaning is carried by the
 * arrow + number + sr-only word, never colour alone.
 */
function DeltaChip({
  value,
  suffix = "%",
  favorableWhenUp = true,
  onHero = false,
}: {
  value: number;
  suffix?: string;
  favorableWhenUp: boolean;
  onHero?: boolean;
}) {
  const up = value >= 0;
  const favorable = up === favorableWhenUp;
  const color = onHero ? (favorable ? "#8FE3CE" : "#F0B7AC") : favorable ? "text-primary" : "text-danger";
  return (
    <span className={cn("inline-flex items-center gap-0.5 data-chip font-semibold", !onHero && color)} style={onHero ? { color } : undefined}>
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {up ? <path d="M12 20V4M6 10l6-6 6 6" /> : <path d="M12 4v16M6 14l6 6 6-6" />}
      </svg>
      <span className="sr-only">{up ? "up" : "down"}, {favorable ? "favorable" : "unfavorable"}, </span>
      <span className="tabular-nums">{Math.abs(value)}{suffix}</span>
    </span>
  );
}

/**
 * Canonical premium KPI cell: mono micro-label on top, huge tabular value, an
 * optional favourable-aware delta, and an optional bottom sparkline. Use this
 * as the app's stat cell (Dashboard, Benchmark, Analytics, Billing).
 *
 * Presentational. `boxless` drops the card chrome for spec-cell rows.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaSuffix = "%",
  favorableWhenUp = true,
  deltaCaption,
  spark,
  sparkColor,
  format = (n) => new Intl.NumberFormat("en").format(n),
  boxless = false,
  onHero = false,
  className,
}: {
  /** Mono micro-label (top). */
  label: string;
  /** Huge tabular value — number is formatted, strings pass through. */
  value: string | number;
  /** Signed delta; omit to hide. */
  delta?: number;
  deltaSuffix?: string;
  /** Whether an increase is the favourable direction for THIS metric. */
  favorableWhenUp?: boolean;
  deltaCaption?: string;
  spark?: number[];
  sparkColor?: string;
  format?: (n: number) => string;
  boxless?: boolean;
  onHero?: boolean;
  className?: string;
}) {
  const display = typeof value === "number" ? format(value) : value;

  const deltaText =
    typeof delta === "number"
      ? `, ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}${deltaSuffix} (${
          delta >= 0 === favorableWhenUp ? "favorable" : "unfavorable"
        })${deltaCaption ? ` ${deltaCaption}` : ""}`
      : "";
  const ariaLabel = `${label}: ${display}${deltaText}`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn(
        boxless
          ? "flex flex-col"
          : cn("rounded-card p-4 sm:p-5", onHero ? "bg-white/[0.06] border border-white/10" : "border border-hairline bg-card shadow-sm"),
        className,
      )}
    >
      <div className={cn("kicker normal-case", onHero && "text-white/60")}>{label}</div>

      <div
        className={cn(
          "mt-1.5 font-extrabold tabular-nums tracking-tight leading-none",
          "text-[32px] sm:text-[38px]",
          onHero ? "text-white" : "text-ink",
        )}
      >
        {display}
      </div>

      {typeof delta === "number" || deltaCaption ? (
        <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
          {typeof delta === "number" ? (
            <DeltaChip value={delta} suffix={deltaSuffix} favorableWhenUp={favorableWhenUp} onHero={onHero} />
          ) : null}
          {deltaCaption ? (
            <span className={cn("text-[12px]", onHero ? "text-white/50" : "text-faint")}>{deltaCaption}</span>
          ) : null}
        </div>
      ) : null}

      {spark && spark.length >= 2 ? (
        <div className="mt-3">
          <Sparkline data={spark} width={140} height={34} color={sparkColor ?? (onHero ? "#8FE3CE" : CHART.primary)} />
        </div>
      ) : null}
    </div>
  );
}
