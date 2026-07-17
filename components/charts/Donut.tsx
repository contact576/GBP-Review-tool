import { cn } from "@/lib/utils/cn";
import { CHART, segmentColor } from "./tokens";

export interface DonutSegment {
  /** Segment name — carried as text in the legend (never colour-only). */
  label: string;
  value: number;
  /** Force a specific paint (e.g. a neutral "Other"). Defaults to the green ramp. */
  color?: string;
}

/**
 * Donut / ring for genuine part-of-whole breakdowns (source, sentiment,
 * rating). Thin hairline track under up to ~5 rounded green-tint segments,
 * a big centered tabular KPI, and a compact label+value legend.
 *
 * Presentational: pass computed segments in. For a 2-way split prefer a
 * stacked bar or paired StatTiles — a 2-slice donut is chartjunk (see DESIGN).
 * Value-as-text via role="img" + aria-label; the SVG is decorative.
 */
export function Donut({
  segments,
  size = 168,
  thickness,
  centerValue,
  centerLabel,
  legend = true,
  title = "Breakdown",
  formatValue = (n) => new Intl.NumberFormat("en").format(n),
  onHero = false,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Big centered KPI (already formatted, e.g. a percentage or total). */
  centerValue?: string | number;
  /** Mono qualifier under the KPI. */
  centerLabel?: string;
  legend?: boolean;
  title?: string;
  formatValue?: (n: number) => string;
  onHero?: boolean;
  className?: string;
}) {
  const stroke = thickness ?? Math.round(size * 0.13);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const trackColor = onHero ? "rgba(255,255,255,0.16)" : CHART.hairline;

  // Small gap between segments so rounded caps read as separated pills.
  const gapPx = segments.length > 1 ? Math.min(circumference * 0.02, 8) : 0;

  // Precompute arc geometry (skips zero/empty slices).
  let offset = 0;
  const arcs = segments.map((s, i) => {
    const frac = total > 0 ? Math.max(0, s.value) / total : 0;
    const rawLen = frac * circumference;
    const len = Math.max(0, rawLen - gapPx);
    const arc = {
      key: `${s.label}-${i}`,
      color: s.color ?? segmentColor(i, onHero),
      dash: len,
      offset: -offset,
      show: rawLen > 0.5,
      pct: total > 0 ? Math.round(frac * 100) : 0,
    };
    offset += rawLen;
    return arc;
  });

  const ariaLabel =
    `${title}. ` +
    (total > 0
      ? segments
          .map((s) => `${s.label}: ${formatValue(s.value)} (${Math.round((Math.max(0, s.value) / total) * 100)}%)`)
          .join(", ")
      : "No data yet");

  const empty = total <= 0;

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)} role="img" aria-label={ariaLabel}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
          {!empty &&
            arcs.map((a) =>
              a.show ? (
                <circle
                  key={a.key}
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${a.dash} ${circumference - a.dash}`}
                  strokeDashoffset={a.offset}
                />
              ) : null,
            )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue !== undefined ? (
            <span
              className={cn(
                "font-extrabold tabular-nums tracking-tight leading-none",
                onHero ? "text-white" : "text-ink",
              )}
              style={{ fontSize: size * 0.24 }}
            >
              {centerValue}
            </span>
          ) : null}
          {centerLabel ? (
            <span className={cn("kicker mt-1", onHero && "text-white/70")}>{centerLabel}</span>
          ) : null}
        </div>
      </div>

      {legend ? (
        <ul className="flex flex-col gap-1.5">
          {segments.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: s.color ?? segmentColor(i, onHero) }}
              />
              <span className={cn("flex-1", onHero ? "text-white/80" : "text-sub")}>{s.label}</span>
              <span
                className={cn("tabular-nums font-semibold", onHero ? "text-white" : "text-ink")}
              >
                {formatValue(s.value)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
