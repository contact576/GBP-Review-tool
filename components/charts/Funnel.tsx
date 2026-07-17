import { cn } from "@/lib/utils/cn";
import { segmentColor } from "./tokens";

export interface FunnelStage {
  label: string;
  value: number;
  /**
   * Marks the TERMINAL milestone stage as gold ("earned"). Honoured only on the
   * last stage — routine conversion is never gold (DESIGN honesty). At most one
   * gold stage renders.
   */
  earned?: boolean;
}

/**
 * Staged funnel (e.g. Ask → drafted → posted → detected). Real proportional
 * widths, tabular counts, an honest step drop-off %, and text-labelled segments
 * (never colour-only). Exactly ONE gold terminal "earned" stage is allowed.
 *
 * Presentational; pass ordered stages in. Value-as-text via role="img".
 */
export function Funnel({
  stages,
  orientation = "vertical",
  showDropoff = true,
  title = "Funnel",
  formatValue = (n) => new Intl.NumberFormat("en").format(n),
  className,
}: {
  stages: FunnelStage[];
  orientation?: "vertical" | "horizontal";
  showDropoff?: boolean;
  title?: string;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const lastIndex = stages.length - 1;

  const isGold = (s: FunnelStage, i: number) => Boolean(s.earned) && i === lastIndex;
  const stepPct = (i: number) => {
    if (i === 0) return null;
    const prev = stages[i - 1]?.value ?? 0;
    const cur = stages[i]?.value ?? 0;
    return prev > 0 ? Math.round((cur / prev) * 100) : 0;
  };

  const ariaLabel =
    `${title}. ` +
    stages
      .map((s, i) => {
        const p = stepPct(i);
        return `${s.label}: ${formatValue(s.value)}${p !== null ? ` (${p}% of previous)` : ""}${
          isGold(s, i) ? ", earned milestone" : ""
        }`;
      })
      .join(", ");

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex items-end gap-2", className)} role="img" aria-label={ariaLabel}>
        {stages.map((s, i) => {
          const gold = isGold(s, i);
          const h = `${Math.max(6, (s.value / max) * 100)}%`;
          const p = stepPct(i);
          return (
            <div key={`${s.label}-${i}`} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-40 w-full items-end">
                <div
                  className={cn(
                    "w-full rounded-t-btn transition-all duration-350",
                    gold ? "bg-gold/85" : "bg-primary/85",
                  )}
                  style={{ height: h }}
                />
              </div>
              <div className="text-center">
                <div className={cn("text-[18px] font-extrabold tabular-nums leading-none", gold ? "text-gold-deep" : "text-ink")}>
                  {formatValue(s.value)}
                </div>
                <div className="kicker mt-1 normal-case">{s.label}</div>
                {showDropoff && p !== null ? (
                  <div className="data-chip mt-0.5 text-faint">{p}% of prev.</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical: centered bars narrowing down the funnel.
  return (
    <div className={cn("space-y-2.5", className)} role="img" aria-label={ariaLabel}>
      {stages.map((s, i) => {
        const gold = isGold(s, i);
        const w = `${Math.max(8, (s.value / max) * 100)}%`;
        const p = stepPct(i);
        return (
          <div key={`${s.label}-${i}`} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-right text-[12px] text-sub">{s.label}</span>
            <div className="flex-1">
              <div className="flex justify-center">
                <div
                  className={cn(
                    "flex h-9 items-center justify-center rounded-btn px-3 transition-all duration-350",
                    gold ? "bg-gold/90" : "bg-primary/85",
                  )}
                  style={{ width: w, minWidth: 44 }}
                >
                  <span className={cn("data-chip font-semibold tabular-nums", gold ? "text-gold-deep" : "text-white")}>
                    {formatValue(s.value)}
                  </span>
                </div>
              </div>
            </div>
            <span className="w-20 shrink-0 text-[11px]">
              {showDropoff && p !== null ? (
                <span className="data-chip text-faint">{p}% of prev.</span>
              ) : gold ? (
                <span className="data-chip text-gold-deep">Earned</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
